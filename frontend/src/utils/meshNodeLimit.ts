import type { AntennaElement } from '@/types/models';

/**
 * Highest mesh node index of the antenna a dialog targets. Mesh nodes are
 * 1-based (1…N; 0 = ground, negative = appended), so the limit is N.
 * B23: dialogs used the global design mesh (another antenna in multi-antenna
 * designs) and N−1, rejecting the last node.
 */
export function meshNodeLimit(
  elements: AntennaElement[],
  antennaId: string | undefined,
  fallback = 0,
): number {
  const nodes = elements.find((el) => el.id === antennaId)?.mesh?.nodes;
  return nodes ? nodes.length : fallback;
}
