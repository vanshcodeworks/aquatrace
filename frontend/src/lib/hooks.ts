import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 4000,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      const result = await fnRef.current().catch(() => undefined);
      if (!active) return;
      if (result !== undefined) {
        setData(result as T);
        setError(null);
      }
      setLoading(false);
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh: run, setData };
}
