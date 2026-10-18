import { describe, it, expect } from 'vitest';

// Every drei <Text> must use the bundled font: without `font`, troika fetches
// fonts from cdn.jsdelivr.net, which the CSP blocks (labels disappear).
const sources = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const IMPORTS_DREI_TEXT = /import \{[^}]*\bText\b[^}]*\} from '@react-three\/drei'/;

describe('3D text labels under the CSP', () => {
  it('pass the bundled font to every drei <Text>', () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.includes('__tests__') || !IMPORTS_DREI_TEXT.test(src)) continue;
      for (const tag of src.match(/<Text\b[^>]*>/gs) ?? []) {
        if (!tag.includes('font={TEXT_FONT_URL}')) offenders.push(`${path}: ${tag.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds the 3D label components (the scan is not vacuous)', () => {
    const withText = Object.values(sources).filter((src) => IMPORTS_DREI_TEXT.test(src));
    expect(withText.length).toBeGreaterThanOrEqual(3);
  });
});
