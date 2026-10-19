import { Alert, Box, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { MATERIAL_LIBRARY, type Material } from '../model';
import type { FemStudio } from '../useFemStudio';
import GeometryView from '../views/GeometryView';
import { colorOf, evaluateShapes } from '../views/geometryDraw';
import { Section, StepNotes } from './common';

const CUSTOM = '__custom__';

function MaterialsTab({ studio }: { studio: FemStudio }) {
  const { model, update, progress } = studio;
  const drawn = evaluateShapes(model);
  const domains = progress.domains;

  const set = (domain: string, material: Material | null) =>
    update((m) => {
      const materials = { ...m.materials };
      if (material) materials[domain] = material;
      else delete materials[domain];
      return { ...m, materials };
    });

  // colour the geometry by material, so equal materials look equal
  const names = [...new Set(Object.values(model.materials).map((mat) => mat.name))];
  const fill = Object.fromEntries(
    domains.map((d) => [d, model.materials[d] ? colorOf(names.indexOf(model.materials[d].name)) : '#ffffff']),
  );

  return (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      <Paper variant="outlined" sx={{ width: 380, p: 2, overflow: 'auto' }}>
        <Stack spacing={2}>
          <Alert severity="info" icon={false}>
            <Typography variant="body2">
              Electrostatics solves <b>−∇·(ε₀ εr ∇V) = ρ</b>. The relative permittivity εr of each domain is the coefficient of
              this equation there.
            </Typography>
          </Alert>
          <Section title="Material of each domain">
            {domains.map((d) => {
              const mat = model.materials[d];
              const inLibrary = mat && MATERIAL_LIBRARY.some((x) => x.name === mat.name && x.relative_permittivity === mat.relative_permittivity);
              return (
                <Stack key={d} direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ width: 100 }} noWrap title={d}>
                    {d}
                  </Typography>
                  <TextField
                    select
                    size="small"
                    label="Material"
                    sx={{ flex: 1 }}
                    value={mat ? (inLibrary ? mat.name : CUSTOM) : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM) set(d, { name: `${d} material`, relative_permittivity: mat?.relative_permittivity ?? 1 });
                      else set(d, MATERIAL_LIBRARY.find((x) => x.name === v) ?? null);
                    }}
                  >
                    {MATERIAL_LIBRARY.map((x) => (
                      <MenuItem key={x.name} value={x.name}>
                        {x.name} (εr {x.relative_permittivity})
                      </MenuItem>
                    ))}
                    <MenuItem value={CUSTOM}>Custom…</MenuItem>
                  </TextField>
                  {mat && !inLibrary && (
                    <TextField
                      size="small"
                      type="number"
                      label="εr"
                      sx={{ width: 80 }}
                      value={mat.relative_permittivity}
                      inputProps={{ min: 0, step: 0.1 }}
                      onChange={(e) => set(d, { ...mat, relative_permittivity: Math.max(Number(e.target.value), 1e-6) })}
                    />
                  )}
                </Stack>
              );
            })}
            {domains.length === 0 && (
              <Typography color="text.secondary">Find the domains on the Geometry tab first.</Typography>
            )}
          </Section>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <StepNotes notes={progress.notes.materials} />
        <GeometryView shapes={drawn.shapes} bounds={drawn.bounds} holes={model.holes} fill={fill} />
        <Typography variant="body2" color="text.secondary">
          Inside a domain εr is constant; across an interface it jumps. FEM needs no extra condition there: the normal flux
          ε ∂V/∂n stays continuous by itself.
        </Typography>
      </Paper>
    </Box>
  );
}

export default MaterialsTab;
