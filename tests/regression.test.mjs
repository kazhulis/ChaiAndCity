import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chai-regression-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  ORDER_DATA_DIR: tempDir,
  FRONTEND_URL: 'http://localhost:5173',
  WOOCOMMERCE_ENABLED: 'true',
  WOOCOMMERCE_URL: 'https://woocommerce.invalid',
  WOOCOMMERCE_CONSUMER_KEY: 'test-key',
  WOOCOMMERCE_CONSUMER_SECRET: 'test-secret',
  WOOCOMMERCE_WEBHOOK_SECRET: 'test-woo-webhook-secret',
  MAKECOMMERCE_ENABLED: 'true',
  MAKECOMMERCE_SHIPPING_ENABLED: 'true',
  MAKECOMMERCE_SHOP_ID: 'test-shop',
  MAKECOMMERCE_SECRET_KEY: 'test-mc-secret',
  MAKECOMMERCE_API_URL: 'https://makecommerce.invalid',
  MAKECOMMERCE_SHIPPING_API_URL: 'https://shipping.invalid',
  SHIPPING_PROVIDER: 'makecommerce',
  SHIPPING_COUNTRIES: 'LV',
  SWOTZY_ENABLED: 'false',
});

const { validateOrder } = await import('../server/validation.js');
const { calculateTotal } = await import('../server/services/makecommerceService.js');
const { app } = await import('../server/index.js');
const { getOrder } = await import('../server/store.js');

const originalFetch = globalThis.fetch;
let nextOrderId = 1500;
let totalOverride = null;
let shippingFailure = false;
const calls = { wooCreated: 0, wooCancelled: 0, transactions: 0, paidUpdates: 0, shipments: 0 };

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const method = options.method || 'GET';
  if (url.hostname === 'woocommerce.invalid' && url.pathname.endsWith('/products')) {
    return json([{ id: 21, price: '12.00', regular_price: '12.00', on_sale: false, stock_status: 'instock' }]);
  }
  if (url.hostname === 'woocommerce.invalid' && url.pathname.endsWith('/orders') && method === 'POST') {
    calls.wooCreated += 1;
    return json({ id: ++nextOrderId, total: totalOverride ?? '14.99', status: 'pending' });
  }
  if (url.hostname === 'woocommerce.invalid' && /\/orders\/\d+$/.test(url.pathname) && method === 'PUT') {
    const payload = JSON.parse(options.body);
    if (payload.status === 'cancelled') calls.wooCancelled += 1;
    if (payload.set_paid === true) calls.paidUpdates += 1;
    return json({ id: Number(url.pathname.split('/').pop()), status: payload.status || 'processing' });
  }
  if (url.hostname === 'shipping.invalid' && url.pathname === '/rates' && method === 'POST') {
    return json({ pickuppoint: [{ carrier: 'omniva', title: 'Omniva', price: 299 }], courier: [] });
  }
  if (url.hostname === 'shipping.invalid' && url.pathname === '/shipments' && method === 'POST') {
    calls.shipments += 1;
    if (shippingFailure) throw new Error('Simulated carrier failure');
    return json({ trackingId: `shipment-${calls.shipments}`, shipment: { status: 'CREATED' } });
  }
  if (url.hostname === 'makecommerce.invalid' && url.pathname === '/v1/transactions' && method === 'POST') {
    calls.transactions += 1;
    return json({ id: `transaction-${calls.transactions}`, payment_methods: { other: [{ name: 'redirect', url: 'https://makecommerce.invalid/checkout' }] } });
  }
  throw new Error(`Unexpected external call: ${method} ${url.hostname}${url.pathname}`);
};

const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const apiRoot = `http://127.0.0.1:${server.address().port}`;

