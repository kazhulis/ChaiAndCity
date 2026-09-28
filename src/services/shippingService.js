const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://api.chaiandcity.lv');

async function get(path) {
  const response = await fetch(`${API_URL}/api/shipping/${path}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || 'Neizdevās ielādēt piegādes informāciju.');
  }
  return body;
}

export function getShippingOptions() {
  return get('options');
}

export function getParcelLockers() {
  return get('lockers');
}
