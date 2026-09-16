const orders = new Map();

export function saveOrder(order) {
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
  orders.set(String(id), updated);
  return updated;
}
