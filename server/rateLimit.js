export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (request, response, next) => {
    const now = Date.now();
    const entry = hits.get(request.ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(request.ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      response.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return response.status(429).json({ message: 'Pārāk daudz pieprasījumu. Lūdzu, mēģini vēlāk.' });
    }
    return next();
  };
}
