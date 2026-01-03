/**
 * LineViewPanel - Displays multiple scalar plots stacked vertically
 * Shows impedance, voltage, and current plots with shared X-axis (frequency)
 */

import { Box, Typography, Divider } from '@mui/material';
import { useAppSelector } from '@/store/hooks';
import ImpedancePlot from './plots/ImpedancePlot';
import VoltagePlot from './plots/VoltagePlot';
import CurrentPlot from './plots/CurrentPlot';
import type { ViewConfiguration } from '@/types/postprocessing';

interface LineViewPanelProps {
  view: ViewConfiguration;
}

function LineViewPanel({ view }: LineViewPanelProps) {
  // Get solver results from Redux
  const results = useAppSelector((state) => state.solver.results);
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const elements = useAppSelector((state) => state.design.elements);

  // Filter visible items
  const visibleItems = view.items.filter((item) => item.visible);

  if (visibleItems.length === 0) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          p: 4 
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No plots added to this view. Use the ribbon menu to add impedance, voltage, or current plots.
        </Typography>
      </Box>
    );
  }

  // Render each plot type
  const renderPlot = (item: ViewConfiguration['items'][0], index: number) => {
    switch (item.type) {
      case 'impedance-plot': {
        // Check if we have single result or sweep data
        if (frequencySweep && frequencySweep.impedances) {
          const impedanceData = frequencySweep.frequencies.map((freq, i) => ({
            frequency: freq,
            real: frequencySweep.impedances[i].real,
            imag: frequencySweep.impedances[i].imag,
          }));
          return (
            <ImpedancePlot 
              key={item.id} 
              data={impedanceData}
              displayMode={item.displayMode || 'rectangular'}
              title={item.label || 'Input Impedance'}
            />
          );
        } else if (results?.impedance) {
          // Single frequency point
          const singlePoint = [{
            frequency: results.frequency || 300e6,
            real: results.impedance.real,
            imag: results.impedance.imag,
          }];
          return (
            <ImpedancePlot 
              key={item.id} 
              data={singlePoint}
              displayMode={item.displayMode || 'rectangular'}
              title={item.label || 'Input Impedance'}
            />
          );
        }
        return (
          <Box key={item.id} sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No impedance data available. Run the solver first.
            </Typography>
          </Box>
        );
      }

      case 'voltage-plot': {
        if (frequencySweep && frequencySweep.voltages) {
          const portData = frequencySweep.voltages[item.portNumber];
          if (portData) {
            const voltageData = frequencySweep.frequencies.map((freq, i) => ({
              frequency: freq,
              magnitude: Math.abs(portData[i]),
              phase: Math.atan2(portData[i].imag || 0, portData[i].real || Math.abs(portData[i])),
            }));
            return (
              <VoltagePlot 
                key={item.id} 
                data={voltageData}
                portNumber={item.portNumber}
                title={item.label}
              />
            );
          }
        }
        return (
          <Box key={item.id} sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No voltage data available for Port {item.portNumber}. Run a frequency sweep.
            </Typography>
          </Box>
        );
      }

      case 'current-plot': {
        if (frequencySweep && frequencySweep.currents) {
          const antennaData = frequencySweep.currents[item.antennaId];
          const antenna = elements.find((el) => el.id === item.antennaId);
          
          if (antennaData) {
            const currentData = frequencySweep.frequencies.map((freq, i) => ({
              frequency: freq,
              magnitude: Math.abs(antennaData[i]),
              phase: Math.atan2(antennaData[i].imag || 0, antennaData[i].real || Math.abs(antennaData[i])),
            }));
            return (
              <CurrentPlot 
                key={item.id} 
                data={currentData}
                antennaId={item.antennaId}
                antennaName={antenna?.name}
                title={item.label}
              />
            );
          }
        }
        return (
          <Box key={item.id} sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No current data available for antenna {item.antennaId}. Run a frequency sweep.
            </Typography>
          </Box>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', bgcolor: 'background.default' }}>
      {visibleItems.map((item, index) => (
        <Box key={item.id}>
          {renderPlot(item, index)}
          {index < visibleItems.length - 1 && <Divider />}
        </Box>
      ))}
    </Box>
  );
}

export default LineViewPanel;
