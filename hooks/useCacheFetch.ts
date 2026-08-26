"use client";

import { useState, useEffect } from 'react';

export function useCacheFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [tick, setTick] = useState(0); // Used to force refetch

  const mutate = () => setTick(t => t + 1);

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
        
        // Update session storage
        sessionStorage.setItem(cacheKey, JSON.stringify(freshData));
        
        // Only trigger a re-render if we didn't have cache OR if the data actually changed.
        // We do a simple stringify comparison to avoid React re-renders if identical
        const freshStr = JSON.stringify(freshData);
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

  return { data, loading, error, isRevalidating, mutate };
}
