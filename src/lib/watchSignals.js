// Punte între Dashboard și botul de paper trading pentru semnalele WATCH (trigger doar pe 5m):
// Dashboard-ul le publică, botul le ia ca intrări timpurii. TTL scurt — un trigger de 5m expiră repede.
const KEY = "soso_watch_signals";
const TTL_MS = 15 * 60 * 1000;
const MAX_ITEMS = 8;

export function publishWatchSignals(items, exchange) {
  try {
    const payload = {
      at: Date.now(),
      exchange,
      items: (items || [])
        .filter(s => s.symbol && Number.isFinite(s.price) && s.price > 0)
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
        .slice(0, MAX_ITEMS)
        .map(s => ({
          symbol: s.symbol,
          price: s.price,
          strength: s.strength ?? 0,
          manipulation: s.manipulation ?? null,
        })),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
}

export function getWatchSignals() {
  try {
    const payload = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!payload || Date.now() - (payload.at || 0) > TTL_MS) return [];
    return (payload.items || []).filter(i => i.symbol && i.price > 0);
  } catch {
    return [];
  }
}