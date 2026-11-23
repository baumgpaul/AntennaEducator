import { useMemo } from 'react';
import { Alert, Box } from '@mui/material';
import { Hint } from '@/features/workflow/Workspace';
import { useSize } from '@/features/workflow/useSize';
import UnifiedLinePlot from '@/features/postprocessing/plots/UnifiedLinePlot';
import type { PlotTrace } from '@/types/plotDefinitions';
import type { SolveResult } from '../api';
import type { FemModel, FemView } from '../model';
import { lineProbeData } from './exports';

type LineView = Extract<FemView, { type: 'line' }>;

/** V or |E| along a line (the antenna plots' line plot), with the textbook curve where one exists. */
function LineResultView({ view, result, model }: { view: LineView; result: SolveResult; model: FemModel }) {
  const [plotBox, plotSize] = useSize<HTMLDivElement>();
  // the same samples as the CSV export
  const probe = useMemo(() => lineProbeData(view, result, model), [view, result, model]);
  const data = useMemo(() => {
    if ('error' in probe) return null;
    const mm = (s: { s: number }) => s.s * 1e3;
    return {
      fem: probe.samples.flatMap((s) => (s.fem != null ? [{ x: mm(s), y: s.fem }] : [])),
      analytic: probe.samples.flatMap((s) => (s.analytic != null ? [{ x: mm(s), y: s.analytic }] : [])),
      label: probe.label,
      samples: probe.samples.length,
    };
  }, [probe]);

  if ('error' in probe) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Line end points: {probe.error}
      </Alert>
    );
  }
  if (!data || data.fem.length === 0) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        The line does not cross the meshed region: change its end points.
      </Alert>
    );
  }
  const unit = view.quantity === 'potential' ? 'V' : 'V/m';
  const symbol = view.quantity === 'potential' ? 'V' : '|E|';
  const traces: PlotTrace[] = [
    {
      id: 'fem',
      quantity: { source: 'field', fieldId: 'fem', quantity: view.quantity === 'potential' ? 'potential' : 'E_magnitude' },
      label: `${symbol} (FEM)`,
      color: '#1976d2',
      lineStyle: 'solid',
      yAxisId: 'left',
    },
  ];
  if (data.analytic.length) {
    traces.push({ ...traces[0], id: 'analytic', label: `${symbol} — ${data.label}`, color: '#d32f2f', lineStyle: 'dashed' });
  }
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.5 }}>
      <Box ref={plotBox} sx={{ flex: 1, minHeight: 0 }}>
        {plotSize.height > 0 && (
          <UnifiedLinePlot
            traces={traces}
            traceData={{ fem: data.fem, analytic: data.analytic }}
            xAxisConfig={{ label: 'Distance along the line', unit: 'mm', scale: 'linear' }}
            yAxisLeftConfig={{ label: symbol, unit, scale: 'linear' }}
            height={Math.max(plotSize.height - 40, 200)}
          />
        )}
      </Box>
      {data.fem.length < data.samples && (
        <Hint>Where the line leaves the mesh (an electrode, outside), the plot joins the points across the gap.</Hint>
      )}
    </Box>
  );
}

export default LineResultView;
