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
const shippingSetupLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5 });
app.use('/api/shipping', readLimiter);
app.use('/api/orders', readLimiter);
app.use('/api/products', readLimiter);

app.get('/api/products/prices', async (_request, response, next) => {
  try { response.json(await woocommerce.getPriceDetails()); } catch (error) { next(error); }
});

app.get('/api/health', (_request, response) => response.json({ ok: true, environment: config.nodeEnv }));

const mcShipping = new MakeCommerceShippingService();

// SHIPPING_PROVIDER=makecommerce (default) or swotzy decides who supplies rates, pickup points and shipments.
const useSwotzyShipping = config.shippingProvider === 'swotzy';

// Never silently fall back to mock shipping or a different provider.
async function createShipment(order) {
  if (useSwotzyShipping) {
    if (!config.swotzy.enabled) throw new Error('Swotzy shipping is not enabled.');
    return swotzy.createShipment(order);
  }
  if (!isShippingEnabled()) throw new Error('MakeCommerce Shipping is not enabled.');
  return mcShipping.createShipment(order);
}

// Persist the claim before contacting a provider. A crashed/uncertain attempt must
// be reconciled manually rather than risk purchasing a duplicate shipment.
async function ensureShipment(orderId) {
  const order = getOrder(orderId);
  if (!order || order.paymentStatus !== 'paid' || order.shippingStatus !== 'not_created') return;
  updateOrder(orderId, { shippingStatus: 'creating', shippingAttemptedAt: new Date().toISOString() });
  try {
    const shipment = await createShipment(order);
    if (!shipment?.status || String(shipment.shipmentId || '').startsWith('mock-')) {
      throw new Error('Shipping provider did not confirm shipment creation.');
    }
    updateOrder(orderId, {
      shippingStatus: shipment.status,
      shipmentId: shipment.shipmentId || null,
      shipmentProvider: config.shippingProvider,
      shipmentCreatedAt: new Date().toISOString(),
      shipmentError: null,
    });
  } catch (error) {
    updateOrder(orderId, {
      shippingStatus: 'requires_review',
      shipmentError: String(error?.message || error).slice(0, 500),
    });
    console.error(`Shipment for order ${orderId} requires manual reconciliation:`, error);
    throw error;
  }
}

async function loadShippingOptions(itemCount = 1, country = config.makecommerce.country, method, parcelshopId) {
  if (!isShippingCountrySupported(country)) throw new ValidationError('Neatbalstīta piegādes valsts.');
  if (useSwotzyShipping) {
    if (!config.swotzy.enabled) throw new Error('Swotzy shipping is not enabled.');
    return swotzy.getShippingOptions(country, itemCount, method, parcelshopId);
  }
  if (!isShippingEnabled()) throw new Error('MakeCommerce Shipping is not enabled.');
  const count = Math.max(1, Math.min(Number.parseInt(itemCount, 10) || 1, 100));
  return mcShipping.getShippingOptions(count * config.makecommerce.itemWeightGrams, country);
}

app.get('/api/shipping/countries', (_request, response) => {
  const displayNames = new Intl.DisplayNames(['lv'], { type: 'region' });
  response.json(config.makecommerce.shippingCountries.map((code) => ({ code, name: displayNames.of(code) || code })));
});

app.post('/api/shipping/setup', shippingSetupLimiter, async (request, response, next) => {
  try {
    const setupToken = config.makecommerce.shippingSetupToken;
    const suppliedToken = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!setupToken) return response.status(503).json({ message: 'MakeCommerce pārvadājumu iestatīšana nav aktivizēta.' });
    if (setupToken.length < 32) return response.status(503).json({ message: 'Iestatīšanas tokenam jābūt vismaz 32 rakstzīmju garam.' });
    if (!suppliedToken) return response.status(401).json({ message: 'Ievadiet derīgu iestatīšanas tokenu.' });
    const expected = Buffer.from(setupToken);
    const received = Buffer.from(suppliedToken);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      return response.status(401).json({ message: 'Ievadiet derīgu iestatīšanas tokenu.' });
    }
    if (!isShippingEnabled()) return response.status(503).json({ message: 'MakeCommerce Shipping API nav aktivizēts.' });
    const shopUrl = new URL(config.frontendUrl);
    if (shopUrl.protocol !== 'https:' || shopUrl.hostname === 'localhost') {
      throw new ValidationError('Iestatīšanai nepieciešams veikala publiskais HTTPS URL.');
    }
    const connection = await mcShipping.connectShop(shopUrl.origin);
    if (typeof connection?.jwt !== 'string' || !connection.jwt) {
      throw new Error('MakeCommerce connected the shop but did not return a Shipping Manager token.');
    }
    const managerUrl = new URL('/public/ui/', config.makecommerce.shippingManagerUrl);
    managerUrl.searchParams.set('jwt', connection.jwt);
    managerUrl.searchParams.set('locale', 'en');
    managerUrl.searchParams.set('platform', 'Custom');
    response.json({ managerUrl: managerUrl.toString() });
  } catch (error) { next(error); }
});

