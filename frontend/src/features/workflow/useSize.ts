import { useEffect, useState } from 'react';

/**
 * The size of an element in CSS pixels, following layout changes (for canvases
 * and plots that need numbers). Returns a callback ref, so it also works when
 * the element appears later than the component (e.g. after a loading state).
 */
export function useSize<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    });
    ro.observe(element);
    return () => ro.disconnect();
  }, [element]);
  return [ref, size] as const;
}
