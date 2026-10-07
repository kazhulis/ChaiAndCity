import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { assertProductionConfig, config } from './config.js';
import { MakeCommerceService, calculateTotal, verifyMac } from './services/makecommerceService.js';
import { MakeCommerceShippingService, isShippingEnabled, parseOptionId } from './services/makecommerceShippingService.js';
import { SwotzyService } from './services/swotzyService.js';
import { WooCommerceService } from './services/woocommerceService.js';
import { getOrder, saveOrder, updateOrder } from './store.js';
import { validateOrder } from './validation.js';

assertProductionConfig();
const app = express();
const woocommerce = new WooCommerceService();
const swotzy = new SwotzyService();
const makecommerce = new MakeCommerceService();
app.set('trust proxy', true);

const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:5173',
];

app.use(cors({
  origin: allowedOrigins,
}));
app.use(express.json({ verify: (request, _response, buffer) => { request.rawBody = buffer; } }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', (_request, response) => response.json({ ok: true, environment: config.nodeEnv }));

const mcShipping = new MakeCommerceShippingService();

const FALLBACK_OPTIONS = [
  { id: 'pickuppoint:omniva', type: 'pickuppoint', carrier: 'omniva', name: 'Omniva pakomāts', price: 2.99 },
  { id: 'pickuppoint:dpd', type: 'pickuppoint', carrier: 'dpd', name: 'DPD pakomāts', price: 2.99 },
  { id: 'courier:dpd', type: 'courier', carrier: 'dpd', name: 'DPD kurjers', price: 5.9 },
];

async function loadShippingOptions(itemCount = 1) {
  if (!isShippingEnabled()) return swotzy.getShippingOptions();
  const count = Math.max(1, Math.min(Number.parseInt(itemCount, 10) || 1, 100));
  try {
    const options = await mcShipping.getShippingOptions(count * config.makecommerce.itemWeightGrams);
    if (options.length) return options;
    console.warn('MakeCommerce returned no shipping rates; complete the Shipping setup. Using fallback options.');
  } catch (error) {
    console.error('MakeCommerce rates failed; using fallback options:', error.message);
  }
  return FALLBACK_OPTIONS;
}

app.get('/api/shipping/options', async (request, response, next) => {
  try { response.json(await loadShippingOptions(request.query.items)); } catch (error) { next(error); }
});

app.get('/api/shipping/lockers', async (request, response, next) => {
  try {
    if (!isShippingEnabled()) return response.json(await swotzy.getParcelLockers());
    const { type, carrier } = parseOptionId(request.query.method);
    if (type !== 'pickuppoint') return response.json([]);
    response.json(await mcShipping.getPickupPoints(carrier));
  } catch (error) { next(error); }
});

app.post('/api/payments/sessions', async (request, response, next) => {
  try {
    validateOrder(request.body);
    const consentAcceptedAt = new Date().toISOString();
    const orderRequest = { ...request.body, consentAcceptedAt };
    const wooOrder = await woocommerce.createOrder(orderRequest);
    const order = saveOrder({
      id: wooOrder.id,
      wooCommerceOrderId: wooOrder.id,
      status: 'pending',
      paymentStatus: 'pending',
      shippingStatus: 'not_created',
      paymentUrl: wooOrder.payment_url || null,
      customer: orderRequest.customer,
      delivery: orderRequest.delivery,
      items: orderRequest.items,
      termsAccepted: orderRequest.termsAccepted,
      privacyAccepted: orderRequest.privacyAccepted,
      consentAcceptedAt,
      createdAt: new Date().toISOString(),
    });
    if (config.makecommerce.enabled) {
      const { total } = calculateTotal(orderRequest, await loadShippingOptions(orderRequest.items.reduce((sum, item) => sum + item.quantity, 0)));
      const transaction = await makecommerce.createTransaction({
        orderId: order.id,
        amount: total,
        customer: orderRequest.customer,
        ip: request.ip,
        locale: 'lv',
      });
      updateOrder(order.id, { paymentUrl: transaction.paymentUrl, transactionId: transaction.transactionId, amount: total });
      order.paymentUrl = transaction.paymentUrl;
    }
    response.status(201).json({ orderId: order.id, checkoutUrl: order.paymentUrl, status: order.status });
  } catch (error) { next(error); }
});

app.get('/api/orders/:orderId', async (request, response, next) => {
  try {
    const localOrder = getOrder(request.params.orderId);
    const wooOrder = await woocommerce.getOrder(request.params.orderId);
    if (!localOrder && !wooOrder) return response.status(404).json({ message: 'Pasūtījums nav atrasts.' });
    response.json({ ...localOrder, status: wooOrder?.status || localOrder?.status, paymentStatus: wooOrder?.date_paid ? 'paid' : localOrder?.paymentStatus });
  } catch (error) { next(error); }
});

function verifySignature(request, secret, headerName) {
  if (!secret) return config.nodeEnv !== 'production';
  const received = request.header(headerName);
  if (!received || !request.rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(request.rawBody).digest('base64');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

app.post('/api/webhooks/woocommerce', async (request, response, next) => {
  try {
    if (!verifySignature(request, config.webhookSecrets.woocommerce, 'x-wc-webhook-signature')) return response.status(401).json({ message: 'Invalid webhook signature.' });
    const order = request.body;
    if (order.id) {
      const paymentStatus = order.date_paid || ['processing', 'completed'].includes(order.status) ? 'paid' : order.status;
      updateOrder(order.id, { status: order.status, paymentStatus });
      if (paymentStatus === 'paid') {
        const localOrder = getOrder(order.id);
        if (localOrder && localOrder.shippingStatus === 'not_created') {
          const shipment = await swotzy.createShipment(localOrder);
          updateOrder(order.id, { shippingStatus: shipment.status, swotzyShipmentId: shipment.shipmentId });
        }
      }
    }
    response.json({ received: true });
  } catch (error) { next(error); }
});

async function markPaid(orderId) {
  const order = getOrder(orderId);
  if (!order || order.paymentStatus === 'paid') return;
  updateOrder(orderId, { status: 'processing', paymentStatus: 'paid' });
  await woocommerce.markPaid(orderId);
  if (order.shippingStatus === 'not_created') {
    const shipment = await swotzy.createShipment(getOrder(orderId));
    updateOrder(orderId, { shippingStatus: shipment.status, swotzyShipmentId: shipment.shipmentId });
  }
}

function parseSigned(body) {
  if (!verifyMac(body?.json, body?.mac)) return null;
  try { return JSON.parse(body.json); } catch { return null; }
}

function redirectToShop(response, status, orderId) {
  const url = `${config.frontendUrl.replace(/\/$/, '')}/#/maksajums?status=${status}&order=${encodeURIComponent(orderId || '')}`;
  response.redirect(303, url);
}

// MakeCommerce POSTs the customer back here with form fields `json` and `mac`.
async function handleReturn(request, response, fallbackStatus) {
  const message = parseSigned(request.body);
  if (!message) return redirectToShop(response, 'failed', '');
  const completed = ['COMPLETED', 'APPROVED'].includes(message.status);
  redirectToShop(response, completed ? 'success' : fallbackStatus, message.reference);
}
app.post('/api/payments/return', (request, response) => handleReturn(request, response, 'pending'));
app.post('/api/payments/cancel', (request, response) => handleReturn(request, response, 'cancelled'));

app.post('/api/webhooks/makecommerce', async (request, response) => {
  const message = parseSigned(request.body);
  if (!message) return response.status(401).json({ message: 'Invalid signature.' });
  response.status(200).json({ received: true });
  try {
    const order = getOrder(message.reference);
    const amountMatches = order && Number(message.amount) === Number(order.amount?.toFixed(2));
    if (['COMPLETED', 'APPROVED'].includes(message.status) && amountMatches) await markPaid(message.reference);
    else if (order && ['CANCELLED', 'EXPIRED', 'FAILED'].includes(message.status)) updateOrder(message.reference, { paymentStatus: message.status.toLowerCase() });
  } catch (error) { console.error('MakeCommerce notification handling failed', error); }
});

app.post('/api/webhooks/payment', (request, response) => {
  if (!verifySignature(request, config.webhookSecrets.payment, 'x-payment-signature')) return response.status(401).json({ message: 'Invalid webhook signature.' });
  response.status(202).json({ received: true, message: 'Configure the provider-specific event mapping here.' });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(400).json({ message: error.message || 'Server error.' });
});

app.listen(config.port, () => console.log(`CHAI AND CITY API listening on http://localhost:${config.port}`));
