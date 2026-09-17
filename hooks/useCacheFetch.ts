"use client";

import { useState, useEffect, useCallback } from 'react';

export function useCacheFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [tick, setTick] = useState(0); // Used to force refetch

  const mutate = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;
    
    // 1. Check session storage for instant data (Cache)
    const cacheKey = `ci_cache_${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    let hasValidCache = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setLoading(false); // Instant load!
        setIsRevalidating(true); // Indicate we are checking for updates
        hasValidCache = true;
      } catch (e) {
        console.error("Failed to parse cache", e);
      }
    } else {
      setLoading(true);
      setIsRevalidating(false);
    }

    // 2. Fetch fresh data in background
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(freshData => {
        if (!isMounted) return;
        
        const freshStr = JSON.stringify(freshData);

        /*
         * Guardar em cache é otimização — falhar nisso não pode custar os dados
         * que já chegaram.
         *
         * `setItem` lança `QuotaExceededError` quando a resposta não cabe nos
         * ~5 MB do sessionStorage, e é fácil chegar lá: um mês inteiro com
         * "todos os status" traz milhares de anúncios. Como a gravação vinha
         * ANTES do `setData`, a exceção pulava direto para o `catch` do fetch e
         * a tela exibia "Erro ao carregar os dados" com a resposta completa na
         * mão. O mesmo vale para janela anônima, onde o armazenamento pode
         * estar bloqueado.
         */
        try {
          sessionStorage.setItem(cacheKey, freshStr);
        } catch (e) {
          console.warn("Cache não gravado (segue sem ele) para", url, e);
        }

        // Only trigger a re-render if we didn't have cache OR if the data actually changed.
        // We do a simple stringify comparison to avoid React re-renders if identical
        if (!hasValidCache || cached !== freshStr) {
          setData(freshData);
        }
        
        setLoading(false);
        setIsRevalidating(false);
        setError(null);
      })
      .catch(err => {
        console.error("Cache fetch error for", url, err);
        if (isMounted) {
          setError(err);
          // If we had cache, we just leave it. If not, stop loading.
          if (!hasValidCache) setLoading(false);
          setIsRevalidating(false);
        }
      });

    return () => { isMounted = false; };
  }, [url, tick]);

  return { data, setData, loading, error, isRevalidating, mutate };
}