app.get('/api/shipping/options', async (request, response, next) => {
  try {
    if (Boolean(request.query.method) !== Boolean(request.query.parcelshop)) {
      throw new ValidationError('Lai aprēķinātu pakomāta cenu, jānorāda pārvadātājs un pakomāts.');
    }
    response.json(await loadShippingOptions(request.query.items, request.query.country, request.query.method, request.query.parcelshop));
  } catch (error) { next(error); }
});

app.get('/api/shipping/lockers', async (request, response, next) => {
  try {
    if (useSwotzyShipping || !isShippingEnabled()) {
      if (!isShippingCountrySupported(request.query.country)) throw new ValidationError('Neatbalstīta piegādes valsts.');
      return response.json(await swotzy.getParcelLockers(request.query.method, request.query.country));
    }
    const { type, carrier } = parseOptionId(request.query.method);
    if (type !== 'pickuppoint') return response.json([]);
    if (!isShippingCountrySupported(request.query.country)) throw new ValidationError('Neatbalstīta piegādes valsts.');
    response.json(await mcShipping.getPickupPoints(carrier, request.query.country));
  } catch (error) { next(error); }
});
app.post('/api/payments/sessions', checkoutLimiter, async (request, response, next) => {
  try {
    validateOrder(request.body);
    // A real payment must never be attached to a mock order.
    if (config.makecommerce.enabled && !config.woocommerce.enabled) {
      throw new ValidationError('Tiešsaistes maksājumiem jāaktivizē WooCommerce pasūtījumu izveide.');
    }
    const consentAcceptedAt = new Date().toISOString();
    const itemCount = request.body.items.reduce((sum, item) => sum + item.quantity, 0);
    // Price and shipping are always computed server-side; client-supplied amounts are ignored.
    const priceDetails = await woocommerce.getPriceDetails();
    if (request.body.items.some((item) => priceDetails[item.productId]?.inStock === false)) {
      throw new ValidationError('Kāda no precēm vairs nav noliktavā.');
    }
    const shippingOptions = await loadShippingOptions(
      itemCount,
      request.body.delivery.country,
      request.body.delivery.method,
      request.body.delivery.location,
    );
    const { shipping, total } = calculateTotal(request.body, shippingOptions, await woocommerce.getPrices());
    const selectedShippingOption = shippingOptions.find((option) => option.id === request.body.delivery.method);
    const orderRequest = {
      ...request.body,
      delivery: {
        ...request.body.delivery,
        cost: shipping,
        ...(selectedShippingOption?.service ? { service: selectedShippingOption.service } : {}),
      },
      consentAcceptedAt,
    };
    const wooOrder = await woocommerce.createOrder(orderRequest);
    if (config.woocommerce.enabled && (!Number.isFinite(Number(wooOrder.total)) ||
        Math.round(Number(wooOrder.total) * 100) !== Math.round(total * 100))) {
      console.error(`Order ${wooOrder.id}: WooCommerce total ${wooOrder.total} differs from payment total ${total.toFixed(2)}.`);
      try { await woocommerce.cancelOrder(wooOrder.id); } catch (cancelError) {
        console.error(`Could not cancel mismatched WooCommerce order ${wooOrder.id}:`, cancelError);
      }
      throw new Error('Checkout totals do not match. No payment transaction was created.');
    }
    const statusToken = crypto.randomBytes(32).toString('hex');
    const order = saveOrder({
      id: wooOrder.id,
      statusToken,
      wooCommerceOrderId: wooOrder.id,
      status: 'pending',
      paymentStatus: 'pending',
      paymentProvider: config.makecommerce.enabled ? 'makecommerce' : 'woocommerce',
      shippingStatus: 'not_created',
      amount: total,
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
      if (!transaction.transactionId) throw new Error('MakeCommerce did not return a transaction ID.');
      updateOrder(order.id, { paymentUrl: transaction.paymentUrl, transactionId: transaction.transactionId, amount: total });
      order.paymentUrl = transaction.paymentUrl;
    }
    response.status(201).json({ orderId: order.id, statusToken, checkoutUrl: order.paymentUrl, status: order.status });
  } catch (error) { next(error); }
});

app.get('/api/orders/:orderId', (request, response) => {
  const order = getOrder(request.params.orderId);
  const token = request.header('x-order-status-token');
  const expected = order?.statusToken;
  // Do not reveal whether the order exists or its payment status without the secret token.
  if (!expected || !token || token.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return response.status(404).json({ message: 'Pasūtījums nav atrasts.' });
  }
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
      const existingOrder = getOrder(order.id);
      if (!existingOrder) return response.json({ received: true });
      // Older orders lack a provider field. In MakeCommerce mode, a legacy order
      // without a transaction ID can also be an unfinished MakeCommerce checkout.
      const requiresMakeCommercePayment = existingOrder.paymentProvider === 'makecommerce' ||
        (!existingOrder.paymentProvider && (Boolean(existingOrder.transactionId) || config.makecommerce.enabled));
      const incomingPaymentStatus = ['refunded', 'cancelled', 'failed'].includes(order.status)
        ? order.status
        : (order.date_paid || ['processing', 'completed'].includes(order.status) ? 'paid' : order.status);
      if (requiresMakeCommercePayment && incomingPaymentStatus === 'paid' && existingOrder.paymentStatus !== 'paid') {
        return response.json({ received: true });
      }
      // Old pending webhooks cannot undo a confirmed payment.
      const paymentStatus = existingOrder.paymentStatus === 'paid' && !['paid', 'refunded'].includes(incomingPaymentStatus)
        ? 'paid' : incomingPaymentStatus;
      updateOrder(order.id, { status: order.status, paymentStatus });
      if (paymentStatus === 'paid' && !requiresMakeCommercePayment) {
        try { await ensureShipment(order.id); } catch (shipmentError) {
          console.error('Paid WooCommerce order requires shipping review:', order.id, shipmentError);
        }
      }
    }
    response.json({ received: true });
  } catch (error) { next(error); }
});

