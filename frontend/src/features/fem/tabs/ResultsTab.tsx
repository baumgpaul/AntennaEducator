import { useMemo, useState } from 'react';
import { Button, Tooltip, Typography } from '@mui/material';
import { RibbonButtons, RibbonGroup } from '@/features/workflow/Workspace';
import { Download, Gradient, PictureAsPdf, ShowChart, TableChart, TrendingDown, Tune, ViewInAr } from '@mui/icons-material';
import { downloadFile } from '@/utils/exportData';
import ResultsWorkspace, { type ViewType } from '@/features/results/ResultsWorkspace';
import type { FemView } from '../model';
import type { FemStudio } from '../useFemStudio';
import FieldResultView from '../results/FieldResultView';
import LineResultView from '../results/LineResultView';
import QuantitiesView from '../results/QuantitiesView';
import StudyResultView from '../results/StudyResultView';
import ViewProperties from '../results/ViewProperties';
import { defaultViews, lineEnds, newView } from '../results/views';
import { exportName, femVtu, lineProbeCsv, studyCsv } from '../results/exports';
import { potentialImage } from '../results/fieldImage';
import { StepNotes } from './common';

const VIEW_TYPES: ViewType<FemView['type']>[] = [
  { type: 'field', label: 'Field', icon: <Gradient fontSize="small" /> },
  { type: 'line', label: 'Line probe', icon: <ShowChart fontSize="small" /> },
  { type: 'quantities', label: 'Quantities', icon: <TableChart fontSize="small" /> },
  { type: 'convergence', label: 'Mesh convergence', icon: <TrendingDown fontSize="small" /> },
  { type: 'sweep', label: 'Parameter sweep', icon: <Tune fontSize="small" /> },
];

function ResultsTab({ studio }: { studio: FemStudio }) {
  const { model, progress, busy, error, exportFiles, update } = studio;
  const result = studio.result?.data;
  const views = useMemo(() => model.views ?? defaultViews(model), [model]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const setViews = (next: FemView[]) => update((m) => ({ ...m, views: next }));
  // against the latest views: a study finishing late must not undo edits made meanwhile
  const replaceView = (nv: FemView) =>
    update((m) => ({ ...m, views: (m.views ?? defaultViews(m)).map((x) => (x.id === nv.id ? nv : x)) }));
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
    return (
      <Typography
        sx={{
          color: "text.secondary",
          p: 3
        }}>Solve the model on the Solve tab first.
              </Typography>
    );
  }
  const current = progress.done.has('results');
  // the view the workspace shows (it falls back to the first one)
  const selected = views.find((v) => v.id === selectedId) ?? views[0] ?? null;
  const csvView =
    selected?.type === 'line' || ((selected?.type === 'convergence' || selected?.type === 'sweep') && selected.run?.points.length)
      ? selected
      : null;

  const exportVtu = () => downloadFile(femVtu(result), exportName(model, 'solution', 'vtu'), 'application/xml');
  const exportCsv = () => {
    if (!csvView) return;
    try {
      const text = csvView.type === 'line' ? lineProbeCsv(csvView, result, model) : studyCsv(csvView, model);
      downloadFile(text, exportName(model, csvView.name, 'csv'), 'text/csv;charset=utf-8');
      setExportError(null);
    } catch (e) {
      setExportError((e as Error).message);
    }
  };
  const exportPdf = async () => {
    setReporting(true);
    setExportError(null);
    try {
      const { buildFemReport } = await import('../results/femReport');
      const name = studio.project?.name ?? model.name;
      buildFemReport({ model, projectName: name, result: { data: result, current }, fieldImage: potentialImage(result) }).save(
        exportName(model, 'report', 'pdf'),
      );
    } catch (e) {
      setExportError(`PDF report failed: ${(e as Error).message}`);
    } finally {
      setReporting(false);
    }
  };

  return (
    <ResultsWorkspace
      viewTypes={VIEW_TYPES}
      views={views}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={(type) => {
        const v = newView(type, views, result.mesh.nodes, { model, capacitance: result.capacitance != null });
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
        ) : v.type === 'convergence' || v.type === 'sweep' ? (
          <StudyResultView key={v.id} view={v} model={model} onChange={replaceView} />
        ) : (
          <QuantitiesView result={result} model={model} />
        )
      }
      renderProperties={(v) =>
        v.type === 'quantities' ? null : (
          <ViewProperties view={v} onChange={replaceView} parameters={Object.keys(model.parameters)} />
        )
      }
      actions={
        <RibbonGroup label="Export">
          <RibbonButtons>
            <Tooltip title="The solution on its mesh for ParaView (.vtu): V per node; E, D, |E|, domain and εr per element">
              <span>
                <Button startIcon={<ViewInAr />} onClick={exportVtu}>
                  ParaView
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={csvView ? `“${csvView.name}” as CSV` : 'Select a line probe or a study that has run'}>
              <span>
                <Button startIcon={<TableChart />} onClick={exportCsv} disabled={!csvView}>
                  CSV
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Model, potential picture, quantities and studies as a PDF report">
              <span>
                <Button startIcon={<PictureAsPdf />} onClick={exportPdf} disabled={reporting}>
                  {reporting ? 'Building…' : 'PDF report'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="One zip with simulation.xml, mat.xml and model.msh — unpack it into a folder; simulation.xml is the input file">
              <span>
                <Button startIcon={<Download />} onClick={exportFiles} disabled={busy !== null}>
                  {busy === 'export' ? 'Exporting…' : 'openCFS files'}
                </Button>
              </span>
            </Tooltip>
          </RibbonButtons>
        </RibbonGroup>
      }
      notes={
        (!current || error || exportError) && (
          <StepNotes
            notes={current ? undefined : ['These results belong to an earlier version of the model: solve again.']}
            error={error ?? exportError}
          />
        )
      }
    />
  );
}

export default ResultsTab;
