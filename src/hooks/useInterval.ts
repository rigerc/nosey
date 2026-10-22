import {useEffect, useRef} from 'react';

/** setInterval that always calls the latest callback. Pass null to pause. */
export function useInterval(callback: () => void, ms: number | null) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => saved.current(), ms);

    return () => clearInterval(id);
  }, [ms]);
}
