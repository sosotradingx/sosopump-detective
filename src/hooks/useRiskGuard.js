import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { loadRiskInputs, computeRiskState, exposureState } from "@/lib/riskFactors";

// Starea de risc a contului: kill-switch (pierdere zilnică / serie de pierderi / drawdown)
// + expunerea pozițiilor deschise. Două citiri ieftine, reîmprospătate la 2 minute.
export function useRiskGuard(userEmail) {
  const { data, isLoading } = useQuery({
    queryKey: ["risk-guard", userEmail],
    queryFn: async () => {
      const [inputs, open] = await Promise.all([
        loadRiskInputs(base44, userEmail),
        base44.entities.PaperTrade.filter(
          { created_by: userEmail, status: "open" }, "-created_date", 200,
        ).catch(() => []),
      ]);
      const openTrades = Array.isArray(open) ? open : [];
      const state = computeRiskState({ ...inputs, openTrades });
      return { ...state, exposure: exposureState(openTrades, state.equity) };
    },
    enabled: !!userEmail,
    refetchInterval: 120000,
  });
  return { risk: data, loading: isLoading };
}