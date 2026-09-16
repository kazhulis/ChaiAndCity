import { config } from '../config.js';

async function request(path, options = {}) {
  if (!config.swotzy.enabled) return null;
  const response = await fetch(`${config.swotzy.apiUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${config.swotzy.apiToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `Swotzy request failed with ${response.status}.`);
  return body;
}

export class SwotzyService {
  async getShippingOptions() {
    return (await request('/shipping-options')) || [{ id: 'pakomats', name: 'Pakomāts', price: 2.99 }, { id: 'kurjers', name: 'Kurjers', price: 5.9 }];
  }

  async getParcelLockers() {
    return (await request('/parcel-lockers')) || [];
  }

  async createShipment(order) {
    return (await request('/shipments', { method: 'POST', body: JSON.stringify(order) })) || { shipmentId: `mock-${order.id}`, status: 'pending' };
  }

  async createShippingLabel(shipmentId) {
    return (await request(`/shipments/${encodeURIComponent(shipmentId)}/label`, { method: 'POST' })) || { labelUrl: null };
  }
}
