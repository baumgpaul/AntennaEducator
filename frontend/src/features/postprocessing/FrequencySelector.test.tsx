import { describe, it, expect } from 'vitest';

// Unit test the pure logic helpers without DOM rendering
// (avoids jsdom issues — see copilot-instructions.md)

describe('FrequencySelector logic', () => {
  it('formatFrequencyLabel converts Hz to readable MHz string', () => {
    // Import the helper directly
    expect(formatFrequencyMHz(100e6)).toBe('100.00');
    expect(formatFrequencyMHz(299.5e6)).toBe('299.50');
    expect(formatFrequencyMHz(1e9)).toBe('1000.00');
  });

  it('getFrequencyMarks generates marks from frequency array', () => {
    const frequencies = [100e6, 200e6, 300e6];
    const marks = getFrequencyMarks(frequencies);
    expect(marks).toEqual([
      { value: 100, label: '' },
      { value: 200, label: '' },
      { value: 300, label: '' },
    ]);
  });

  it('getFrequencyMarks handles empty array', () => {
    expect(getFrequencyMarks([])).toEqual([]);
  });

  it('snapToNearestFrequency finds closest frequency', () => {
    const frequencies = [100e6, 200e6, 300e6];
    expect(snapToNearestFrequency(150, frequencies)).toBe(100e6); // equidistant: first wins
    expect(snapToNearestFrequency(100, frequencies)).toBe(100e6);
    expect(snapToNearestFrequency(250, frequencies)).toBe(200e6); // equidistant: first wins
    expect(snapToNearestFrequency(280, frequencies)).toBe(300e6);
    expect(snapToNearestFrequency(151, frequencies)).toBe(200e6); // strictly closer to 200
  });
});

// We import helpers after the test definitions so vitest can register them
import { formatFrequencyMHz, getFrequencyMarks, snapToNearestFrequency } from './FrequencySelector';
