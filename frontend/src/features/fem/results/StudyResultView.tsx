import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import UnifiedLinePlot from '@/features/postprocessing/plots/UnifiedLinePlot';
import { Hint } from '@/features/workflow/Workspace';
import { useSize } from '@/features/workflow/useSize';
import type { PlotTrace } from '@/types/plotDefinitions';
import { femError, solveSummary } from '../api';
import type { FemModel, StudyPoint } from '../model';
import { si } from '../views/geometryDraw';
import { analyticValue, convergence, runStudy, studyKey, studyModels, type StudyView } from './studies';

const UNIT = { capacitance: 'F', energy: 'J' } as const;
const SYMBOL = { capacitance: 'C', energy: 'W' } as const;
const PREFIXES = ['f', 'p', 'n', 'µ', 'm', ''];

/** A factor and unit that make the largest value readable (e.g. 1e12, "pF"). */
function readable(values: number[], unit: string) {
  const max = Math.max(...values.map(Math.abs).filter(Number.isFinite), 0);
  const exp = max > 0 ? Math.max(-5, Math.min(0, Math.floor(Math.log10(max) / 3))) : 0;
  return { factor: 10 ** (-3 * exp), unit: `${PREFIXES[exp + 5]}${unit}` };
}

const trace = (id: string, label: string, color: string, dashed = false): PlotTrace => ({
  id,
  quantity: { source: 'field', fieldId: 'fem', quantity: 'potential' },
  label,
  color,
  lineStyle: dashed ? 'dashed' : 'solid',
  yAxisId: 'left',
});

