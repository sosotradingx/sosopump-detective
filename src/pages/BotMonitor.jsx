import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import SessionRow from "@/components/botmonitor/SessionRow";

const HEARTBEAT_TIMEOUT_MS = 90 * 1000; // sesiune orfană dacă n-a trimis heartbeat de 90s

export default function BotMonitor() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: sessions = [] } = useQuery({
    queryKey: ["bot-sessions", user?.email],
    queryFn: () => base44.entities.BotSession.filter({ created_by: user.email }, "-created_date", 50),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const terminate = useMutation({
    mutationFn: async (session) => {
      // Invalidează sesiunea în localStorage (funcționează și pentru alte tab-uri din același browser)
      try { localStorage.setItem("soso_bot_session_id", `terminated_${Date.now()}`); } catch {}
      await base44.entities.BotSession.update(session.id, { status: "stopped" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-sessions"] }),
  });

  const getStatus = (session) => {
    if (session.status === "stopped") return "stopped";
    const lastBeat = new Date(session.last_heartbeat || session.started_at).getTime();
    return (Date.now() - lastBeat) > HEARTBEAT_TIMEOUT_MS ? "orphaned" : "active";
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1000px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" /> Bot Status
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitorizează sesiunile de scanare ale botului și oprește-le pe cele orfane sau duplicate.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nicio sesiune de scanare înregistrată încă.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Sesiune</th>
                  <th className="text-left p-3">Pornit</th>
                  <th className="text-left p-3">Ultimul semnal</th>
                  <th className="text-center p-3">TF</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-center p-3">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    status={getStatus(session)}
                    onTerminate={() => terminate.mutate(session)}
                    isTerminating={terminate.isPending && terminate.variables?.id === session.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}