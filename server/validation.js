import { ValidationError } from './errors.js';

export function validateOrder(input) {
  if (!input || !input.customer || !input.delivery || !Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError('Pasūtījumam nepieciešami klienta, piegādes un preču dati.');
  }
  const requiredCustomer = ['firstName', 'lastName', 'email', 'phone'];
  if (requiredCustomer.some((field) => typeof input.customer[field] !== 'string' || !input.customer[field].trim())) {
    throw new ValidationError('Lūdzu, aizpildi visus kontaktinformācijas laukus.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customer.email)) throw new ValidationError('Nederīga e-pasta adrese.');
  if (typeof input.delivery.method !== 'string' || typeof input.delivery.location !== 'string' || !input.delivery.location.trim()) {
    throw new ValidationError('Izvēlies piegādes veidu un vietu.');
  }
  if (input.delivery.method.startsWith('courier') || input.delivery.method === 'kurjers') {
    const address = input.delivery.address;
    if (!address || ['street', 'city', 'postcode'].some((field) => typeof address[field] !== 'string' || !address[field].trim())) {
      throw new ValidationError('Lūdzu, norādi kurjera piegādes adresi: iela, pilsēta un pasta indekss.');
    }
    if (!/^(LV-?)?\d{4}$/i.test(address.postcode.trim())) throw new ValidationError('Nederīgs pasta indekss.');
  }
  if (input.termsAccepted !== true || input.privacyAccepted !== true) {
    throw new ValidationError('Lai turpinātu, jāpiekrīt lietošanas noteikumiem un privātuma politikai.');
  }
  if (input.items.length > 50) throw new ValidationError('Pasūtījumā ir pārāk daudz preču.');
  if (input.items.some((item) => ((!Number.isInteger(item.productId) && typeof item.productId !== 'string') || (typeof item.productId === 'string' && !item.productId.trim()) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100))) {
    throw new ValidationError('Pasūtījumā ir nederīga prece vai daudzums.');
  }
}