/** A convergence study or a parameter sweep: run it, follow it, read it. */
function StudyResultView({
  view,
  model,
  onChange,
}: {
  view: StudyView;
  model: FemModel;
  onChange: (v: StudyView) => void;
}) {
  const [live, setLive] = useState<StudyPoint[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [plotBox, plotSize] = useSize<HTMLDivElement>();
  useEffect(() => () => abort.current?.abort(), []);

  let total = 0;
  try {
    total = studyModels(view, model).length;
  } catch {
    total = 0;
  }
  const running = live != null;
  const points = useMemo(() => live ?? view.run?.points ?? [], [live, view.run]);
  const stale = !running && view.run != null && view.run.key !== studyKey(view, model);
  const unit = UNIT[view.quantity];
  const symbol = SYMBOL[view.quantity];

  const start = async () => {
    let items;
    try {
      items = studyModels(view, model);
    } catch (e) {
      setFailed(femError(e).message);
      return;
    }
    setFailed(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLive([]);
    const reference = items.map((i) => analyticValue(i.model, view.quantity));
    const done = await runStudy(items, view.quantity, solveSummary, setLive, ctrl.signal);
    if (abort.current === ctrl) {
      abort.current = null;
      setLive(null);
      onChange({ ...view, run: { key: studyKey(view, model), points: done, reference } });
    }
  };
  const cancel = () => abort.current?.abort();

  const plot = useMemo(() => {
    const good = points.filter((p) => p.value != null);
    if (view.type === 'convergence') {
      const reference = view.run?.reference?.[0] ?? analyticValue(model, view.quantity);
      const c = convergence(points, reference);
      const data = points.flatMap((p, i) => (p.nodes != null && c.errors[i] != null && c.errors[i]! > 0 ? [{ x: p.nodes, y: 100 * c.errors[i]! }] : []));
      // the P1 theory line, through the coarsest measured point: error ∝ h² ∝ 1/N
      const theory = data.length ? data.map((d) => ({ x: d.x, y: (data[0].y * data[0].x) / d.x })) : [];
      return { kind: 'convergence' as const, c, data, theory };
    }
    const { factor, unit: shown } = readable(good.map((p) => p.value!), unit);
    const ref = view.run?.reference;
    const fem = good.map((p) => ({ x: p.x, y: p.value! * factor }));
    const analytic = live
      ? []
      : points.flatMap((p, i) => (ref?.[i] != null ? [{ x: p.x, y: ref[i]! * factor }] : []));
    return { kind: 'sweep' as const, fem, analytic, factor, shown };
  }, [points, view, model, live, unit]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.5, gap: 1 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        {running ? (
          <Button variant="outlined" color="warning" size="small" startIcon={<Stop />} onClick={cancel}>
            Cancel
          </Button>
        ) : (
          <Button variant="contained" size="small" startIcon={<PlayArrow />} onClick={start} disabled={total === 0}>
            {view.run ? 'Run again' : 'Run study'} ({total} solves)
          </Button>
        )}
        {running && (
          <Box sx={{ flex: 1, maxWidth: 320 }}>
            <Typography variant="caption" color="text.secondary">
              Solved {points.length} of {total}
            </Typography>
            <LinearProgress variant="determinate" value={(100 * points.length) / Math.max(total, 1)} />
          </Box>
        )}
        {!running && plot.kind === 'convergence' && plot.c.orderH != null && (
          <Typography variant="body2">
            Measured: error ∝ h<sup>{plot.c.orderH.toFixed(2)}</sup> (against the{' '}
            {plot.c.against === 'analytic' ? 'textbook value' : 'finest mesh'}) — P1 theory: h<sup>2</sup>
          </Typography>
        )}
      </Stack>
      {failed && <Alert severity="warning">{failed}</Alert>}
      {stale && <Alert severity="info">The model changed since this study ran: run it again.</Alert>}

      {points.length === 0 ? (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Typography color="text.secondary" sx={{ maxWidth: 520, textAlign: 'center' }}>
            {view.type === 'convergence'
              ? `Solve the model on ${total} meshes, each with elements √2 times smaller than the one before, and watch the error of ${symbol} shrink.`
              : `Solve the model for ${total} values of “${view.parameter}” and see how ${symbol} depends on it.`}
          </Typography>
        </Box>
      ) : (
        <>
          <Box ref={plotBox} sx={{ flex: 1, minHeight: 220 }}>
            {plotSize.height > 0 &&
              (plot.kind === 'convergence' ? (
                <UnifiedLinePlot
                  traces={[
                    trace('fem', `relative error of ${symbol} (FEM)`, '#1976d2'),
                    trace('theory', '∝ 1/N, i.e. h² (P1 theory)', '#9e9e9e', true),
                  ]}
                  traceData={{ fem: plot.data, theory: plot.theory }}
                  xAxisConfig={{ label: 'Nodes N (unknowns)', unit: '', scale: 'log' }}
                  yAxisLeftConfig={{ label: `Error of ${symbol}`, unit: '%', scale: 'log' }}
                  height={Math.max(plotSize.height - 40, 180)}
                />
              ) : (
                <UnifiedLinePlot
                  traces={[
                    trace('fem', `${symbol} (FEM)`, '#1976d2'),
                    ...(plot.analytic.length ? [trace('analytic', `${symbol} (textbook)`, '#d32f2f', true)] : []),
                  ]}
                  traceData={{ fem: plot.fem, analytic: plot.analytic }}
                  xAxisConfig={{ label: view.type === 'sweep' ? view.parameter : '', unit: '', scale: 'linear' }}
                  yAxisLeftConfig={{ label: symbol, unit: plot.shown, scale: 'linear' }}
                  height={Math.max(plotSize.height - 40, 180)}
                />
              ))}
          </Box>
          <Box sx={{ maxHeight: '35%', overflow: 'auto' }}>
            <PointsTable view={view} points={points} errors={plot.kind === 'convergence' ? plot.c.errors : null} reference={view.run?.reference} unit={unit} />
          </Box>
        </>
      )}
    </Box>
  );
}

function PointsTable({
  view,
  points,
  errors,
  reference,
  unit,
}: {
  view: StudyView;
  points: StudyPoint[];
  errors: (number | null)[] | null;
  reference?: (number | null)[];
  unit: string;
}) {
  const sweep = view.type === 'sweep';
  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          <TableCell>{sweep ? view.parameter : 'element size × '}</TableCell>
          <TableCell align="right">nodes</TableCell>
          <TableCell align="right">{SYMBOL[view.quantity]}</TableCell>
          <TableCell align="right">{sweep ? 'textbook' : 'error'}</TableCell>
          <TableCell align="right">time</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {points.map((p, i) => (
          <TableRow key={i}>
            <TableCell>{p.x}</TableCell>
            {p.error ? (
              <TableCell colSpan={4} sx={{ color: 'warning.main' }}>
                {p.error}
              </TableCell>
            ) : (
              <>
                <TableCell align="right">{p.nodes?.toLocaleString()}</TableCell>
                <TableCell align="right">{si(p.value!, unit)}</TableCell>
                <TableCell align="right">
                  {sweep
                    ? reference?.[i] != null
                      ? `${si(reference[i]!, unit)} (${(100 * (p.value! / reference[i]! - 1)).toFixed(2)} %)`
                      : '—'
                    : errors?.[i] != null
                      ? `${(100 * errors[i]!).toPrecision(3)} %`
                      : 'reference'}
                </TableCell>
                <TableCell align="right">{p.seconds != null ? `${(1000 * p.seconds).toFixed(0)} ms` : ''}</TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default StudyResultView;

export function StudyHint({ view }: { view: StudyView }) {
  return (
    <Hint>
      {view.type === 'convergence'
        ? 'Each mesh has elements √2 times smaller than the one before (twice the nodes). For P1 elements the energy — and so C = 2W/ΔV² — converges like h²: the error halves with every step. Against the finest mesh instead of a textbook value, the last errors look too small.'
        : 'Each point is a full solve with this parameter value; mesh sizes that depend on it change with it. The textbook curve, where the template has one, shows what the simple formula misses (e.g. fringing at the plate edges).'}
    </Hint>
  );
}
