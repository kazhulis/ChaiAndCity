import { config } from '../config.js';

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

function headers(extra = {}) {
  const { shopId, secretKey, shopInstance } = config.makecommerce;
  return {
    Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
    'Content-Type': 'application/json',
    'makecommerce-shop-instance': shopInstance,
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${config.makecommerce.shippingApiUrl}${path}`, { ...options, headers: headers(options.headers) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `MakeCommerce shipping request failed with ${response.status}.`);
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

// Option ids look like "pickuppoint:omniva" or "courier:dpd".
export function parseOptionId(id) {
  const [type, carrier] = String(id).split(':');
  return { type, carrier };
}

export class MakeCommerceShippingService {
  async getShippingOptions(weight) {
    const { country } = config.makecommerce;
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

  async getPickupPoints(carrier) {
    if (!/^[a-z0-9_-]+$/i.test(carrier || '')) throw new Error('Nederīgs pārvadātājs.');
    const { country } = config.makecommerce;
    const points = await cached(`points:${country}:${carrier}`, () => request(`/pickuppoint/${country.toLowerCase()}`, { headers: { 'makecommerce-carrier': carrier } }));
    return (points || []).map((point) => ({
      id: String(point.id),
      name: point.name,
      address: [point.address, point.city].filter(Boolean).join(', '),
      city: point.city,
    }));
  }
}
