// Instant alerts for strong signals: sound (WebAudio, no asset) + desktop notification.
// Deduped per symbol+status so the same setup does not ring twice in 30 minutes.

const ENABLED_KEY = "soso_alerts_enabled";
const SEEN_KEY = "soso_alerts_seen";
const ALERT_STATUSES = ["STRONG", "ACTIVE", "DUMP_RISK"];
const REPEAT_MS = 30 * 60 * 1000;
const LOGO = "https://media.base44.com/images/public/69b1ed87d348d325856ccd73/f4bcf56fd_image.png";

export function getAlertsEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
}

export function setAlertsEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? "1" : "0"); } catch {}
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotifyPermission() {
  if (!notificationsSupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}

let audioCtx = null;

// Must run inside a user gesture (browser autoplay policy) — the alert toggle does this.
export function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}

export function playAlertTone(kind = "pump") {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const freqs = kind === "dump" ? [720, 470] : [520, 780, 1040];
    const t0 = audioCtx.currentTime;
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const at = t0 + i * 0.14;
      osc.type = "triangle";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.15);
    });
  } catch {}
}

// Fires sound + notifications for new STRONG / ACTIVE / DUMP_RISK signals.
// Returns how many alerts were raised.
export function pushSignalAlerts(signals, { exchange } = {}) {
  if (!getAlertsEnabled()) return 0;

  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {}; } catch { seen = {}; }

  const now = Date.now();
  const fired = [];
  for (const s of signals || []) {
    if (!ALERT_STATUSES.includes(s.status)) continue;
    const key = `${exchange}:${s.symbol}:${s.status}`;
    if (seen[key] && now - seen[key] < REPEAT_MS) continue;
    seen[key] = now;
    fired.push(s);
    if (fired.length >= 3) break;
  }

  Object.keys(seen).forEach(k => { if (now - seen[k] > 6 * 3600000) delete seen[k]; });
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}

  if (!fired.length) return 0;

  const onlyDump = fired.every(f => f.status === "DUMP_RISK");
  playAlertTone(onlyDump ? "dump" : "pump");

  if (notificationPermission() === "granted") {
    fired.forEach(s => {
      try {
        const pct = Number(s.priceChange24h);
        const body = [
          `Strength ${s.strength ?? 0}% · Manip ${s.manipulation ?? "—"}%`,
          Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% / 24h` : null,
          s.reasons ? s.reasons.slice(0, 110) : null,
        ].filter(Boolean).join("\n");
        new Notification(`${s.status} · ${s.symbol.replace("USDT", "")}/USDT`, {
          body,
          tag: `${exchange}-${s.symbol}-${s.status}`,
          icon: LOGO,
          silent: true,
        });
      } catch {}
    });
  }

  return fired.length;
}