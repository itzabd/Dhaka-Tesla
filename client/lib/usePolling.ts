'use client';
import { useEffect, useRef, useState } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 3000
): {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Poll failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, error, loading, refresh: load };
}
