export function validateOrder(input) {
  if (!input || !input.customer || !input.delivery || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Pasūtījumam nepieciešami klienta, piegādes un preču dati.');
  }
  const requiredCustomer = ['firstName', 'lastName', 'email', 'phone'];
  if (requiredCustomer.some((field) => typeof input.customer[field] !== 'string' || !input.customer[field].trim())) {
    throw new Error('Lūdzu, aizpildi visus kontaktinformācijas laukus.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customer.email)) throw new Error('Nederīga e-pasta adrese.');
  if (typeof input.delivery.method !== 'string' || typeof input.delivery.location !== 'string' || !input.delivery.location.trim()) {
    throw new Error('Izvēlies piegādes veidu un vietu.');
  }
  if (input.items.some((item) => ((!Number.isInteger(item.productId) && typeof item.productId !== 'string') || (typeof item.productId === 'string' && !item.productId.trim()) || !Number.isInteger(item.quantity) || item.quantity < 1))) {
    throw new Error('Pasūtījumā ir nederīga prece vai daudzums.');
  }
}
