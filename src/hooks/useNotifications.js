// Browser Notifications Hook
export function useNotifications() {
  const requestPermission = async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    const result = await Notification.requestPermission();
    return result === "granted";
  };

  const notify = async (title, body, options = {}) => {
    const ok = await requestPermission();
    if (!ok) return;
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: options.tag || title,
      ...options,
    });
    setTimeout(() => n.close(), 8000);
  };

  const notifyStrongPump = (symbol, score) => {
    notify(`🔥 STRONG PUMP: ${symbol}`, `Scor ${score}/100 detectat! Intră rapid.`, { tag: `pump-${symbol}` });
  };

  const notifyVolumeSpike = (symbol, spikeMultiplier) => {
    notify(`⚡ VOLUME SPIKE: ${symbol}`, `Volum x${spikeMultiplier.toFixed(1)} față de medie — Early Entry posibil!`, { tag: `vol-${symbol}` });
  };

  const notifyShortSetup = (symbol, score) => {
    notify(`📉 SHORT SETUP: ${symbol}`, `Semnal de vânzare detectat. Scor: ${score}`, { tag: `short-${symbol}` });
  };

  const isSupported = "Notification" in window;
  const permission = isSupported ? Notification.permission : "denied";

  return { notify, notifyStrongPump, notifyVolumeSpike, notifyShortSetup, requestPermission, permission, isSupported };
}