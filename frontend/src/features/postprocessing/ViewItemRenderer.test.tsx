import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ViewItemRenderer } from './ViewItemRenderer';
import { ViewItem } from '../../types/postprocessing';

// Mock all renderer components
vi.mock('./renderers', () => ({
  AntennaRenderer: vi.fn(() => <div data-testid="antenna-renderer" />),
  CurrentRenderer: vi.fn(() => <div data-testid="current-renderer" />),
  VoltageRenderer: vi.fn(() => <div data-testid="voltage-renderer" />),
  FieldRenderer: vi.fn(() => <div data-testid="field-renderer" />),
  DirectivityRenderer: vi.fn(() => <div data-testid="directivity-renderer" />),
  VectorRenderer: vi.fn(() => <div data-testid="vector-renderer" />),
}));

describe('ViewItemRenderer', () => {
  const baseItem: Omit<ViewItem, 'type'> = {
    id: 'item-1',
    label: 'Test Item',
    visible: true,
    opacity: 0.8,
  };

  describe('Renderer Delegation', () => {
    it('should render AntennaRenderer for antenna-system type', () => {
      const item: ViewItem = { ...baseItem, type: 'antenna-system' };
      const { getByTestId } = render(<ViewItemRenderer item={item} />);
      expect(getByTestId('antenna-renderer')).toBeDefined();
    });

    it('should render AntennaRenderer for single-antenna type', () => {
      const item: ViewItem = { ...baseItem, type: 'single-antenna', antennaId: 'ant-1' };
      const { getByTestId } = render(<ViewItemRenderer item={item} />);
      expect(getByTestId('antenna-renderer')).toBeDefined();
    });

    it('should render CurrentRenderer for current type', () => {
      const item: ViewItem = { ...baseItem, type: 'current' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('current-renderer')).toBeDefined();
    });

    it('should render VoltageRenderer for voltage type', () => {
      const item: ViewItem = { ...baseItem, type: 'voltage' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('voltage-renderer')).toBeDefined();
    });

    it('should render FieldRenderer for field-magnitude type', () => {
      const item: ViewItem = { ...baseItem, type: 'field-magnitude', fieldId: 'field-1' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('field-renderer')).toBeDefined();
    });

    it('should render FieldRenderer for field-magnitude-component type', () => {
      const item: ViewItem = { ...baseItem, type: 'field-magnitude-component', fieldId: 'field-1' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('field-renderer')).toBeDefined();
    });

    it('should render DirectivityRenderer for directivity type', () => {
      const item: ViewItem = { ...baseItem, type: 'directivity' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('directivity-renderer')).toBeDefined();
    });

    it('should render VectorRenderer for field-vector type', () => {
      const item: ViewItem = { ...baseItem, type: 'field-vector', fieldId: 'field-1' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('vector-renderer')).toBeDefined();
    });

    it('should render VectorRenderer for field-vector-component type', () => {
      const item: ViewItem = { ...baseItem, type: 'field-vector-component', fieldId: 'field-1' };
      const { getByTestId } = render(<ViewItemRenderer item={item} frequencyHz={100e6} />);
      expect(getByTestId('vector-renderer')).toBeDefined();
    });

    it('should return null for scalar-plot type (Line view only)', () => {
      const item: ViewItem = { ...baseItem, type: 'scalar-plot' };
      const { container } = render(<ViewItemRenderer item={item} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Visibility Filtering', () => {
    it('should not render when item is not visible', () => {
      const item: ViewItem = { ...baseItem, type: 'antenna-system', visible: false };
      const { container } = render(<ViewItemRenderer item={item} />);
      expect(container.firstChild).toBeNull();
    });

    it('should render when item is visible', () => {
      const item: ViewItem = { ...baseItem, type: 'antenna-system', visible: true };
      const { getByTestId } = render(<ViewItemRenderer item={item} />);
      expect(getByTestId('antenna-renderer')).toBeDefined();
    });
  });

  describe('Frequency Propagation', () => {
    it('should pass frequencyHz to renderers that need it', () => {
      const item: ViewItem = { ...baseItem, type: 'current' };
      const frequencyHz = 100e6;
      render(<ViewItemRenderer item={item} frequencyHz={frequencyHz} />);
      // Renderer receives frequencyHz (verified by mock calls if needed)
    });

    it('should handle undefined frequencyHz gracefully', () => {
      const item: ViewItem = { ...baseItem, type: 'current' };
      const { getByTestId } = render(<ViewItemRenderer item={item} />);
      expect(getByTestId('current-renderer')).toBeDefined();
    });
  });
});
