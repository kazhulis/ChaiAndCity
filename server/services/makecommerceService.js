import crypto from 'node:crypto';
import { config } from '../config.js';
import { ValidationError } from '../errors.js';

const PRODUCT_PRICES = { 21: 12, 20: 12, 22: 12, 13: 12 };
const FREE_SHIPPING_OVER = 40;

export function calculateTotal(order, shippingOptions) {
  const subtotal = order.items.reduce((sum, item) => {
    const price = PRODUCT_PRICES[item.productId];
    if (price === undefined) throw new ValidationError('Pasūtījumā ir nezināma prece.');
    return sum + price * item.quantity;
  }, 0);
  const option = shippingOptions.find((entry) => entry.id === order.delivery.method);
  if (!option) throw new ValidationError('Nederīgs piegādes veids.');
  const shipping = subtotal > FREE_SHIPPING_OVER ? 0 : Number(option.price);
  return { subtotal, shipping, total: subtotal + shipping };
}

export function verifyMac(json, mac) {
  const secret = config.makecommerce.secretKey;
  if (!secret || typeof json !== 'string' || typeof mac !== 'string') return false;
  const expected = crypto.createHash('sha512').update(json + secret).digest('hex').toUpperCase();
  const received = mac.toUpperCase();
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export class MakeCommerceService {
  async createTransaction({ orderId, amount, customer, ip, country, locale }) {
    const { shopId, secretKey, apiUrl, publicApiUrl } = config.makecommerce;
    const callback = (path) => ({ url: `${publicApiUrl}${path}`, method: 'POST' });
    const response = await fetch(`${apiUrl}/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: {
          amount: amount.toFixed(2),
          currency: 'EUR',
          reference: String(orderId),
          merchant_data: String(orderId),
          transaction_url: {
            return_url: callback('/api/payments/return'),
            cancel_url: callback('/api/payments/cancel'),
            notification_url: callback('/api/webhooks/makecommerce'),
          },
        },
        customer: { email: customer.email, ip: String(ip || '').replace(/^::ffff:/, ''), country: country || customer.country || 'lv', locale },
        app_info: { module: 'ChaiAndCity', module_version: '1.0.0', platform: 'Custom', platform_version: '1.0' },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const details = (body?.errors || []).map((error) => `${error.resource}.${error.field}: ${error.type}`).join(', ');
      throw new Error(`MakeCommerce: ${body?.message || response.status}${details ? ` (${details})` : ''}`);
    }
    const redirect = body?.payment_methods?.other?.find((method) => method.name === 'redirect');
    if (!redirect?.url) throw new Error('MakeCommerce neatgrieza maksājuma saiti.');
    return { transactionId: body.id, paymentUrl: redirect.url };
  }
}
