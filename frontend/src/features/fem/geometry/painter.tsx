/** SVG of evaluated geometry: fills and outlines, booleans drawn exactly with masks. */
import type { ReactNode } from 'react';
import type { Geo, Pt } from './sequence';

export const pathOf = (lines: Pt[][], close: boolean) =>
  lines.map((l) => `M${l.map(([x, y]) => `${x} ${y}`).join('L')}${close ? 'Z' : ''}`).join('');

const hasFill = (g: Geo): boolean =>
  g.op === 'fill' || (g.op === 'group' ? g.items.some(hasFill) : g.op === 'cut' || g.op === 'common' ? hasFill(g.a) : false);

/**
 * Builds the SVG of geometries (world coordinates, inside a y-flipped group).
 * Masks get unique ids; `px` is the size of a screen pixel in metres (point markers).
 */
export class Painter {
  private n = 0;
  constructor(
    private prefix: string,
    private region: { x: number; y: number; width: number; height: number },
    private px: number,
  ) {}

  /** content shown only inside (or with invert: outside) the surface of g */
  private masked(content: ReactNode, g: Geo, invert: boolean, key: string): ReactNode {
    const id = `${this.prefix}m${this.n++}`;
    return (
      <g key={key}>
        <mask id={id} maskUnits="userSpaceOnUse" {...this.region}>
          <rect {...this.region} fill={invert ? 'white' : 'black'} />
          {this.fill(g, invert ? 'black' : 'white', 'm')}
        </mask>
        <g mask={`url(#${id})`}>{content}</g>
      </g>
    );
  }

  fill(g: Geo, color: string, key = 'f'): ReactNode {
    switch (g.op) {
      case 'fill':
        return <path key={key} d={pathOf(g.loops, true)} fill={color} fillRule="evenodd" />;
      case 'group':
        return <g key={key}>{g.items.map((i, k) => this.fill(i, color, `${key}${k}`))}</g>;
      case 'cut':
        return this.masked(this.fill(g.a, color), g.b, true, key);
      case 'common':
        return this.masked(this.fill(g.a, color), g.b, false, key);
      default:
        return null;
    }
  }

  outline(g: Geo, stroke: Record<string, string | number>, key = 'o'): ReactNode {
    const line = { fill: 'none', vectorEffect: 'non-scaling-stroke' as const, ...stroke };
    switch (g.op) {
      case 'fill':
        return <path key={key} d={pathOf(g.loops, true)} {...line} />;
      case 'lines':
        return <path key={key} d={pathOf(g.paths, false)} {...line} strokeWidth={Number(stroke.strokeWidth ?? 1) + 1} strokeLinecap="round" />;
      case 'dots':
        return (
          <g key={key}>
            {g.pts.map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r={3.5 * this.px} fill={String(stroke.stroke)} />
            ))}
          </g>
        );
      case 'group':
        if (g.inner) return <g key={key}>{g.items.map((item, k) => this.outline(item, stroke, `${key}${k}`))}</g>;
        // each part's outline outside the other parts: no inner edges
        return (
          <g key={key}>
            {g.items.map((item, k) => {
              const others: Geo = { op: 'group', items: g.items.filter((_, j) => j !== k) };
              const o = this.outline(item, stroke, `${key}${k}`);
              return hasFill(others) ? this.masked(o, others, true, `${key}${k}`) : o;
            })}
          </g>
        );
      case 'cut':
        return (
          <g key={key}>
            {this.masked(this.outline(g.a, stroke), g.b, true, 'a')}
            {hasFill(g.a) && this.masked(this.outline(g.b, stroke), g.a, false, 'b')}
          </g>
        );
      case 'common':
        return (
          <g key={key}>
            {this.masked(this.outline(g.a, stroke), g.b, false, 'a')}
            {hasFill(g.a) && this.masked(this.outline(g.b, stroke), g.a, false, 'b')}
          </g>
        );
    }
  }
}
