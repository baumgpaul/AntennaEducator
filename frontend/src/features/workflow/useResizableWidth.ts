import { useEffect, useState } from 'react';

/** A panel width that the user can drag (WorkspacePanel `resize`), kept in the browser between visits. */
export function useResizableWidth(storageKey: string, initial: number, min: number, max = 500) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number.parseInt(localStorage.getItem(storageKey) ?? '', 10);
      return Number.isFinite(saved) ? Math.min(max, Math.max(min, saved)) : initial;
    } catch {
      return initial; // storage blocked
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* storage blocked: the width is kept for this visit only */
    }
  }, [storageKey, width]);
  return { width, setWidth, min, max };
}
