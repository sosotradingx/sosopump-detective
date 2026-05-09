import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Technical indicator helpers ──────────────────────────────────────────────
function sma(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = arr.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function ema(arr, period) {
  const k = 2 / (period + 1);
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { result.push(arr[0]); continue; }
    result.push(arr[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function quickScore(klines) {
  if (!klines || klines.length < 30) return { score: 0, status: "INACTIVE" };

  const closes = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const last = closes[closes.length - 1];

  // Volume spike
  const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
  const lastVol = volumes[volumes.length - 1];
  const volSpike = lastVol / avgVol;

  // Price change
  const priceChange = ((last - closes[closes.length - 5]) / closes[closes.length - 5]) * 100;

  // EMA cross
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const emaCross = ema9[ema9.length - 1] > ema21[ema21.length - 1];

  // RSI
  const rsiVal = rsi(closes);

  let score = 0;
  if (volSpike > 3) score += 30;
  else if (volSpike > 2) score += 20;
  else if (volSpike > 1.5) score += 10;

  if (priceChange > 5) score += 25;
  else if (priceChange > 2) score += 15;
  else if (priceChange > 1) score += 8;

  if (emaCross) score += 20;
  if (rsiVal > 60 && rsiVal < 80) score += 15;
  if (volSpike > 2 && priceChange > 3) score += 10; // bonus combo

  let status = "INACTIVE";
  if (score >= 70) status = "STRONG";
  else if (score >= 50) status = "ACTIVE";
  else if (score >= 30) status = "EARLY";

  return { score, status, volSpike: volSpike.toFixed(2), priceChange: priceChange.toFixed(2), rsi: rsiVal.toFixed(1) };
}

// ── Fetch KuCoin data ────────────────────────────────────────────────────────
async function fetchTopPairs(limit = 50) {
  try {
    const res = await fetch("https://api-futures.kucoin.com/api/v1/contracts/active");
    const data = await res.json();
    return data.data
      .filter(t => t.symbol.endsWith("USDT") && parseFloat(t.turnover24h || 0) > 5000000)
      .sort((a, b) => parseFloat(b.turnover24h || 0) - parseFloat(a.turnover24h || 0))
      .slice(0, limit)
      .map(t => t.symbol);
  } catch (e) {
    console.log("[SCANNER] KuCoin error:", e.message);
    return [];
  }
}

async function fetchKlines(symbol, interval = "1h", limit = 50) {
  try {
    const res = await fetch(`https://api-futures.kucoin.com/api/v1/klines?symbol=${symbol}&type=${interval}&limit=${limit}`);
    const data = await res.json();
    // KuCoin returns [time, open, high, low, close, volume]
    return data.data || [];
  } catch (e) {
    console.log(`[SCANNER] KuCoin klines error for ${symbol}:`, e.message);
    return [];
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both scheduled (no user) and manual invocation (with user)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === "admin";
    } catch (_) {
      // scheduled call — no user token, proceed with service role
    }

    // Fetch all active alert preferences
    const prefs = await base44.asServiceRole.entities.AlertPreference.filter({ enabled: true });
    if (!prefs || prefs.length === 0) {
      return Response.json({ message: "No active alert preferences found.", sent: 0 });
    }

    // Scan market
    const symbols = await fetchTopPairs(60);
    const results = [];

    for (let i = 0; i < symbols.length; i += 5) {
      const chunk = symbols.slice(i, i + 5);
      const chunkResults = await Promise.all(
        chunk.map(async (symbol) => {
          const klines = await fetchKlines(symbol, "1h", 50);
          const analysis = quickScore(klines);
          return { symbol, ...analysis };
        })
      );
      results.push(...chunkResults);
      // Rate limit protection
      if (i + 5 < symbols.length) await new Promise(r => setTimeout(r, 200));
    }

    // Filter pumps worth alerting
    const pumps = results.filter(r => r.status === "STRONG" || r.status === "ACTIVE");
    pumps.sort((a, b) => b.score - a.score);

    let totalSent = 0;
    const now = new Date();

    for (const pref of prefs) {
      // Check hourly rate limit window
      const windowStart = pref.hour_window_start ? new Date(pref.hour_window_start) : null;
      const hourPassed = !windowStart || (now - windowStart) >= 3600000;

      let sentThisHour = hourPassed ? 0 : (pref.alerts_sent_this_hour || 0);
      const maxPerHour = pref.max_alerts_per_hour || 5;

      if (sentThisHour >= maxPerHour) continue;

      // Find pumps that match this user's threshold
      const minScore = pref.min_score || 70;
      const allowedStatuses = pref.pump_statuses || ["STRONG", "ACTIVE"];
      const matching = pumps.filter(p => p.score >= minScore && allowedStatuses.includes(p.status));

      if (matching.length === 0) continue;

      // Build email
      const topPumps = matching.slice(0, 5);
      const subject = `🚨 SOSO PUMP Alert: ${topPumps.length} semnal${topPumps.length > 1 ? "e" : ""} detectat${topPumps.length > 1 ? "e" : ""}`;

      const rows = topPumps.map(p =>
        `<tr>
          <td style="padding:8px 12px;font-weight:bold;font-family:monospace">${p.symbol}</td>
          <td style="padding:8px 12px;color:${p.status === 'STRONG' ? '#4CAF50' : '#FF9800'}">${p.status}</td>
          <td style="padding:8px 12px;text-align:center"><strong>${p.score}%</strong></td>
          <td style="padding:8px 12px;text-align:center">${p.volSpike}x</td>
          <td style="padding:8px 12px;text-align:center;color:${parseFloat(p.priceChange) >= 0 ? '#4CAF50' : '#EF5350'}">${p.priceChange}%</td>
          <td style="padding:8px 12px;text-align:center">${p.rsi}</td>
        </tr>`
      ).join("");

      const body = `
<!DOCTYPE html>
<html>
<body style="background:#0d1117;color:#e6edf3;font-family:Inter,sans-serif;padding:24px;margin:0">
  <div style="max-width:600px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <span style="font-size:28px">🔥</span>
      <div>
        <h1 style="margin:0;font-size:20px;color:#f97316">SOSO PUMP Detective</h1>
        <p style="margin:0;font-size:12px;color:#8b949e">Alert Scanner · ${now.toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}</p>
      </div>
    </div>

    <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 4px 0;font-size:14px;color:#8b949e">Semnale detectate (scor ≥ ${minScore}%)</p>
      <p style="margin:0;font-size:32px;font-weight:bold;color:#f97316">${topPumps.length}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden">
      <thead>
        <tr style="background:#21262d">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#8b949e">SIMBOL</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#8b949e">STATUS</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#8b949e">SCOR</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#8b949e">VOL SPIKE</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#8b949e">PREȚ %</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#8b949e">RSI</th>
        </tr>
      </thead>
      <tbody style="font-size:14px">
        ${rows}
      </tbody>
    </table>

    <p style="margin-top:20px;font-size:12px;color:#8b949e;text-align:center">
      Ai primit acest email deoarece ai activat alertele în SOSO PUMP Detective.<br/>
      Poți dezactiva alertele din pagina <strong>Settings → Alerte Email</strong>.
    </p>
  </div>
</body>
</html>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: pref.user_email,
        subject,
        body,
      });

      // Update rate-limit counters
      await base44.asServiceRole.entities.AlertPreference.update(pref.id, {
        last_alert_sent_at: now.toISOString(),
        alerts_sent_this_hour: sentThisHour + 1,
        hour_window_start: hourPassed ? now.toISOString() : pref.hour_window_start,
      });

      sentThisHour++;
      totalSent++;
    }

    return Response.json({ message: "Scan complete", pumps_found: pumps.length, emails_sent: totalSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});