import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook for animating the phase of a harmonic electromagnetic field.
 *
 * Drives a phase value φ from 0 to 2π at a configurable speed (cycles/second).
 * Uses requestAnimationFrame for smooth updates. The phase represents the
 * temporal evolution of a monochromatic field: F(r,t) = Re[F(r)·e^{jωt}].
 *
 * @param isPlaying Whether the animation is currently playing
 * @param speed Animation speed in cycles per second (e.g., 1.0 = one full cycle/sec)
 * @returns { phase, setPhase, phaseDeg } — current phase in radians, setter, and degrees
 */
export function useAnimationPhase(
  isPlaying: boolean,
  speed: number,
): {
  phase: number;
  setPhase: (phase: number) => void;
  phaseDeg: number;
} {
  const [phase, setPhaseState] = useState(0);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);

  const setPhase = useCallback((newPhase: number) => {
    // Normalize to [0, 2π)
    const normalized = ((newPhase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    phaseRef.current = normalized;
    setPhaseState(normalized);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    lastTimeRef.current = performance.now();

    const tick = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      // Advance phase: Δφ = 2π · speed · Δt
      phaseRef.current = (phaseRef.current + dt * speed * 2 * Math.PI) % (2 * Math.PI);
      setPhaseState(phaseRef.current);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speed]);

  const phaseDeg = (phase * 180) / Math.PI;

  return { phase, setPhase, phaseDeg };
}
