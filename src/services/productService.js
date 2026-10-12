const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://api.chaiandcity.lv');

export async function getProductPrices() {
  const response = await fetch(`${API_URL}/api/products/prices`);
  if (!response.ok) throw new Error('Neizdevās ielādēt cenas.');
  return response.json();
}
