import { useState, useEffect, useRef, useCallback } from 'react';

export const REFRESH_EVENT = 'creveton:refresh';

/**
 * Charge des données via `fetcher`, gère loading/erreur, et se rafraîchit :
 *  - quand `deps` change (comparées par sérialisation),
 *  - sur l'événement global REFRESH_EVENT (bouton « Actualiser » du header),
 *  - en option toutes les `pollMs` ms (badge Live du dashboard).
 *
 * `fetcher` est lu via une ref → `load` reste stable (deps littérales pour le linter).
 */
export function useApiData(fetcher, deps = [], { pollMs } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcherRef.current();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const depKey = JSON.stringify(deps);
  useEffect(() => { load(); }, [depKey, load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [load]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => load(), pollMs);
    return () => clearInterval(id);
  }, [pollMs, load]);

  return { data, loading, error, refetch: load, setData };
}

export function triggerRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}
