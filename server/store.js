import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = path.join(dataDir, 'orders.json');

function load() {
  try { return new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))); } catch { return new Map(); }
}

const orders = load();

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(orders)));
}

export function saveOrder(order) {
  orders.set(String(order.id), order);
  persist();
  return order;
}

export function getOrder(id) {
  return orders.get(String(id));
}

export function updateOrder(id, changes) {
  const current = getOrder(id);
  if (!current) return undefined;
  const updated = { ...current, ...changes };
  orders.set(String(id), updated);
  persist();
  return updated;
}
