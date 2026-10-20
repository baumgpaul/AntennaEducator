import { useMemo } from 'react';
import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { SolveResult } from '../api';
import { evaluateParameters } from '../expressions';
import { TEMPLATES, type FemModel } from '../model';
import { si } from '../views/geometryDraw';

/** Integral quantities: capacitance two ways against the textbook, charges, energy. */
function QuantitiesView({ result, model }: { result: SolveResult; model: FemModel }) {
  const template = TEMPLATES.find((t) => t.id === model.template);
  const analytic = useMemo(() => {
    if (!template?.analytic) return null;
    try {
      return { label: template.analytic.label, value: template.analytic.value(evaluateParameters(model.parameters), model) };
    } catch {
      return null;
    }
  }, [template, model]);

  const c = result.capacitance;
  const perDepth = model.depth === 1 ? ' (per metre)' : '';
  const diff = (v: number) => (analytic ? ` (${(100 * (v / analytic.value - 1)).toFixed(2)} %)` : '');

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      {c && (
        <Box>
          <Typography variant="subtitle2" color="text.secondary">
            Capacitance{perDepth}
          </Typography>
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell sx={{ pl: 0 }}>from the charge, Q/ΔV</TableCell>
                <TableCell align="right">
                  {si(c.from_charge, 'F')}
                  {diff(c.from_charge)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ pl: 0 }}>from the energy, 2W/ΔV²</TableCell>
                <TableCell align="right">
                  {si(c.from_energy, 'F')}
                  {diff(c.from_energy)}
                </TableCell>
              </TableRow>
              {analytic && (
                <TableRow>
                  <TableCell sx={{ pl: 0 }}>{analytic.label}</TableCell>
                  <TableCell align="right">{si(analytic.value, 'F')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary">
            Both FEM values agree to rounding: for two electrodes Q·ΔV = uᵀKu exactly. Refine the mesh and watch them
            converge — integral quantities are far more accurate than local fields.
          </Typography>
        </Box>
      )}
      <Box>
        <Typography variant="subtitle2" color="text.secondary">
          Charge on each electrode
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ pl: 0 }}>Boundary</TableCell>
              <TableCell align="right">reaction K·u − f</TableCell>
              <TableCell align="right" sx={{ pr: 0 }}>
                flux ∮ D·n
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(result.charge).map(([b, q]) => (
              <TableRow key={b}>
                <TableCell sx={{ pl: 0 }}>{b}</TableCell>
                <TableCell align="right">{si(q, 'C')}</TableCell>
                <TableCell align="right" sx={{ pr: 0 }}>
                  {si(result.charge_from_flux[b], 'C')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary">
          The reaction charge uses the whole FE solution and converges faster than D·n of the elements at the boundary.
        </Typography>
      </Box>
      <Box>
        <Typography variant="subtitle2" color="text.secondary">
          Field energy W = ½·uᵀKu{perDepth}: {si(result.energy, 'J')}
        </Typography>
        {Object.entries(result.energy_by_domain).map(([d, w]) => (
          <Typography key={d} variant="body2">
            {d}: {si(w, 'J')} ({((100 * w) / result.energy).toFixed(1)} %)
          </Typography>
        ))}
      </Box>
    </Stack>
  );
}

export default QuantitiesView;
