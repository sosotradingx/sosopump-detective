// Signal logging, outcome tracking (+1h/+4h/+24h), dedupe and cooldown.
import { base44 } from "@/api/base44Client";

const OPEN_STATUSES = ["WATCH", "EARLY", "ACTIVE", "STRONG", "DUMP_RISK"];
const COOLDOWN_MINUTES = { WATCH: 90, EARLY: 180, ACTIVE: 240, STRONG: 240, DUMP_RISK: 360 };
const RANK = { WATCH: 1, EARLY: 2, ACTIVE: 3, STRONG: 4, DUMP_RISK: 5 };
// A 5m trigger that the 15m timeframe never confirms is a manipulation wick
const STALE_WATCH_MINUTES = 45;

// Throttle: at most one logging pass every 10 minutes (keeps entity read traffic low)
const SYNC_KEY = "soso_signal_log_sync";
const SYNC_EVERY_MS = 10 * 60 * 1000;

const pct = (from, to) => (from > 0 ? ((to / from) - 1) * 100 : null);

export async function syncSignals(signals, priceMap) {
  const now = Date.now();
  let last = 0;
  try { last = Number(localStorage.getItem(SYNC_KEY) || 0); } catch { last = 0; }
  if (now - last < SYNC_EVERY_MS) return null;

  const logs = await base44.entities.PumpSignalLog.list("-created_date", 60);

  const latestByKey = new Map();
  logs.forEach(l => {
    const key = `${l.exchange}:${l.symbol}`;
    const prev = latestByKey.get(key);
    if (!prev || new Date(l.created_date) > new Date(prev.created_date)) latestByKey.set(key, l);
  });

  const live = signals.filter(s => RANK[s.status]);
  const liveKeys = new Set(live.map(s => `${s.exchange}:${s.symbol}`));

  // One patch per record id (bulkUpdate rejects duplicate ids)
  const patches = new Map();
  const addPatch = (id, patch) => patches.set(id, { ...(patches.get(id) || {}), ...patch });

  // 1) Track outcomes and peaks for open logs
  logs.forEach(l => {
    if (!OPEN_STATUSES.includes(l.status)) return;
    const p = priceMap[`${l.exchange}:${l.symbol}`];
    if (!p) return;

    const patch = {};
    const peak = Math.max(l.peak_price || l.price || p, p);
    const trough = Math.min(l.trough_price || l.price || p, p);
    if (peak !== l.peak_price) patch.peak_price = peak;
    if (trough !== l.trough_price) patch.trough_price = trough;

    const entry = l.price || p;
    const ageH = (now - new Date(l.created_date).getTime()) / 3600000;

    if (ageH >= 1 && l.outcome_1h == null) patch.outcome_1h = pct(entry, p);
    if (ageH >= 4 && l.outcome_4h == null) patch.outcome_4h = pct(entry, p);
    if (ageH >= 24 && l.outcome_24h == null) {
      patch.outcome_24h = pct(entry, p);
      patch.status = "CLOSED";
    }
    patch.max_profit_pct = pct(entry, peak);
    patch.max_drawdown_pct = pct(entry, trough);

    // Golden rule: a 5m trigger not confirmed on 15m within 45 min is invalidated
    if (l.status === "WATCH" && ageH >= STALE_WATCH_MINUTES / 60 && !liveKeys.has(`${l.exchange}:${l.symbol}`)) {
      patch.status = "INVALIDATED";
      patch.notes = "Trigger 5m neconfirmat pe 15m în 45 min";
    }

    addPatch(l.id, patch);
  });

  // 2) Dedupe + cooldown for the signals detected in this scan
  const creates = [];
  live.forEach(s => {
    const key = `${s.exchange}:${s.symbol}`;
    const prev = latestByKey.get(key);

    if (prev && OPEN_STATUSES.includes(prev.status)) {
      addPatch(prev.id, {
        strength: s.strength,
        manipulation: s.manipulation,
        price: s.price,
        reasons: s.reasons,
        status: RANK[s.status] >= RANK[prev.status] ? s.status : prev.status,
      });
      const ageMin = (now - new Date(prev.created_date).getTime()) / 60000;
      if (ageMin < (COOLDOWN_MINUTES[s.status] ?? 180)) return; // cooldown: no repeat alert
    }

    creates.push({
      symbol: s.symbol,
      exchange: s.exchange,
      status: s.status,
      strength: s.strength,
      manipulation: s.manipulation,
      score: s.score,
      price: s.price,
      price_change_24h: s.priceChange24h ?? null,
      timeframe: "5m/15m/1h",
      reasons: s.reasons || "",
      peak_price: s.price,
      trough_price: s.price,
    });
  });

  const updates = [...patches].map(([id, patch]) => ({ id, ...patch }));
  if (updates.length) await base44.entities.PumpSignalLog.bulkUpdate(updates.slice(0, 200));
  if (creates.length) await base44.entities.PumpSignalLog.bulkCreate(creates.slice(0, 40));

  // Only throttle once the pass actually completed
  try { localStorage.setItem(SYNC_KEY, String(now)); } catch {}

  const open = logs.filter(l => OPEN_STATUSES.includes(l.status)).length;
  return { created: creates.length, updated: updates.length, open };
}