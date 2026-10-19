import { useMemo, useState } from 'react';
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import type { FemStudio } from '../useFemStudio';
import MeshView from '../views/MeshView';
import { elementInfo } from '../p1';
import { StepNotes } from './common';

function SolveTab({ studio }: { studio: FemStudio }) {
  const { progress, busy, error, runSolve } = studio;
  const result = studio.result?.data;
  const current = progress.done.has('solve');
  const [picked, setPicked] = useState<number | null>(null);
  const element = useMemo(
    () => (result && picked != null ? elementInfo(result.mesh, picked, result.permittivity, result.depth) : null),
    [result, picked],
  );

  return (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      <Paper variant="outlined" sx={{ width: 360, p: 2, overflow: 'auto' }}>
        <Stack spacing={2}>
          <Button variant="contained" onClick={runSolve} disabled={busy !== null || !progress.done.has('physics')}>
            {busy === 'solve' ? 'Solving…' : current ? 'Solved — solve again' : 'Assemble and solve K·u = f'}
          </Button>
          <StepNotes error={error} />
          {result && (
            <>
              <Typography variant="subtitle2" color="text.secondary">
                The linear system {current ? '' : '(of an earlier model)'}
              </Typography>
              <Table size="small">
                <TableBody>
                  <Row label="Unknowns (nodes)" value={result.info.n_nodes.toLocaleString()} />
                  <Row label="… fixed by Dirichlet conditions" value={result.info.n_prescribed.toLocaleString()} />
                  <Row label="… solved for" value={result.info.n_free.toLocaleString()} />
                  <Row label="Elements" value={result.info.n_elements.toLocaleString()} />
                  <Row
                    label="Nonzeros in K"
                    value={`${result.info.nonzeros.toLocaleString()} (${((100 * result.info.nonzeros) / result.info.n_nodes ** 2).toPrecision(2)} % of all entries)`}
                  />
                  <Row label="Per row (node + neighbours)" value={(result.info.nonzeros / result.info.n_nodes).toFixed(1)} />
                  <Row label="Assembly" value={`${(1000 * result.info.assembly_seconds).toFixed(1)} ms`} />
                  <Row label={`Solve (${result.info.method})`} value={`${(1000 * result.info.solve_seconds).toFixed(1)} ms`} />
                  <Row label="Relative residual ‖K·u − f‖/‖f‖" value={result.info.relative_residual.toExponential(1)} />
                </TableBody>
              </Table>
              <Typography variant="body2" color="text.secondary">
                Each node couples only to its neighbours, so almost all of K is zero: sparse solvers handle millions of
                unknowns.
              </Typography>
            </>
          )}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'auto' }}>
        {result ? (
          <>
            <Typography variant="subtitle2">Click a triangle to see its element matrix</Typography>
            <MeshView mesh={result.mesh} selectedTriangle={picked} onPickTriangle={setPicked} height={300} />
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-start">
              <Stack spacing={1} sx={{ width: 280 }}>
                <Typography variant="subtitle2">Sparsity pattern of K</Typography>
                <SparsityPlot sparsity={result.sparsity} highlight={element?.nodes} />
                <Typography variant="caption" color="text.secondary">
                  Every dot is a nonzero K[i, j]: nodes i and j share a triangle. The scatter comes from the mesher’s node
                  numbering; renumbering (e.g. Cuthill–McKee) gathers it near the diagonal.
                  {result.sparsity.binned && ` Large system: shown on a ${result.sparsity.grid}² grid.`}
                  {element && ' Red: where the selected element adds its entries.'}
                </Typography>
              </Stack>
              <Box sx={{ flex: 1, minWidth: 320 }}>
                {element ? (
                  <ElementPanel element={element} />
                ) : (
                  <Typography color="text.secondary">No triangle selected yet.</Typography>
                )}
              </Box>
            </Stack>
          </>
        ) : (
          <Typography color="text.secondary">Solve to look inside: the system, its sparsity and the element matrices.</Typography>
        )}
      </Paper>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <TableRow>
      <TableCell sx={{ pl: 0 }}>{label}</TableCell>
      <TableCell align="right" sx={{ pr: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </TableCell>
    </TableRow>
  );
}

function ElementPanel({ element }: { element: ReturnType<typeof elementInfo> }) {
  const fmt = (v: number) => v.toExponential(3);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="subtitle2">
        Triangle {element.index} in “{element.domain}” — nodes {element.nodes.join(', ')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        A = {fmt(element.area)} m², ε·depth = {fmt(element.coefficient)}. Shape functions are linear, so ∇φᵢ is constant:
        K_e[i,j] = ε·depth·A·∇φᵢ·∇φⱼ, exact without numerical integration.
      </Typography>
      <Box component="table" sx={{ borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 12 }}>
        <tbody>
          {element.matrix.map((row, i) => (
            <tr key={i}>
              <td style={{ paddingRight: 8, color: 'gray' }}>{element.nodes[i]}</td>
              {row.map((v, j) => (
                <td key={j} style={{ padding: '2px 8px', textAlign: 'right' }}>
                  {fmt(v)}
                </td>
              ))}
              <td style={{ paddingLeft: 12, color: 'gray' }}>Σ = {fmt(row.reduce((a, b) => a + b, 0))}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Rows sum to zero: a constant potential has no gradient and no energy. That is why at least one potential must be
        fixed — otherwise K is singular.
      </Typography>
    </Paper>
  );
}

function SparsityPlot({
  sparsity,
  highlight,
}: {
  sparsity: { n: number; binned: boolean; grid?: number; rows: number[]; cols: number[] };
  highlight?: number[];
}) {
  const size = sparsity.binned ? sparsity.grid! : sparsity.n;
  const scale = sparsity.binned ? sparsity.grid! / sparsity.n : 1;
  const dot = Math.max(size / 150, 0.6);
  // distinct cells: on a binned plot several nodes can share one
  const hl = [...new Set((highlight ?? []).map((i) => Math.floor(i * scale)))];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: 280, height: 280, border: '1px solid #ccc', background: '#fff' }}>
      {sparsity.rows.map((r, k) => (
        <rect key={k} x={sparsity.cols[k]} y={r} width={dot} height={dot} fill="#1565c0" />
      ))}
      {hl.flatMap((r) => hl.map((c) => <rect key={`h${r}-${c}`} x={c - dot} y={r - dot} width={3 * dot} height={3 * dot} fill="#d32f2f" />))}
    </svg>
  );
}

export default SolveTab;
