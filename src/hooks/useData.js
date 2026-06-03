import { useState, useEffect } from 'react';

const cache = new Map();

export function useData(key) {
  const [data, setData] = useState(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache.has(key)) {
      setData(cache.get(key));
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/${key}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        cache.set(key, d);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [key]);

  return { data, loading, error };
}
