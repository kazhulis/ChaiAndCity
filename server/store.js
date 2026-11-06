import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = process.env.ORDER_DATA_DIR ? path.resolve(process.env.ORDER_DATA_DIR) : path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = path.join(dataDir, 'orders.json');

function load() {
  if (!fs.existsSync(file)) return new Map();
  // Corruption or unreadable persistent storage is fatal, never an empty store.
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid stored orders data.');
  }
  return new Map(Object.entries(data));
}

const orders = load();

function persist(nextOrders) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(nextOrders)), { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function saveOrder(order) {
  const next = new Map(orders);
  next.set(String(order.id), order);
  persist(next);
  orders.set(String(order.id), order);
  return order;
}

export function getOrder(id) {
  return orders.get(String(id));
}

export function updateOrder(id, changes) {
  const current = getOrder(id);
  if (!current) return undefined;
  const updated = { ...current, ...changes };
  const next = new Map(orders);
  next.set(String(id), updated);
  persist(next);
  orders.set(String(id), updated);
  return updated;
}