const paying = new Set();
async function markPaid(orderId) {
  const order = getOrder(orderId);
  if (!order || paying.has(String(orderId))) return;
  paying.add(String(orderId));
  try {
  // Update WooCommerce first so a failed call can be retried by the next MakeCommerce notification.
  if (order.paymentStatus !== 'paid') await woocommerce.markPaid(orderId);
  updateOrder(orderId, { status: 'processing', paymentStatus: 'paid' });
  try { await ensureShipment(orderId); } catch (shipmentError) {
    console.error('Paid MakeCommerce order requires shipping review:', orderId, shipmentError);
  }
  } finally { paying.delete(String(orderId)); }
}

function parseSigned(body) {
  if (!verifyMac(body?.json, body?.mac)) return null;
  try { return JSON.parse(body.json); } catch { return null; }
}

function redirectToShop(response, status, orderId) {
  const url = `${config.frontendUrl.replace(/\/$/, '')}/#/maksajums?status=${status}&order=${encodeURIComponent(orderId || '')}`;
  response.redirect(303, url);
}

// Applies a signed MakeCommerce payment message. Used by both the server-to-server notification and the
// customer return redirect, so the order is finalised (and the shipment created) even when the
// notification URL is unreachable, e.g. PUBLIC_API_URL pointing at localhost. markPaid is idempotent.
async function applyPaymentMessage(message) {
  const order = getOrder(message.reference);
  if (!order?.transactionId || message.transaction !== order.transactionId) return;
  if (message.status === 'COMPLETED' && message.currency === 'EUR' &&
      Number(message.amount) === Number(order.amount?.toFixed(2))) {
    await markPaid(order.id);
  } else if (order.paymentStatus !== 'paid' && ['CANCELLED', 'EXPIRED', 'FAILED'].includes(message.status)) {
    updateOrder(order.id, { paymentStatus: message.status.toLowerCase() });
  }
}

// MakeCommerce POSTs the customer back here with form fields `json` and `mac`.
async function handleReturn(request, response, fallbackStatus) {
  const message = parseSigned(request.body);
  if (!message) return redirectToShop(response, 'failed', '');
  const awaitingConfirmation = ['COMPLETED', 'APPROVED'].includes(message.status);
  try { await applyPaymentMessage(message); } catch (error) { console.error('MakeCommerce return handling failed', error); }
  const verifiedPaid = getOrder(message.reference)?.paymentStatus === 'paid';
  redirectToShop(response, verifiedPaid ? 'success' : (awaitingConfirmation ? 'pending' : fallbackStatus), message.reference);
}
app.post('/api/payments/return', (request, response) => handleReturn(request, response, 'pending'));
app.post('/api/payments/cancel', (request, response) => handleReturn(request, response, 'cancelled'));

app.post('/api/webhooks/makecommerce', async (request, response) => {
  const message = parseSigned(request.body);
  if (!message) return response.status(401).json({ message: 'Invalid signature.' });
  try {
    await applyPaymentMessage(message);
    response.status(200).json({ received: true });
  } catch (error) {
    console.error('MakeCommerce notification handling failed', error);
    response.status(500).json({ message: 'Notification processing failed; retry required.' });
  }
});
app.use((error, _request, response, _next) => {
  console.error(error);
  if (error instanceof ValidationError) return response.status(400).json({ message: error.message });
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return response.status(400).json({ message: 'Nederīgs pieprasījums.' });
  response.status(500).json({ message: 'Radās kļūda. Lūdzu, mēģini vēlreiz vēlāk.' });
});

export { app };
if (config.nodeEnv !== 'test') {
  app.listen(config.port, () => console.log(`CHAI AND CITY API listening on http://localhost:${config.port}`));
}
