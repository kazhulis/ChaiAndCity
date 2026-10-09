import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { assertProductionConfig, config } from './config.js';
import { ValidationError } from './errors.js';
import { rateLimit } from './rateLimit.js';
import { MakeCommerceService, calculateTotal, verifyMac } from './services/makecommerceService.js';
import { MakeCommerceShippingService, isShippingCountrySupported, isShippingEnabled, parseOptionId } from './services/makecommerceShippingService.js';
import { SwotzyService } from './services/swotzyService.js';
import { WooCommerceService } from './services/woocommerceService.js';
import { getOrder, saveOrder, updateOrder } from './store.js';
import { validateOrder } from './validation.js';

assertProductionConfig();
const app = express();
const woocommerce = new WooCommerceService();
const swotzy = new SwotzyService();
const makecommerce = new MakeCommerceService();
app.set('trust proxy', 1);

const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:5173',
];

app.use(cors({
  origin: allowedOrigins,
}));
app.use(express.json({ verify: (request, _response, buffer) => { request.rawBody = buffer; } }));
app.use(express.urlencoded({ extended: false }));

const readLimiter = rateLimit({ windowMs: 60_000, max: 120 });
const checkoutLimiter = rateLimit({ windowMs: 10 * 60_000, max: 15 });
app.use('/api/shipping', readLimiter);
app.use('/api/orders', readLimiter);

app.get('/api/health', (_request, response) => response.json({ ok: true, environment: config.nodeEnv }));

const mcShipping = new MakeCommerceShippingService();

async function loadShippingOptions(itemCount = 1, country = config.makecommerce.country) {
  if (!isShippingCountrySupported(country)) throw new ValidationError('Neatbalstīta piegādes valsts.');
  if (!isShippingEnabled()) return swotzy.getShippingOptions();
  const count = Math.max(1, Math.min(Number.parseInt(itemCount, 10) || 1, 100));
  return mcShipping.getShippingOptions(count * config.makecommerce.itemWeightGrams, country);
}

app.get('/api/shipping/countries', (_request, response) => {
  const displayNames = new Intl.DisplayNames(['lv'], { type: 'region' });
  response.json(config.makecommerce.shippingCountries.map((code) => ({ code, name: displayNames.of(code) || code })));
});

app.get('/api/shipping/options', async (request, response, next) => {
  try { response.json(await loadShippingOptions(request.query.items, request.query.country)); } catch (error) { next(error); }
});

app.get('/api/shipping/lockers', async (request, response, next) => {
  try {
    if (!isShippingEnabled()) return response.json(await swotzy.getParcelLockers());
    const { type, carrier } = parseOptionId(request.query.method);
    if (type !== 'pickuppoint') return response.json([]);
    if (!isShippingCountrySupported(request.query.country)) throw new ValidationError('Neatbalstīta piegādes valsts.');
    response.json(await mcShipping.getPickupPoints(carrier, request.query.country));
  } catch (error) { next(error); }
});

app.post('/api/payments/sessions', checkoutLimiter, async (request, response, next) => {
  try {
    validateOrder(request.body);
    const consentAcceptedAt = new Date().toISOString();
    const itemCount = request.body.items.reduce((sum, item) => sum + item.quantity, 0);
    // Price and shipping are always computed server-side; client-supplied amounts are ignored.
    const { shipping, total } = calculateTotal(request.body, await loadShippingOptions(itemCount, request.body.delivery.country));
    const orderRequest = { ...request.body, delivery: { ...request.body.delivery, cost: shipping }, consentAcceptedAt };
    const wooOrder = await woocommerce.createOrder(orderRequest);
    if (wooOrder.total !== undefined && Math.abs(Number(wooOrder.total) - total) > 0.01) {
      console.warn(`Order ${wooOrder.id}: WooCommerce total ${wooOrder.total} differs from charged total ${total.toFixed(2)}.`);
    }
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
      const transaction = await makecommerce.createTransaction({
        orderId: order.id,
        amount: total,
        customer: orderRequest.customer,
        ip: request.ip,
        country: orderRequest.delivery.country.toLowerCase(),
        locale: 'lv',
      });
      updateOrder(order.id, { paymentUrl: transaction.paymentUrl, transactionId: transaction.transactionId, amount: total });
      order.paymentUrl = transaction.paymentUrl;
    }
    response.status(201).json({ orderId: order.id, checkoutUrl: order.paymentUrl, status: order.status });
  } catch (error) { next(error); }
});

app.get('/api/orders/:orderId', (request, response) => {
  const order = getOrder(request.params.orderId);
  if (!order) return response.status(404).json({ message: 'Pasūtījums nav atrasts.' });
  response.json({ status: order.status, paymentStatus: order.paymentStatus });
});

function verifySignature(request, secret, headerName) {
  if (!secret) return false;
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
  // Update WooCommerce first so a failed call can be retried by the next MakeCommerce notification.
  await woocommerce.markPaid(orderId);
  updateOrder(orderId, { status: 'processing', paymentStatus: 'paid' });
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
    const transactionMatches = order && (!message.transaction || message.transaction === order.transactionId);
    const currencyMatches = !message.currency || message.currency === 'EUR';
    if (['COMPLETED', 'APPROVED'].includes(message.status) && amountMatches && transactionMatches && currencyMatches) await markPaid(message.reference);
    else if (order && order.paymentStatus !== 'paid' && transactionMatches && ['CANCELLED', 'EXPIRED', 'FAILED'].includes(message.status)) updateOrder(message.reference, { paymentStatus: message.status.toLowerCase() });
  } catch (error) { console.error('MakeCommerce notification handling failed', error); }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  if (error instanceof ValidationError) return response.status(400).json({ message: error.message });
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return response.status(400).json({ message: 'Nederīgs pieprasījums.' });
  response.status(500).json({ message: 'Radās kļūda. Lūdzu, mēģini vēlreiz vēlāk.' });
});

app.listen(config.port, () => console.log(`CHAI AND CITY API listening on http://localhost:${config.port}`));
