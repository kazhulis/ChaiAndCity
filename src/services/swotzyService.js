// Swotzy credentials and API calls belong in the backend, never in the browser.
// Replace these mock responses with server-side Swotzy API calls when available.
export class SwotzyService {
  async getShippingOptions() {
    return [
      { id: 'pakomats', name: 'Pakomāts', price: 2.99 },
      { id: 'kurjers', name: 'Kurjers', price: 5.9 },
    ];
  }

  async getParcelLockers() {
    return [];
  }

  async createShipment(order) {
    console.info('Mock Swotzy shipment. Implement the server-side API call here.', order.id);
    return { shipmentId: `mock-${order.id}`, status: 'pending' };
  }

  async createShippingLabel(shipmentId) {
    console.info('Mock Swotzy label. Implement the server-side API call here.', shipmentId);
    return { labelUrl: null };
  }
}
