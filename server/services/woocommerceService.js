import crypto from 'node:crypto';
import { config } from '../config.js';

function apiUrl(path) {
  return `${config.woocommerce.url.replace(/\/$/, '')}/wp-json/wc/v3${path}`;
}

const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

// One-legged OAuth 1.0a: works even when WordPress does not detect the request as HTTPS,
// where plain key/secret authentication is silently ignored.
function signedUrl(method, url) {
  const params = {
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

export class WooCommerceService {
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
        },
        shipping: {
          first_name: order.customer.firstName,
          last_name: order.customer.lastName,
          ...(order.delivery.address ? {
            address_1: order.delivery.address.street,
            city: order.delivery.address.city,
            postcode: order.delivery.address.postcode,
            country: config.makecommerce.country,
          } : {}),
        },
        line_items: order.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
        shipping_lines: [{ method_id: order.delivery.method, method_title: order.delivery.method, total: order.delivery.cost.toFixed(2) }],
        meta_data: [
          { key: 'delivery_location', value: order.delivery.location },
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

  async getOrder(orderId) {
    if (!config.woocommerce.enabled) return null;
    return request(`/orders/${encodeURIComponent(orderId)}`);
  }
}
