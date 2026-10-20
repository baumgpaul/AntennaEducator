import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Download, Gradient, ShowChart, TableChart } from '@mui/icons-material';
import ResultsWorkspace, { type ViewType } from '@/features/results/ResultsWorkspace';
import type { FemView } from '../model';
import type { FemStudio } from '../useFemStudio';
import FieldResultView from '../results/FieldResultView';
import LineResultView from '../results/LineResultView';
import QuantitiesView from '../results/QuantitiesView';
import ViewProperties from '../results/ViewProperties';
import { defaultViews, lineEnds, newView } from '../results/views';
import { StepNotes } from './common';

const VIEW_TYPES: ViewType<FemView['type']>[] = [
  { type: 'field', label: 'Field', icon: <Gradient fontSize="small" /> },
  { type: 'line', label: 'Line probe', icon: <ShowChart fontSize="small" /> },
  { type: 'quantities', label: 'Quantities', icon: <TableChart fontSize="small" /> },
];

function ResultsTab({ studio }: { studio: FemStudio }) {
  const { model, progress, busy, error, exportFiles, update } = studio;
  const result = studio.result?.data;
  const views = useMemo(() => model.views ?? defaultViews(model), [model]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setViews = (next: FemView[]) => update((m) => ({ ...m, views: next }));
  const probeLines = useMemo(
    () =>
      views.flatMap((v) => {
        if (v.type !== 'line') return [];
        const ends = lineEnds(v, model);
        return 'error' in ends ? [] : [ends];
      }),
    [views, model],
  );

  if (!result) {
    return <Typography color="text.secondary">Solve the model on the Solve tab first.</Typography>;
  }
  const current = progress.done.has('results');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 1 }}>
      {!current && <StepNotes notes={['These results belong to an earlier version of the model: solve again.']} />}
      <StepNotes error={error} />
      <ResultsWorkspace
        viewTypes={VIEW_TYPES}
        views={views}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={(type) => {
          const v = newView(type, views, result.mesh.nodes);
          setViews([...views, v]);
          setSelectedId(v.id);
        }}
        onRename={(id, name) => setViews(views.map((v) => (v.id === id ? { ...v, name } : v)))}
        onDelete={(id) => setViews(views.filter((v) => v.id !== id))}
        renderView={(v) =>
          v.type === 'field' ? (
            <FieldResultView view={v} result={result} probeLines={probeLines} />
          ) : v.type === 'line' ? (
            <LineResultView view={v} result={result} model={model} />
          ) : (
            <QuantitiesView result={result} model={model} />
          )
        }
        renderProperties={(v) =>
          v.type === 'quantities' ? null : (
            <ViewProperties view={v} onChange={(nv) => setViews(views.map((x) => (x.id === nv.id ? nv : x)))} />
          )
        }
        actions={
          <Button size="small" startIcon={<Download />} onClick={exportFiles} disabled={busy !== null}>
            {busy === 'export' ? 'Exporting…' : 'openCFS files'}
          </Button>
        }
      />
      <Typography variant="caption" color="text.secondary">
        openCFS files: simulation.xml, mat.xml and model.msh — put them in one folder; simulation.xml is the input file.
      </Typography>
    </Box>
  );
}

export default ResultsTab;
