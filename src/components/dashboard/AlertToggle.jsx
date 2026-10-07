import React, { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAlertsEnabled, setAlertsEnabled, primeAudio, playAlertTone, requestNotifyPermission,
} from "@/lib/notify";

// Enables instant alerts (sound + desktop notification) for STRONG / ACTIVE / DUMP_RISK.
export default function AlertToggle() {
  const [enabled, setEnabled] = useState(getAlertsEnabled);
  const [hint, setHint] = useState(
    getAlertsEnabled() ? "Alerte active" : "Alertă sonoră + notificare desktop la semnale puternice"
  );

  const toggle = async () => {
    if (enabled) {
      setAlertsEnabled(false);
      setEnabled(false);
      setHint("Alertă sonoră + notificare desktop la semnale puternice");
      return;
    }
    primeAudio();
    const perm = await requestNotifyPermission();
    setAlertsEnabled(true);
    setEnabled(true);
    playAlertTone("pump");
    setHint(perm === "granted" ? "Alerte active: sunet + notificare desktop" : "Alerte active: doar sunet (notificările sunt blocate în browser)");
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      title={hint}
      className={enabled
        ? "border-pump-strong/40 text-pump-strong hover:bg-pump-strong/10"
        : "border-border text-muted-foreground hover:text-foreground"}
    >
      {enabled ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      <span className="ml-2 hidden sm:inline">{enabled ? "Alerte ON" : "Alerte"}</span>
    </Button>
  );
}