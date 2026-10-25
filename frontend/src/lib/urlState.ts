import { useCallback, useEffect, useState } from "react";

/**
 * A piece of state mirrored into the URL query string so any view can be shared as a link
 * (e.g. ?tab=day&date=2026-01-15&gate=09:20). Uses replaceState: no history spam.
 */
export function useUrlState(key: string, fallback: string): [string, (value: string) => void] {
  const read = useCallback(() => new URLSearchParams(window.location.search).get(key) ?? fallback, [key, fallback]);
  const [value, setValue] = useState(read);

  useEffect(() => {
    const onPop = () => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      const params = new URLSearchParams(window.location.search);
      if (next === fallback) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    },
    [key, fallback],
  );

  return [value, update];
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
