import crypto from 'node:crypto';
import { config } from '../config.js';

function apiUrl(path) {
  return `${config.woocommerce.url.replace(/\/$/, '')}/wp-json/wc/v3${path}`;
}

const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

// One-legged OAuth 1.0a: works even when WordPress does not detect the request as HTTPS,
// where plain key/secret authentication is silently ignored.
function signedUrl(method, fullUrl) {
  const parsed = new URL(fullUrl);
  const url = `${parsed.origin}${parsed.pathname}`;
  const query = Object.fromEntries(parsed.searchParams);
  const params = {
    ...query,
    oauth_consumer_key: config.woocommerce.consumerKey,
    oauth_nonce: crypto.randomBytes(12).toString('hex'),
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const normalized = Object.keys(params).sort().map((key) => `${encode(key)}=${encode(params[key])}`).join('&');
  const base = [method.toUpperCase(), encode(url), encode(normalized)].join('&');
  params.oauth_signature = crypto.createHmac('sha256', `${config.woocommerce.consumerSecret}&`).update(base).digest('base64');
  return `${url}?${Object.entries(params).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&')}`;
}

async function request(path, options = {}) {
  if (!config.woocommerce.enabled) return null;
  const response = await fetch(signedUrl(options.method || 'GET', apiUrl(path)), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `WooCommerce request failed with ${response.status}.`);
  return body;
}

const MOCK_PRICES = Object.fromEntries([21, 20, 22, 13].map((id) => [id, { price: 12, regularPrice: null, inStock: true }]));
const PRICE_CACHE_MS = 60_000;
let priceCache = { at: 0, prices: null };

export class WooCommerceService {
  // Returns { [productId]: { price, regularPrice } }; regularPrice is set only while the product is on sale.
  async getPriceDetails() {
    if (!config.woocommerce.enabled) return MOCK_PRICES;
    if (priceCache.prices && Date.now() - priceCache.at < PRICE_CACHE_MS) return priceCache.prices;
    const products = await request('/products?per_page=100&status=publish');
    const prices = {};
    for (const product of products) {
      const price = Number.parseFloat(product.price);
      if (!Number.isFinite(price)) continue;
      const regular = Number.parseFloat(product.regular_price);
      prices[product.id] = { price, regularPrice: product.on_sale && regular > price ? regular : null, inStock: product.stock_status !== 'outofstock' };
    }
    priceCache = { at: Date.now(), prices };
    return prices;
  }

  async getPrices() {
    const details = await this.getPriceDetails();
    return Object.fromEntries(Object.entries(details).map(([id, { price }]) => [id, price]));
  }

  async createOrder(order) {
    if (!config.woocommerce.enabled) {
      return { id: `mock-${Date.now()}`, status: 'pending', payment_url: null };
    }
    if (order.items.some((item) => !Number.isInteger(item.productId))) {
      throw new Error('Pievieno WooCommerce produktu ID katram produktam src/main.jsx.');
    }
    return request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        payment_method: config.woocommerce.paymentMethod,
        payment_method_title: config.woocommerce.paymentMethod || 'WooCommerce payment',
        set_paid: false,
        billing: {
          first_name: order.customer.firstName,
          last_name: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone,
          country: order.delivery.country,
        },
        shipping: {
          first_name: order.customer.firstName,
          last_name: order.customer.lastName,
          address_1: order.delivery.address?.street || order.delivery.locationLabel || order.delivery.location,
          ...(order.delivery.address?.city ? { city: order.delivery.address.city } : {}),
          ...(order.delivery.address?.postcode ? { postcode: order.delivery.address.postcode } : {}),
          country: order.delivery.country,
        },
        line_items: order.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
        shipping_lines: [{ method_id: order.delivery.method, method_title: order.delivery.method, total: order.delivery.cost.toFixed(2) }],
        meta_data: [
          { key: 'delivery_location', value: order.delivery.location },
          { key: 'delivery_location_label', value: order.delivery.locationLabel || order.delivery.location },
          { key: 'delivery_country', value: order.delivery.country },
          { key: 'terms_accepted', value: String(order.termsAccepted) },
          { key: 'privacy_accepted', value: String(order.privacyAccepted) },
          { key: 'consent_accepted_at', value: order.consentAcceptedAt },
        ],
      }),
    });
  }

  async markPaid(orderId) {
    return request(`/orders/${encodeURIComponent(orderId)}`, { method: 'PUT', body: JSON.stringify({ set_paid: true }) });
  }

  // Store address and sender e-mail as configured in WooCommerce (the same data the Swotzy plugin uses).
  async getStoreSettings() {
    if (!config.woocommerce.enabled) return null;
    const [general, email] = await Promise.all([request('/settings/general'), request('/settings/email/woocommerce_email_from_address').catch(() => null)]);
    const value = (id) => general?.find((setting) => setting.id === id)?.value || '';
    return {
      address1: value('woocommerce_store_address'),
      address2: value('woocommerce_store_address_2'),
      city: value('woocommerce_store_city'),
      zip: value('woocommerce_store_postcode'),
      country: value('woocommerce_default_country').split(':')[0],
      email: email?.value || '',
    };
  }

  async getOrder(orderId) {
    if (!config.woocommerce.enabled) return null;
    return request(`/orders/${encodeURIComponent(orderId)}`);
  }
}
