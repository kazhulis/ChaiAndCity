import { config } from '../config.js';

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

function headers(extra = {}) {
  const { shopId, secretKey, shopInstance } = config.makecommerce;
  return {
    Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
    accept: 'application/json',
    'Content-Type': 'application/json',
    'makecommerce-shop-instance': shopInstance,
    'makecommerce-user-locale': 'en',
    ...extra,
  };
}

async function request(path, options = {}) {
  const method = options.method || 'GET';
  const response = await fetch(`${config.makecommerce.shippingApiUrl}${path}`, { ...options, headers: headers(options.headers) });
  const responseText = await response.text();
  let body;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : 'No provider error message.';
    const providerErrors = Array.isArray(body?.errors)
      ? body.errors.map((error) => [error?.code, error?.field, error?.message].filter(Boolean).join(': ')).filter(Boolean).slice(0, 5)
      : [];
    const requestId = response.headers.get('x-request-id') || response.headers.get('request-id');
    console.error('MakeCommerce Shipping API request failed', {
      method,
      path,
      status: response.status,
      message,
      errors: providerErrors,
      requestId,
    });
    throw new Error(`MakeCommerce Shipping API ${method} ${path} failed with HTTP ${response.status}: ${message}${requestId ? ` (request ${requestId})` : ''}`);
  }
  if (body === null) throw new Error(`MakeCommerce Shipping API ${method} ${path} returned an invalid JSON response.`);
  return body;
}

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function isShippingEnabled() {
  return config.makecommerce.enabled && config.makecommerce.shippingEnabled;
}

export function isShippingCountrySupported(country) {
  return typeof country === 'string' && config.makecommerce.shippingCountries.includes(country);
}

// Option ids look like "pickuppoint:omniva" or "courier:dpd".
export function parseOptionId(id) {
  const [type, carrier] = String(id).split(':');
  return { type, carrier };
}

export class MakeCommerceShippingService {
  async getShippingOptions(weight, country = config.makecommerce.country) {
    if (!isShippingCountrySupported(country)) throw new Error('Neatbalstīta piegādes valsts.');
    const rates = await cached(`rates:${country}:${weight}`, () => request('/rates', { method: 'POST', body: JSON.stringify({ weight, destination: country }) }));
    return ['pickuppoint', 'courier'].flatMap((type) => (rates?.[type] || []).map((rate) => ({
      id: `${type}:${rate.carrier}`,
      type,
      carrier: rate.carrier,
      name: rate.title,
      price: Number(rate.price) / 100,
      image: rate.image,
    })));
  }

  async getPickupPoints(carrier, country = config.makecommerce.country) {
    if (!/^[a-z0-9_-]+$/i.test(carrier || '')) throw new Error('Nederīgs pārvadātājs.');
    if (!isShippingCountrySupported(country)) throw new Error('Neatbalstīta piegādes valsts.');
    const points = await cached(`points:${country}:${carrier}`, () => request(`/pickuppoint/${country.toLowerCase()}`, { headers: { 'makecommerce-carrier': carrier } }));
    return (points || []).map((point) => ({
      id: String(point.id),
      name: point.name,
      address: point.address,
      city: point.city,
    }));
  }
}
