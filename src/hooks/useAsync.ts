import { useCallback, useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e?.message ?? 'Something went wrong'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);
  return { data, loading, error, reload: run };
}
