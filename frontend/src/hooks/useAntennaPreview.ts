import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectVariableContextNumeric } from '@/store/variablesSlice';
import { parseNumericOrExpression, BUILTIN_CONSTANTS } from '@/utils/expressionEvaluator';
import type { PreviewNode, PreviewEdge } from '@/components/WirePreview3D';
import {
  computeDipolePreview,
  computeLoopPreview,
  computeRodPreview,
} from '@/utils/antennaPreviewGeometry';

/**
 * Safely parse expression, returning fallback on error.
 */
function safeResolve(
  expr: string | number | undefined,
  ctx: Record<string, number>,
  fallback = 0,
): number {
  if (expr == null || expr === '') return fallback;
  try {
    const val = parseNumericOrExpression(String(expr), ctx);
    return Number.isFinite(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Hook for live dipole preview geometry.
 */
export function useDipolePreview(formValues: {
  length?: string;
  radius?: string;
  gap?: string;
  segments?: string;
  position?: { x?: string; y?: string; z?: string };
  orientation?: { x?: string; y?: string; z?: string };
}): { nodes: PreviewNode[]; edges: PreviewEdge[] } {
  const variableContext = useAppSelector(selectVariableContextNumeric);
  const ctx = useMemo(
    () => ({ ...BUILTIN_CONSTANTS, ...variableContext }),
    [variableContext],
  );

  return useMemo(() => {
    const length = safeResolve(formValues.length, ctx);
    if (length <= 0) return { nodes: [], edges: [] };

    return computeDipolePreview({
      length,
      radius: safeResolve(formValues.radius, ctx, 0.001),
      gap: safeResolve(formValues.gap, ctx),
      segments: Math.max(Math.round(safeResolve(formValues.segments, ctx, 10)), 2),
      position: {
        x: safeResolve(formValues.position?.x, ctx),
        y: safeResolve(formValues.position?.y, ctx),
        z: safeResolve(formValues.position?.z, ctx),
      },
      orientation: {
        x: safeResolve(formValues.orientation?.x, ctx),
        y: safeResolve(formValues.orientation?.y, ctx),
        z: safeResolve(formValues.orientation?.z, ctx, 1),
      },
    });
  }, [formValues, ctx]);
}

/**
 * Hook for live loop preview geometry.
 */
export function useLoopPreview(formValues: {
  radius?: string;
  wireRadius?: string;
  segments?: string;
  position?: { x?: string; y?: string; z?: string };
  orientation?: { rotX?: string; rotY?: string; rotZ?: string };
}): { nodes: PreviewNode[]; edges: PreviewEdge[] } {
  const variableContext = useAppSelector(selectVariableContextNumeric);
  const ctx = useMemo(
    () => ({ ...BUILTIN_CONSTANTS, ...variableContext }),
    [variableContext],
  );

  return useMemo(() => {
    const radius = safeResolve(formValues.radius, ctx);
    if (radius <= 0) return { nodes: [], edges: [] };

    return computeLoopPreview({
      radius,
      wireRadius: safeResolve(formValues.wireRadius, ctx, 0.001),
      segments: Math.max(Math.round(safeResolve(formValues.segments, ctx, 8)), 3),
      position: {
        x: safeResolve(formValues.position?.x, ctx),
        y: safeResolve(formValues.position?.y, ctx),
        z: safeResolve(formValues.position?.z, ctx),
      },
      orientation: {
        rotX: safeResolve(formValues.orientation?.rotX, ctx),
        rotY: safeResolve(formValues.orientation?.rotY, ctx),
        rotZ: safeResolve(formValues.orientation?.rotZ, ctx),
      },
    });
  }, [formValues, ctx]);
}

/**
 * Hook for live rod preview geometry.
 */
export function useRodPreview(formValues: {
  start_x?: string;
  start_y?: string;
  start_z?: string;
  end_x?: string;
  end_y?: string;
  end_z?: string;
  radius?: string;
  segments?: string;
}): { nodes: PreviewNode[]; edges: PreviewEdge[] } {
  const variableContext = useAppSelector(selectVariableContextNumeric);
  const ctx = useMemo(
    () => ({ ...BUILTIN_CONSTANTS, ...variableContext }),
    [variableContext],
  );

  return useMemo(() => {
    const start_x = safeResolve(formValues.start_x, ctx);
    const start_y = safeResolve(formValues.start_y, ctx);
    const start_z = safeResolve(formValues.start_z, ctx);
    const end_x = safeResolve(formValues.end_x, ctx);
    const end_y = safeResolve(formValues.end_y, ctx);
    const end_z = safeResolve(formValues.end_z, ctx);

    return computeRodPreview({
      start_x,
      start_y,
      start_z,
      end_x,
      end_y,
      end_z,
      radius: safeResolve(formValues.radius, ctx, 0.001),
      segments: Math.max(Math.round(safeResolve(formValues.segments, ctx, 5)), 1),
    });
  }, [formValues, ctx]);
}
