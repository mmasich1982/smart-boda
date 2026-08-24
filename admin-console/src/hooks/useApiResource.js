// admin-console/src/hooks/useApiResource.js
// AUDIT FIX (Admin Console, Medium): "Every page implements its own
// loading/error/refresh logic ad hoc; several swallow fetch errors silently (a failed
// request just leaves the table looking empty, with no indication anything went
// wrong)." One hook, consistent behavior everywhere it's adopted.
import { useCallback, useEffect, useState } from 'react';

export function useApiResource(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.resolve(fetcher())
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || err.message || 'Something went wrong.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => refresh(), [refresh]);

  return { data, loading, error, refresh };
}
