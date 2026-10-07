// Keep payment creation on the server. The frontend should only send an order
// payload and follow the provider URL returned by the backend.
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://api.chaiandcity.lv');

export async function createPaymentSession(order) {
  const response = await fetch(`${API_URL}/api/payments/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Neizdevās izveidot maksājuma sesiju.');
  }

  return response.json();
}

export async function getOrderStatus(orderId) {
  const response = await fetch(
    `${API_URL}/api/orders/${encodeURIComponent(orderId)}`
  );

  if (!response.ok) {
    throw new Error('Neizdevās pārbaudīt pasūtījuma statusu.');
  }

  return response.json();
}
