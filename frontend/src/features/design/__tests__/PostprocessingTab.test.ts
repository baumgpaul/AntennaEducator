/**
 * Unit tests for PostprocessingTab helper functions:
 * - resolveFieldType: maps view item + requestedFields → fieldType
 * - getFieldUnit: maps fieldType → unit string
 * - getFieldLabel: maps fieldType → display label
 */
import { describe, it, expect } from 'vitest';
import { resolveFieldType, getFieldUnit, getFieldLabel } from '../PostprocessingTab';
import type { ViewItem } from '@/types/postprocessing';
import type { FieldDefinition } from '@/types/fieldDefinitions';

// Minimal ViewItem factory
function makeItem(overrides: Partial<ViewItem> = {}): ViewItem {
  return {
    id: 'item-1',
    name: 'Test item',
    type: 'field-magnitude',
    visible: true,
    fieldId: 'field-1',
    colorMap: 'jet',
    valueRangeMode: 'auto',
    ...overrides,
  } as ViewItem;
}

// Minimal FieldDefinition factory
function makeFD(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'field-1',
    name: 'E-field',
    fieldType: 'E',
    shape: 'plane',
    center: [0, 0, 0],
    size: 1,
    resolution: 10,
    normalPreset: 'XY',
    ...overrides,
  } as FieldDefinition;
}

describe('resolveFieldType', () => {
  it('returns E when requestedFields is null', () => {
    expect(resolveFieldType(makeItem(), null)).toBe('E');
  });

  it('returns E when requestedFields is undefined', () => {
    expect(resolveFieldType(makeItem(), undefined)).toBe('E');
  });

  it('returns E when item has no fieldId', () => {
    const item = makeItem({ fieldId: undefined });
    expect(resolveFieldType(item, [makeFD()])).toBe('E');
  });

  it('returns E when field not found', () => {
    const item = makeItem({ fieldId: 'non-existent' });
    expect(resolveFieldType(item, [makeFD()])).toBe('E');
  });

  it('returns E for E-field definition', () => {
    expect(resolveFieldType(makeItem(), [makeFD({ fieldType: 'E' })])).toBe('E');
  });

  it('returns H for H-field definition', () => {
    expect(resolveFieldType(makeItem(), [makeFD({ fieldType: 'H' })])).toBe('H');
  });

  it('returns poynting for poynting field definition', () => {
    expect(resolveFieldType(makeItem(), [makeFD({ fieldType: 'poynting' })])).toBe('poynting');
  });

  it('finds correct field among multiple definitions', () => {
    const fields = [
      makeFD({ id: 'field-a', fieldType: 'E' }),
      makeFD({ id: 'field-1', fieldType: 'H' }),
    ];
    expect(resolveFieldType(makeItem(), fields)).toBe('H');
  });
});

describe('getFieldUnit', () => {
  it('returns V/m for E', () => {
    expect(getFieldUnit('E')).toBe('V/m');
  });

  it('returns A/m for H', () => {
    expect(getFieldUnit('H')).toBe('A/m');
  });

  it('returns W/m² for poynting', () => {
    expect(getFieldUnit('poynting')).toBe('W/m\u00B2');
  });
});

describe('getFieldLabel', () => {
  it('returns |E| for E magnitude', () => {
    expect(getFieldLabel('E', false)).toBe('|E|');
  });

  it('returns E-Field for E vector', () => {
    expect(getFieldLabel('E', true)).toBe('E-Field');
  });

  it('returns |H| for H magnitude', () => {
    expect(getFieldLabel('H', false)).toBe('|H|');
  });

  it('returns H-Field for H vector', () => {
    expect(getFieldLabel('H', true)).toBe('H-Field');
  });

  it('returns |S| for poynting magnitude', () => {
    expect(getFieldLabel('poynting', false)).toBe('|S|');
  });

  it('returns Poynting for poynting vector', () => {
    expect(getFieldLabel('poynting', true)).toBe('Poynting');
  });

  it('defaults isVector to false', () => {
    expect(getFieldLabel('E')).toBe('|E|');
  });
});
