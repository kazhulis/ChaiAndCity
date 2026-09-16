import { config } from '../config.js';

function apiUrl(path) {
  return `${config.woocommerce.url.replace(/\/$/, '')}/wp-json/wc/v3${path}`;
}

function authHeader() {
  return `Basic ${Buffer.from(`${config.woocommerce.consumerKey}:${config.woocommerce.consumerSecret}`).toString('base64')}`;
}

async function request(path, options = {}) {
  if (!config.woocommerce.enabled) return null;
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', ...(options.headers || {}) },
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
        shipping: { first_name: order.customer.firstName, last_name: order.customer.lastName },
        line_items: order.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
        shipping_lines: [{ method_id: order.delivery.method, method_title: order.delivery.method, total: order.delivery.cost.toFixed(2) }],
        meta_data: [{ key: 'delivery_location', value: order.delivery.location }],
      }),
    });
  }

  async getOrder(orderId) {
    if (!config.woocommerce.enabled) return null;
    return request(`/orders/${encodeURIComponent(orderId)}`);
  }
}
