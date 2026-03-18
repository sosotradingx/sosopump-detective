import { useEffect, useRef, useCallback } from "react";
import { fetchTopPairs } from "../components/scanner/binanceApi";

const SPIKE_THRESHOLD = 3.0; // x3 față de medie = spike

export function useVolumeMonitor(favorites, onSpike) {
  const prevVolumes = useRef({});
  const intervalRef = useRef(null);

  const checkVolumes = useCallback(async () => {
    if (!favorites || favorites.length === 0) return;
    const pairs = await fetchTopPairs("USDT", 100, 0);
    const favPairs = pairs.filter(p => favorites.includes(p.symbol));

    for (const pair of favPairs) {
      const prev = prevVolumes.current[pair.symbol];
      if (prev && pair.volume > 0) {
        // Compare last 1h volume approximation (quoteVolume / 24)
        const hourlyAvg = pair.quoteVolume / 24;
        // We use the raw tick volume from websocket — approximate with current vs stored
        const ratio = pair.quoteVolume / (prev.quoteVolume || pair.quoteVolume);
        // Simpler: check if volume spike flag is set
        if (pair.volume > prev.volume * SPIKE_THRESHOLD) {
          onSpike && onSpike(pair.symbol, pair.volume / prev.volume);
        }
      }
      prevVolumes.current[pair.symbol] = { volume: pair.volume, quoteVolume: pair.quoteVolume };
    }
  }, [favorites, onSpike]);

  useEffect(() => {
    if (!favorites || favorites.length === 0) return;
    checkVolumes();
    intervalRef.current = setInterval(checkVolumes, 30000); // every 30s
    return () => clearInterval(intervalRef.current);
  }, [checkVolumes]);
}