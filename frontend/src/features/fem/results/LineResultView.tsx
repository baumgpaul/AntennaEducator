import { useMemo } from 'react';
import { Alert, Typography } from '@mui/material';
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

  if ('error' in ends) return <Alert severity="warning">Line end points: {ends.error}</Alert>;
  if (!data || data.fem.length === 0) {
    return <Alert severity="info">The line does not cross the meshed region: change its end points.</Alert>;
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
    <>
      <UnifiedLinePlot
        traces={traces}
        traceData={{ fem: data.fem, analytic: data.analytic }}
        xAxisConfig={{ label: 'Distance along the line', unit: 'mm', scale: 'linear' }}
        yAxisLeftConfig={{ label: symbol, unit, scale: 'linear' }}
        height={360}
      />
      <Typography variant="caption" color="text.secondary">
        {view.quantity === 'potential'
          ? 'The FEM potential is piecewise linear: it follows the exact curve closely and gets closer as the mesh is refined.'
          : '|E| is constant on each element, so it jumps from triangle to triangle around the exact curve.'}
        {data.fem.length < data.samples && ' Where the line leaves the mesh (an electrode, outside), the plot joins the points across the gap.'}
      </Typography>
    </>
  );
}

export default LineResultView;
