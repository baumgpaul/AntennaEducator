import type { Source } from '@/types/models';
import { parseComplex } from './complexNumber';

/**
 * Number of feeds a user would count in a source list.
 *
 * The preprocessor models a gap dipole's balanced feed as two ground-referenced
 * sources of the same type with opposite amplitudes (voltage: 0→feed_lower +V and
 * 0→feed_upper −V; current: +I into feed_lower, −I into feed_upper). That pair is
 * one feed, so a plain dipole must read "1 Source", not "2 Sources".
 */
export function countFeeds(sources: readonly Source[]): number {
  const paired = new Set<number>();
  let feeds = 0;
  for (let i = 0; i < sources.length; i++) {
    if (paired.has(i)) continue;
    feeds++;
    for (let j = i + 1; j < sources.length; j++) {
      if (!paired.has(j) && isBalancedPair(sources[i], sources[j])) {
        paired.add(j);
        break;
      }
    }
  }
  return feeds;
}

function isGroundReferenced(s: Source): boolean {
  if (s.type === 'voltage') return s.node_start === 0 && s.node_end != null && s.node_end !== 0;
  return s.node_start != null && s.node_start !== 0 && (s.node_end == null || s.node_end === 0);
}

function isBalancedPair(a: Source, b: Source): boolean {
  if (a.type !== b.type || !isGroundReferenced(a) || !isGroundReferenced(b)) return false;
  const nodeA = a.type === 'voltage' ? a.node_end : a.node_start;
  const nodeB = b.type === 'voltage' ? b.node_end : b.node_start;
  if (nodeA === nodeB) return false;
  const za = parseComplex(a.amplitude);
  const zb = parseComplex(b.amplitude);
  const scale = Math.max(Math.hypot(za.real, za.imag), Math.hypot(zb.real, zb.imag));
  if (scale === 0) return true; // 0 V rod mode: both halves are zero
  const tol = 1e-9 * scale;
  return Math.abs(za.real + zb.real) <= tol && Math.abs(za.imag + zb.imag) <= tol;
}
