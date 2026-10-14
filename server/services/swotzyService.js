import { config } from '../config.js';
import { WooCommerceService } from './woocommerceService.js';

const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_PARCELSHOP_PAGES = 50;
const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function authHeader() {
  const { apiUser, apiToken } = config.swotzy;
  const credentials = apiUser ? `${apiUser}:${apiToken}` : apiToken;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function request(path, options = {}) {
  if (!config.swotzy.enabled) return null;
  const response = await fetch(`${config.swotzy.apiUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { Authorization: authHeader(), accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : body?.message || (body?.detail ? JSON.stringify(body.detail).slice(0, 300) : '');
    throw new Error(`Swotzy ${options.method || 'GET'} ${path.split('?')[0]} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return body;
}

const fallbackOptions = [
  { id: 'pickuppoint:mock:pakomats', type: 'pickuppoint', name: 'Pakomāts', price: 2.99 },
  { id: 'courier:mock:kurjers', type: 'courier', name: 'Kurjers', price: 5.9 },
];

// Option ids look like "pickuppoint:OMNIVA:Omniva Parcel Terminal" or "courier:DPD:DPD Classic".
export function parseOptionId(id) {
  const [type, carrier, ...service] = String(id).split(':');
  return { type, carrier, service: service.join(':') };
}

function packageFor(itemCount) {
  const { length, width, height } = config.swotzy.package;
  const count = Math.max(1, Math.min(Number.parseInt(itemCount, 10) || 1, 100));
  return { length, width, height, weight: Math.max(0.01, (count * config.makecommerce.itemWeightGrams) / 1000) };
}

const woocommerce = new WooCommerceService();

// Sender comes from the WooCommerce store settings; SWOTZY_SENDER_* env values override them.
async function getSender() {
  const store = await cached('sender', () => woocommerce.getStoreSettings()) || {};
  const env = Object.fromEntries(Object.entries(config.swotzy.sender).filter(([, value]) => value));
  const sender = {
    full_name: store.name || 'Chai and City',
    address1: [store.address1, store.address2].filter(Boolean).join(', ') || undefined,
    city: store.city,
    zip: store.zip,
    country: store.country || 'LV',
    email: store.email,
    ...env,
  };
  if (!sender.zip || !sender.city) throw new Error('Swotzy sender address is missing: set the WooCommerce store address or SWOTZY_SENDER_* values.');
  return sender;
}

export class SwotzyService {
  async getShippingOptions(country, itemCount = 1) {
    if (!config.swotzy.enabled) return fallbackOptions;
    const { currency } = config.swotzy;
    const sender = await getSender();
    const pkg = packageFor(itemCount);
    const result = await cached(`rates:${country}:${pkg.weight}`, () => request('/rates', {
      method: 'POST',
      body: JSON.stringify({
        sender_address: { zip: sender.zip, city: sender.city, country: sender.country },
        // Destination zip is unknown until checkout is submitted, so rates are quoted per carrier/service for the country.
        recipient_address: { zip: process.env.SWOTZY_RATE_ZIP || sender.zip, country },
        currency,
        shipments: [{ package: pkg }],
      }),
    }));
    const options = new Map();
    for (const rate of result?.rates || []) {
      const price = rate.promo_price ?? rate.price;
      if (price === null || price === undefined || rate.delivery_type === 'pallet') continue;
      const type = rate.delivery_type === 'parcelshop' ? 'pickuppoint' : 'courier';
      const id = `${type}:${rate.carrier}:${rate.service}`;
      if (!options.has(id)) options.set(id, { id, type, carrier: rate.carrier, name: rate.name, price: Number(price) });
    }
    return [...options.values()];
  }

  async getParcelLockers(method, country) {
    if (!config.swotzy.enabled) return [];
    const { type, carrier } = parseOptionId(method);
    if (type !== 'pickuppoint' || !/^[A-Z_]+$/.test(carrier || '')) return [];
    return cached(`points:${country}:${carrier}`, async () => {
      const lockers = [];
      let cursor;
      for (let page = 0; page < MAX_PARCELSHOP_PAGES; page += 1) {
        const params = new URLSearchParams({ carrier, country, size: '100' });
        if (cursor) params.set('cursor', cursor);
        const body = await request(`/parcelshops/?${params}`);
        lockers.push(...(body?.items || []));
        cursor = body?.next_page;
        if (!cursor) break;
      }
      return lockers.map((point) => ({
        id: String(point.id),
        name: point.display_name,
        address: point.street || point.display_name,
        city: point.city,
        postcode: point.zip || undefined,
      }));
    });
  }

  async createShipment(order) {
    if (!config.swotzy.enabled || config.shippingProvider !== 'swotzy') return { shipmentId: `mock-${order.id}`, status: 'pending' };
    const { type, carrier, service } = parseOptionId(order.delivery.method);
    const { currency } = config.swotzy;
    const sender = await getSender();
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const contact = {
      full_name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      phone: order.customer.phone,
      email: order.customer.email,
    };
    const isPickup = type === 'pickuppoint';
    const address = order.delivery.address || {};
    const body = {
      sender_address: sender,
      recipient_address: isPickup ? contact : {
        ...contact,
        address1: address.street,
        city: address.city,
        zip: address.postcode,
        country: order.delivery.country,
      },
      retail_currency: currency,
      shipments: [{ package: packageFor(quantity) }],
      carrier,
      service,
      delivery_config: isPickup
        ? { type: 'parcelshop', parcelshop_id: order.delivery.location }
        : { type: 'classic' },
      reference_id: String(order.id),
    };
    const created = await request('/orders', { method: 'POST', body: JSON.stringify(body) });
    return { shipmentId: String(created.id), status: created.status || 'created' };
  }
}