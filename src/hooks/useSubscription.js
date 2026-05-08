import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useSubscription() {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me) {
          const subs = await base44.entities.Subscription.filter(
            { user_email: me.email, status: "active" },
            "-created_date",
            1
          );
          if (subs.length > 0) {
            const sub = subs[0];
            // Check if not expired
            if (!sub.expires_at || new Date(sub.expires_at) > new Date()) {
              setPlan(sub.plan || "free");
            } else {
              setPlan("free");
            }
          } else {
            setPlan("free");
          }
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const isAdmin = user?.role === "admin";
  // Adminii au acces complet la toate funcționalitățile
  const isPro = isAdmin || plan === "pro" || plan === "elite";
  const isElite = isAdmin || plan === "elite";
  const isFree = !isAdmin && plan === "free";

  return { user, plan, isPro, isElite, isFree, isAdmin, loading };
}