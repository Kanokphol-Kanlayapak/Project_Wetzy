import { useCallback, useEffect, useState } from 'react';

// Loads data from an async `fetcher` (must be a stable reference: module-level or useCallback).
// Keeps the last good data on failure, and exposes reload() / setError() for the screens.
export function useAsyncData(fetcher, fallbackMessage = 'โหลดข้อมูลไม่สำเร็จ') {
  const [state, setState] = useState({ data: null, error: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetcher()
      .then((data) => { if (active) setState({ data, error: '' }); })
      .catch((error) => { if (active) setState((current) => ({ ...current, error: error.message || fallbackMessage })); });
    return () => { active = false; };
  }, [fetcher, fallbackMessage, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  const setError = useCallback((error) => setState((current) => ({ ...current, error })), []);
  return { data: state.data, error: state.error, reload, setError };
}
