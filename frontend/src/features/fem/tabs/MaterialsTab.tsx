import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Hint, PanelSection, Ribbon, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
import { MATERIAL_LIBRARY, type Material } from '../model';
import type { FemStudio } from '../useFemStudio';
import GeometryView from '../views/GeometryView';
import { colorOf, evaluateShapes } from '../views/geometryDraw';
import { StepNotes } from './common';

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
  const notes = progress.notes.materials;

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Equation">
            <Typography variant="body2">
              −∇·(ε₀ εr ∇V) = ρ — εr of each domain is the coefficient of this equation there.
            </Typography>
          </RibbonGroup>
        </Ribbon>
      }
      left={
        <PanelSection title="Material of each domain">
          <Stack spacing={2}>
            {domains.map((d) => {
              const mat = model.materials[d];
              const inLibrary =
                mat && MATERIAL_LIBRARY.some((x) => x.name === mat.name && x.relative_permittivity === mat.relative_permittivity);
              return (
                <Stack key={d} spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: fill[d], border: 1, borderColor: 'divider' }} />
                    <Typography variant="body2" noWrap title={d}>
                      {d}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      select
                      size="small"
                      label="Material"
                      sx={{ flex: 1, minWidth: 0 }}
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
                        sx={{ width: 76 }}
                        value={mat.relative_permittivity}
                        inputProps={{ min: 0, step: 0.1 }}
                        onChange={(e) => set(d, { ...mat, relative_permittivity: Math.max(Number(e.target.value), 1e-6) })}
                      />
                    )}
                  </Stack>
                </Stack>
              );
            })}
            {domains.length === 0 && <Hint>Find the domains on the Geometry tab first.</Hint>}
            <Hint>
              Inside a domain εr is constant; across an interface it jumps. FEM needs no extra condition there: the normal
              flux ε ∂V/∂n stays continuous by itself.
            </Hint>
          </Stack>
        </PanelSection>
      }
      notes={!!notes?.length && <StepNotes notes={notes} />}
    >
      <GeometryView shapes={drawn.shapes} bounds={drawn.bounds} holes={model.holes} fill={fill} height="fill" />
    </Workspace>
  );
}

export default MaterialsTab;
