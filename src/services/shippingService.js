const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://api.chaiandcity.lv');

async function get(path, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString();
  const response = await fetch(`${API_URL}/api/shipping/${path}${query ? `?${query}` : ''}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || 'Neizdevās ielādēt piegādes informāciju.');
  }
  return body;
}

export function getShippingOptions(items) {
  return get('options', { items });
}

export function getParcelLockers(method) {
  return get('lockers', { method });
}
