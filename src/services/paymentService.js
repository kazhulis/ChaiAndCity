// Keep payment creation on the server. The frontend should only send an order
// payload and follow the provider URL returned by the backend.
export async function createPaymentSession(order) {
  const response = await fetch('/api/payments/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!response.ok) throw new Error('Neizdevās izveidot maksājuma sesiju.');
  return response.json();
}

export async function getOrderStatus(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
  if (!response.ok) throw new Error('Neizdevās pārbaudīt pasūtījuma statusu.');
  return response.json();
}
