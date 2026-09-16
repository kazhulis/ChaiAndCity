import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { assertProductionConfig, config } from './config.js';
import { SwotzyService } from './services/swotzyService.js';
import { WooCommerceService } from './services/woocommerceService.js';
import { getOrder, saveOrder, updateOrder } from './store.js';
import { validateOrder } from './validation.js';

assertProductionConfig();
const app = express();
const woocommerce = new WooCommerceService();
const swotzy = new SwotzyService();

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json({ verify: (request, _response, buffer) => { request.rawBody = buffer; } }));

app.get('/api/health', (_request, response) => response.json({ ok: true, environment: config.nodeEnv }));

app.get('/api/shipping/options', async (_request, response, next) => {
  try { response.json(await swotzy.getShippingOptions()); } catch (error) { next(error); }
});

app.get('/api/shipping/lockers', async (_request, response, next) => {
  try { response.json(await swotzy.getParcelLockers()); } catch (error) { next(error); }
});

app.post('/api/payments/sessions', async (request, response, next) => {
  try {
    validateOrder(request.body);
    const wooOrder = await woocommerce.createOrder(request.body);
    const order = saveOrder({
      id: wooOrder.id,
      wooCommerceOrderId: wooOrder.id,
      status: 'pending',
      paymentStatus: 'pending',
      shippingStatus: 'not_created',
      paymentUrl: wooOrder.payment_url || null,
      customer: request.body.customer,
      delivery: request.body.delivery,
      items: request.body.items,
      createdAt: new Date().toISOString(),
    });
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

app.post('/api/webhooks/payment', (request, response) => {
  if (!verifySignature(request, config.webhookSecrets.payment, 'x-payment-signature')) return response.status(401).json({ message: 'Invalid webhook signature.' });
  response.status(202).json({ received: true, message: 'Configure the provider-specific event mapping here.' });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(400).json({ message: error.message || 'Server error.' });
});

app.listen(config.port, () => console.log(`CHAI AND CITY API listening on http://localhost:${config.port}`));
