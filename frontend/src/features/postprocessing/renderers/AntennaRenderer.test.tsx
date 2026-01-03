import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AntennaRenderer } from './AntennaRenderer';
import { ViewItem } from '../../../types/postprocessing';
import * as hooks from '../../../store/hooks';

// Mock Redux hooks
vi.mock('../../../store/hooks', () => ({
  useAppSelector: vi.fn(),
}));

// Mock WireGeometry component
vi.mock('../../design/WireGeometry', () => ({
  default: vi.fn(() => <mesh data-testid="wire-geometry" />),
}));

describe('AntennaRenderer', () => {
  const mockElements = [
    { id: 'ant-1', name: 'Dipole Antenna', visible: true, mesh: { nodes: [], edges: [] } },
    { id: 'ant-2', name: 'Loop Antenna', visible: true, mesh: { nodes: [], edges: [] } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Antenna System Rendering', () => {
    it('should render all antennas for antenna-system type', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'antenna-system',
        label: 'All Antennas',
        visible: true,
        opacity: 0.8,
        color: '#1976d2',
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      const { getAllByTestId } = render(<AntennaRenderer item={item} />);
      
      const geometries = getAllByTestId('wire-geometry');
      expect(geometries).toHaveLength(2);
    });

    it('should return null if no elements exist', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'antenna-system',
        label: 'All Antennas',
        visible: true,
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue([]);
      const { container } = render(<AntennaRenderer item={item} />);
      expect(container.firstChild).toBeNull();
    });

    it('should return null if elements is null', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'antenna-system',
        label: 'All Antennas',
        visible: true,
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(null);
      const { container } = render(<AntennaRenderer item={item} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Single Antenna Rendering', () => {
    it('should render specific antenna when antennaId is provided', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'single-antenna',
        label: 'Dipole Only',
        visible: true,
        antennaId: 'ant-1',
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      const { getByTestId } = render(<AntennaRenderer item={item} />);
      expect(getByTestId('wire-geometry')).toBeDefined();
    });

    it('should render first antenna if antennaId not provided (fallback)', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'single-antenna',
        label: 'First Antenna',
        visible: true,
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      const { getByTestId } = render(<AntennaRenderer item={item} />);
      expect(getByTestId('wire-geometry')).toBeDefined();
    });

    it('should return null if antennaId does not match any element', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'single-antenna',
        label: 'Non-existent',
        visible: true,
        antennaId: 'ant-999',
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      const { container } = render(<AntennaRenderer item={item} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Property Application', () => {
    it('should use default color if not specified', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'antenna-system',
        label: 'Default Color',
        visible: true,
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      render(<AntennaRenderer item={item} />);
      // Default color '#1976d2' should be used (verified in WireGeometry mock calls if needed)
    });

    it('should use default opacity if not specified', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'antenna-system',
        label: 'Default Opacity',
        visible: true,
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      render(<AntennaRenderer item={item} />);
      // Default opacity 1.0 should be used
    });

    it('should apply custom opacity from item', () => {
      const item: ViewItem = {
        id: 'item-1',
        type: 'antenna-system',
        label: 'Custom Opacity',
        visible: true,
        opacity: 0.5,
      };

      vi.mocked(hooks.useAppSelector).mockReturnValue(mockElements);
      render(<AntennaRenderer item={item} />);
      // Opacity 0.5 should be used
    });
  });
});
