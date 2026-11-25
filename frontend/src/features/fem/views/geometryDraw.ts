/** Shared colours and number formatting of the FEM views. */

/** Distinct, colour-blind-friendly domain colours (Okabe–Ito). */
export const DOMAIN_COLORS = ['#56B4E9', '#E69F00', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];

export const colorOf = (index: number) => DOMAIN_COLORS[index % DOMAIN_COLORS.length];

/** Viridis-like colour map, t in [0, 1]. */
const STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
export function colormap(t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const c = STOPS[i].map((a, k) => Math.round(a + f * (STOPS[i + 1][k] - a)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Engineering format with SI prefix: 3.54e-10 F → "354 pF". */
export function si(value: number, unit: string, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`;
  const prefixes = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G'];
  const exp = Math.max(-5, Math.min(3, Math.floor(Math.log10(Math.abs(value)) / 3)));
  return `${(value / 10 ** (3 * exp)).toPrecision(digits)} ${prefixes[exp + 5]}${unit}`;
}
