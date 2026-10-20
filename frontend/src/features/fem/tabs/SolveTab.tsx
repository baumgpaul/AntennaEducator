import { useMemo, useState } from 'react';
import { Box, Button, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { Hint, PanelSection, Ribbon, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
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
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Solve">
            <Button
              variant="contained"
              size="small"
              startIcon={<PlayArrow />}
              onClick={runSolve}
              disabled={busy !== null || !progress.done.has('physics')}
            >
              {busy === 'solve' ? 'Solving…' : current ? 'Solved — solve again' : 'Assemble and solve K·u = f'}
            </Button>
          </RibbonGroup>
          {result && (
            <RibbonGroup label="Inside the system">
              <Typography variant="body2">Click a triangle to see its element matrix and where it sits in K.</Typography>
            </RibbonGroup>
          )}
        </Ribbon>
      }
      left={
        result && (
          <PanelSection title={current ? 'The linear system' : 'The linear system (of an earlier model)'}>
            <Table size="small">
              <TableBody>
                <Row label="Unknowns (nodes)" value={result.info.n_nodes.toLocaleString()} />
                <Row label="… fixed by Dirichlet" value={result.info.n_prescribed.toLocaleString()} />
                <Row label="… solved for" value={result.info.n_free.toLocaleString()} />
                <Row label="Elements" value={result.info.n_elements.toLocaleString()} />
                <Row label="Nonzeros in K" value={result.info.nonzeros.toLocaleString()} />
                <Row
                  label="… of all entries"
                  value={`${((100 * result.info.nonzeros) / result.info.n_nodes ** 2).toPrecision(2)} %`}
                />
                <Row label="Per row" value={(result.info.nonzeros / result.info.n_nodes).toFixed(1)} />
                <Row label="Assembly" value={`${(1000 * result.info.assembly_seconds).toFixed(1)} ms`} />
                <Row label={`Solve (${result.info.method})`} value={`${(1000 * result.info.solve_seconds).toFixed(1)} ms`} />
                <Row label="‖K·u − f‖/‖f‖" value={result.info.relative_residual.toExponential(1)} />
              </TableBody>
            </Table>
            <Box sx={{ mt: 1 }}>
              <Hint>
                Each node couples only to its neighbours, so almost all of K is zero: sparse solvers handle millions of
                unknowns.
              </Hint>
            </Box>
          </PanelSection>
        )
      }
      right={
        result && (
          <Stack spacing={2}>
            <SparsityPlot sparsity={result.sparsity} highlight={element?.nodes} />
            <Hint>
              Every dot is a nonzero K[i, j]: nodes i and j share a triangle. The scatter comes from the mesher’s node
              numbering; renumbering (e.g. Cuthill–McKee) gathers it near the diagonal.
              {result.sparsity.binned && ` Large system: shown on a ${result.sparsity.grid}² grid.`}
              {element && ' Red: where the selected element adds its entries.'}
            </Hint>
            {element ? <ElementPanel element={element} /> : <Hint>No triangle selected yet: click one in the mesh.</Hint>}
          </Stack>
        )
      }
      rightTitle="Sparsity of K and the element matrix"
      notes={!!error && <StepNotes error={error} />}
    >
      {result ? (
        <MeshView mesh={result.mesh} selectedTriangle={picked} onPickTriangle={setPicked} height="fill" />
      ) : (
        <Typography color="text.secondary" sx={{ p: 3 }}>
          Solve to look inside: the system, its sparsity and the element matrices.
        </Typography>
      )}
    </Workspace>
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
  const fmt = (v: number) => v.toExponential(2);
  return (
    <Box>
      <Typography variant="subtitle2">
        Triangle {element.index} in “{element.domain}”
      </Typography>
      <Typography variant="body2" color="text.secondary">
        nodes {element.nodes.join(', ')}
      </Typography>
      <Box sx={{ my: 1 }}>
        <Hint>
          A = {fmt(element.area)} m², ε·depth = {fmt(element.coefficient)}. Shape functions are linear, so ∇φᵢ is constant:
          K_e[i,j] = ε·depth·A·∇φᵢ·∇φⱼ, exact without numerical integration.
        </Hint>
      </Box>
      <Box component="table" sx={{ borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 11, mb: 1 }}>
        <tbody>
          {element.matrix.map((row, i) => (
            <tr key={i}>
              <td style={{ paddingRight: 6, color: 'gray' }}>{element.nodes[i]}</td>
              {row.map((v, j) => (
                <td key={j} style={{ padding: '2px 4px', textAlign: 'right' }}>
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
      <Hint>
        Rows sum to zero (Σ = {fmt(element.matrix[0].reduce((a, b) => a + b, 0))}): a constant potential has no gradient and
        no energy. That is why at least one potential must be fixed — otherwise K is singular.
      </Hint>
    </Box>
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
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: '100%', aspectRatio: '1', border: '1px solid #ccc', background: '#fff' }}
      aria-label="Sparsity pattern of K"
    >
      {sparsity.rows.map((r, k) => (
        <rect key={k} x={sparsity.cols[k]} y={r} width={dot} height={dot} fill="#1565c0" />
      ))}
      {hl.flatMap((r) => hl.map((c) => <rect key={`h${r}-${c}`} x={c - dot} y={r - dot} width={3 * dot} height={3 * dot} fill="#d32f2f" />))}
    </svg>
  );
}

export default SolveTab;