async function api(endpoint, { method = 'GET', body, token, headers = {} } = {}) {
  return originalFetch(`${apiRoot}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { 'x-order-status-token': token } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const orderPayload = () => ({
  customer: { firstName: 'Test', lastName: 'Customer', email: 'test@example.invalid', phone: '+37120000000' },
  delivery: { method: 'pickuppoint:omniva', country: 'LV', location: '12345' },
  items: [{ productId: 21, quantity: 1 }],
  termsAccepted: true,
  privacyAccepted: true,
});

function signedMessage(message) {
  const signed = JSON.stringify(message);
  return { json: signed, mac: crypto.createHash('sha512').update(signed + process.env.MAKECOMMERCE_SECRET_KEY).digest('hex').toUpperCase() };
}

try {
  await test('reject malformed cart items before summing quantities', async () => {
    for (const item of [null, {}, { productId: '21', quantity: 1 }, { productId: 21, quantity: '1' }]) {
      assert.throws(() => validateOrder({ ...orderPayload(), items: [item] }));
    }
    assert.throws(() => validateOrder({ ...orderPayload(), items: [{ productId: 21, quantity: 100 }, { productId: 21, quantity: 1 }] }));
    const invalid = await api('/api/payments/sessions', { method: 'POST', body: { ...orderPayload(), items: [null] } });
    assert.equal(invalid.status, 400);
  });

  await test('server-calculated totals reject invalid delivery prices', () => {
    assert.deepEqual(calculateTotal(orderPayload(), [{ id: 'pickuppoint:omniva', price: 2.99 }], { 21: 12 }), {
      subtotal: 12, shipping: 2.99, total: 14.99,
    });
    for (const price of [undefined, null, '', NaN, -1]) {
      assert.throws(() => calculateTotal(orderPayload(), [{ id: 'pickuppoint:omniva', price }], { 21: 12 }));
    }
  });

  await test('mismatched WooCommerce totals cancel the order before creating a transaction', async () => {
    totalOverride = '12.00';
    const paymentCountBefore = calls.transactions;
    const response = await api('/api/payments/sessions', { method: 'POST', body: orderPayload() });
    totalOverride = null;
    assert.equal(response.status, 500);
    assert.equal(calls.wooCancelled, 1);
    assert.equal(calls.transactions, paymentCountBefore);
  });

  let session;
  await test('create checkout and protect order-status endpoint with secret token', async () => {
    const response = await api('/api/payments/sessions', { method: 'POST', body: orderPayload() });
    assert.equal(response.status, 201);
    session = await response.json();
    assert.match(session.statusToken, /^[0-9a-f]{64}$/);
    assert.equal((await api(`/api/orders/${session.orderId}`)).status, 404);
    assert.equal((await api(`/api/orders/${session.orderId}`, { token: 'x'.repeat(64) })).status, 404);
    const pending = await api(`/api/orders/${session.orderId}`, { token: session.statusToken });
    assert.equal((await pending.json()).paymentStatus, 'pending');
  });

  await test('signed incorrect amount does not mark order paid or create shipment', async () => {
    const existingPaid = calls.paidUpdates;
    const wrong = signedMessage({ reference: String(session.orderId), status: 'COMPLETED', amount: '11.99', transaction: 'transaction-1', currency: 'EUR' });
    assert.equal((await api('/api/webhooks/makecommerce', { method: 'POST', body: wrong })).status, 200);
    assert.equal(calls.paidUpdates, existingPaid);
    assert.equal(calls.shipments, 0);
    assert.equal(getOrder(session.orderId).paymentStatus, 'pending');
  });

  await test('valid payment updates WooCommerce and creates exactly one shipment despite repeat notification', async () => {
    const message = signedMessage({ reference: String(session.orderId), status: 'COMPLETED', amount: '14.99', transaction: 'transaction-1', currency: 'EUR' });
    const responses = await Promise.all([api('/api/webhooks/makecommerce', { method: 'POST', body: message }), api('/api/webhooks/makecommerce', { method: 'POST', body: message })]);
    assert.ok(responses.every((response) => response.status === 200));
    assert.equal(calls.paidUpdates, 1);
    assert.equal(calls.shipments, 1);
    assert.equal(getOrder(session.orderId).paymentStatus, 'paid');
    assert.equal(getOrder(session.orderId).shippingStatus, 'CREATED');
    const confirmed = await api(`/api/orders/${session.orderId}`, { token: session.statusToken });
    assert.equal((await confirmed.json()).paymentStatus, 'paid');
    assert.ok(fs.existsSync(path.join(tempDir, 'orders.json')));
  });

  await test('delayed WooCommerce pending webhook cannot undo a paid order', async () => {
    const stale = { id: Number(session.orderId), status: 'pending', date_paid: null };
    const signature = crypto.createHmac('sha256', process.env.WOOCOMMERCE_WEBHOOK_SECRET)
      .update(JSON.stringify(stale)).digest('base64');
    const previousShipments = calls.shipments;
    const response = await api('/api/webhooks/woocommerce', {
      method: 'POST', body: stale, headers: { 'x-wc-webhook-signature': signature },
    });
    assert.equal(response.status, 200);
    assert.equal(getOrder(session.orderId).paymentStatus, 'paid');
    assert.equal(calls.shipments, previousShipments);
  });

  await test('uncertain shipment creation is held for manual review instead of duplicated', async () => {
    const checkout = await api('/api/payments/sessions', { method: 'POST', body: orderPayload() });
    assert.equal(checkout.status, 201);
    const next = await checkout.json();
    shippingFailure = true;
    const message = signedMessage({ reference: String(next.orderId), status: 'COMPLETED', amount: '14.99', transaction: 'transaction-2', currency: 'EUR' });
    assert.equal((await api('/api/webhooks/makecommerce', { method: 'POST', body: message })).status, 200);
    assert.equal(getOrder(next.orderId).paymentStatus, 'paid');
    assert.equal(getOrder(next.orderId).shippingStatus, 'requires_review');
    const shipmentCount = calls.shipments;
    assert.equal((await api('/api/webhooks/makecommerce', { method: 'POST', body: message })).status, 200);
    assert.equal(calls.shipments, shipmentCount);
    shippingFailure = false;
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = originalFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
