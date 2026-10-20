import { useMemo } from 'react';
import { Alert, Box } from '@mui/material';
import { Hint } from '@/features/workflow/Workspace';
import { useSize } from '@/features/workflow/useSize';
import UnifiedLinePlot from '@/features/postprocessing/plots/UnifiedLinePlot';
import type { PlotTrace } from '@/types/plotDefinitions';
import type { SolveResult } from '../api';
import { evaluateParameters } from '../expressions';
import { sampleLine } from '../lineProbe';
import { TEMPLATES, type FemModel, type FemView } from '../model';
import { lineEnds } from './views';

type LineView = Extract<FemView, { type: 'line' }>;

/** V or |E| along a line (the antenna plots' line plot), with the textbook curve where one exists. */
function LineResultView({ view, result, model }: { view: LineView; result: SolveResult; model: FemModel }) {
  const ends = lineEnds(view, model);
  const [plotBox, plotSize] = useSize<HTMLDivElement>();
  const data = useMemo(() => {
    if ('error' in ends) return null;
    const samples = sampleLine(result, ends.start, ends.end, view.quantity);
    const fem = samples.filter((s) => s.value != null).map((s) => ({ x: s.s * 1e3, y: s.value! }));
    const template = TEMPLATES.find((t) => t.id === model.template);
    let analytic: { x: number; y: number }[] = [];
    if (template?.fieldAt) {
      const p = evaluateParameters(model.parameters);
      analytic = samples.flatMap((s) => {
        const v = template.fieldAt!.value(s.x, s.y, p);
        return v ? [{ x: s.s * 1e3, y: view.quantity === 'potential' ? v.V : v.E }] : [];
      });
    }
    return { fem, analytic, label: template?.fieldAt?.label, samples: samples.length };
    // ends is derived from view + model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, view, model.parameters, model.template]);

  if ('error' in ends) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Line end points: {ends.error}
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
