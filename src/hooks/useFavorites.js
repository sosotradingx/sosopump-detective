import { useState, useCallback } from "react";

const KEY = "soso_favorites";

function loadFavorites() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(loadFavorites);

  const toggleFavorite = useCallback((symbol) => {
    setFavorites(prev => {
      const next = prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isFavorite = useCallback((symbol) => favorites.includes(symbol), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}