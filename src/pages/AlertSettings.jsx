import React from "react";
import { Link } from "react-router-dom";
import { Bell, Settings } from "lucide-react";
import EmailAlertSettings from "@/components/alerts/EmailAlertSettings";

export default function AlertSettings() {
  return (
    <div className="p-4 lg:p-6 max-w-[600px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Alerte Email</h1>
          <p className="text-sm text-muted-foreground">Configurează notificările automate pentru pump-uri</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <EmailAlertSettings />
      </div>

      <div className="bg-secondary/30 border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground flex items-center gap-2"><Settings className="w-4 h-4" /> Cum funcționează?</p>
        <ul className="space-y-1.5 text-xs list-disc list-inside">
          <li>Scanerul rulează automat la fiecare <strong>15 minute</strong></li>
          <li>Analizează top 60 de perechi USDT pe Binance Futures</li>
          <li>Trimite email doar când sunt detectate pump-uri care depășesc pragul setat</li>
          <li>Limita de alerte pe oră previne spam-ul</li>
          <li>Folosește butonul <strong>Test</strong> pentru a verifica că emailul funcționează</li>
        </ul>
      </div>
    </div>
  );
}