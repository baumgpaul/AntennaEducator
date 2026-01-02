import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Grid,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  Box,
} from '@mui/material';
import { ViewInAr, PanoramaFishEye } from '@mui/icons-material';

const steps = ['Region Type', 'Shape', 'Parameters', 'Field Type', 'Field/Near Far'];

interface AddFieldDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (fieldDefinition: any) => void;
}

/**
 * AddFieldDialog - Multi-step wizard for creating field regions
 * 
 * Steps:
 * 1. Select 2D or 3D region
 * 2. Select shape (plane/circle for 2D, sphere/cube for 3D)
 * 3. Define parameters (center point, dimensions, sampling)
 * 4. Select field type (E, H, or Poynting) - single selection only
 * 5. Choose near or far field
 */
export function AddFieldDialog({ open, onClose, onCreate }: AddFieldDialogProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [regionType, setRegionType] = useState<'2D' | '3D'>('2D');
  const [shape, setShape] = useState<'plane' | 'circle' | 'sphere' | 'cube'>('plane');
  const [center, setCenter] = useState({ x: 0, y: 0, z: 50 });
  const [dimensions, setDimensions] = useState({ width: 100, height: 100, radius: 50 });
  const [normalPreset, setNormalPreset] = useState<'XY' | 'YZ' | 'XZ'>('XY');
  const [sampling, setSampling] = useState({ x: 20, y: 20, radial: 10, angular: 20 });
  const [fieldType, setFieldType] = useState<'E' | 'H' | 'poynting'>('E');
  const [farField, setFarField] = useState(false);
  const nameCounterRef = useRef(1);
  const [fieldName, setFieldName] = useState('E-field 2D plane 1');

  const generateDefaultName = () => {
    const typeLabel = regionType === '2D' ? '2D' : '3D';
    const shapeLabel = shape;
    const selectedLabel = fieldType === 'E' ? 'E-field' : fieldType === 'H' ? 'H-field' : 'Poynting';
    return `${selectedLabel} ${typeLabel} ${shapeLabel} ${nameCounterRef.current}`;
  };

  // Reset shape when region type changes
  useEffect(() => {
    if (regionType === '2D') {
      setShape('plane');
    } else {
      setShape('sphere');
    }
  }, [regionType]);

  // Refresh default name when key attributes change
  useEffect(() => {
    setFieldName(generateDefaultName());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionType, shape, fieldType]);

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleCreate = () => {
    const fieldDefinition: any = {
      id: `field-${Date.now()}`,
      name: fieldName.trim() || generateDefaultName(),
      type: regionType,
      shape,
      centerPoint: [center.x, center.y, center.z],
      farField,
      opacity: 0.3,
      fieldType,
    };

    if (regionType === '2D') {
      fieldDefinition.normalPreset = normalPreset;
      if (shape === 'plane') {
        fieldDefinition.dimensions = { width: dimensions.width, height: dimensions.height };
      } else {
        fieldDefinition.dimensions = { radius: dimensions.radius };
      }
      fieldDefinition.sampling = { x: sampling.x, y: sampling.y };
    } else {
      if (shape === 'sphere') {
        fieldDefinition.sphereRadius = dimensions.radius;
      } else {
        fieldDefinition.cubeDimensions = {
          Lx: dimensions.width,
          Ly: dimensions.height,
          Lz: dimensions.radius,
        };
      }
      fieldDefinition.sampling = { radial: sampling.radial, angular: sampling.angular };
    }

    onCreate(fieldDefinition);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setActiveStep(0);
    setRegionType('2D');
    setShape('plane');
    setCenter({ x: 0, y: 0, z: 50 });
    setDimensions({ width: 100, height: 100, radius: 50 });
    setNormalPreset('XY');
    setSampling({ x: 20, y: 20, radial: 10, angular: 20 });
    setFieldType('E');
    setFarField(false);
    nameCounterRef.current += 1;
    setFieldName(`E-field 2D plane ${nameCounterRef.current}`);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const isNextDisabled = () => {
    return false;
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        // Step 1: Region Type
        return (
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Card variant="outlined" sx={{ bgcolor: regionType === '2D' ? 'action.selected' : 'background.paper' }}>
                <CardActionArea onClick={() => {
                  setRegionType('2D');
                  setTimeout(() => handleNext(), 100);
                }}>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <PanoramaFishEye sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h6">2D Region</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Plane or Circle
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card variant="outlined" sx={{ bgcolor: regionType === '3D' ? 'action.selected' : 'background.paper' }}>
                <CardActionArea onClick={() => {
                  setRegionType('3D');
                  setTimeout(() => handleNext(), 100);
                }}>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <ViewInAr sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h6">3D Region</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Sphere or Cube
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          </Grid>
        );

      case 1:
        // Step 2: Shape Selection
        return (
          <Box sx={{ width: '100%' }}>
            <FormControl fullWidth>
              <InputLabel id="shape-label">Shape</InputLabel>
              <Select
                labelId="shape-label"
                id="shape-select"
                name="field-shape"
                value={shape}
                label="Shape"
                onChange={(e) => setShape(e.target.value as any)}
              >
                {/* 2D options */}
                <MenuItem 
                  value="plane"
                  sx={{ display: regionType === '2D' ? 'block' : 'none' }}
                >
                  Rectangular Plane
                </MenuItem>
                <MenuItem 
                  value="circle"
                  sx={{ display: regionType === '2D' ? 'block' : 'none' }}
                >
                  Circle
                </MenuItem>
                
                {/* 3D options */}
                <MenuItem 
                  value="sphere"
                  sx={{ display: regionType === '3D' ? 'block' : 'none' }}
                >
                  Sphere
                </MenuItem>
                <MenuItem 
                  value="cube"
                  sx={{ display: regionType === '3D' ? 'block' : 'none' }}
                >
                  Cube
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 2:
        // Step 3: Parameters
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Center Point
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="X (mm)"
                type="number"
                value={center.x}
                onChange={(e) => setCenter({ ...center, x: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Y (mm)"
                type="number"
                value={center.y}
                onChange={(e) => setCenter({ ...center, y: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Z (mm)"
                type="number"
                value={center.z}
                onChange={(e) => setCenter({ ...center, z: parseFloat(e.target.value) || 0 })}
              />
            </Grid>

            {/* Dimensions */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Dimensions
              </Typography>
            </Grid>
            {shape === 'plane' && (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Width (mm)"
                    type="number"
                    value={dimensions.width}
                    onChange={(e) => setDimensions({ ...dimensions, width: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Height (mm)"
                    type="number"
                    value={dimensions.height}
                    onChange={(e) => setDimensions({ ...dimensions, height: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Normal Preset</InputLabel>
                    <Select
                      value={normalPreset}
                      label="Normal Preset"
                      onChange={(e) => setNormalPreset(e.target.value as any)}
                    >
                      <MenuItem value="XY">XY Plane</MenuItem>
                      <MenuItem value="YZ">YZ Plane</MenuItem>
                      <MenuItem value="XZ">XZ Plane</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </>
            )}
            {(shape === 'circle' || shape === 'sphere') && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Radius (mm)"
                  type="number"
                  value={dimensions.radius}
                  onChange={(e) => setDimensions({ ...dimensions, radius: parseFloat(e.target.value) || 0 })}
                />
              </Grid>
            )}
            {shape === 'cube' && (
              <>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Lx (mm)"
                    type="number"
                    value={dimensions.width}
                    onChange={(e) => setDimensions({ ...dimensions, width: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Ly (mm)"
                    type="number"
                    value={dimensions.height}
                    onChange={(e) => setDimensions({ ...dimensions, height: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Lz (mm)"
                    type="number"
                    value={dimensions.radius}
                    onChange={(e) => setDimensions({ ...dimensions, radius: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
              </>
            )}

            {/* Sampling */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Sampling Resolution
              </Typography>
            </Grid>
            {regionType === '2D' ? (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Points in X"
                    type="number"
                    value={sampling.x}
                    onChange={(e) => setSampling({ ...sampling, x: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Points in Y"
                    type="number"
                    value={sampling.y}
                    onChange={(e) => setSampling({ ...sampling, y: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
              </>
            ) : (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Radial Points"
                    type="number"
                    value={sampling.radial}
                    onChange={(e) => setSampling({ ...sampling, radial: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Angular Points"
                    type="number"
                    value={sampling.angular}
                    onChange={(e) => setSampling({ ...sampling, angular: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
              </>
            )}
          </Grid>
        );

      case 3:
        // Step 4: Field Type Selection
        return (
          <FormControl component="fieldset">
            <FormLabel component="legend">Select Field Type</FormLabel>
            <RadioGroup
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as 'E' | 'H' | 'poynting')}
            >
              <FormControlLabel
                value="E"
                control={<Radio />}
                label="E-field (Electric field)"
              />
              <FormControlLabel
                value="H"
                control={<Radio />}
                label="H-field (Magnetic field)"
              />
              <FormControlLabel
                value="poynting"
                control={<Radio />}
                label="Poynting (Power flow)"
              />
            </RadioGroup>
          </FormControl>
        );

      case 4:
        // Step 5: Near/Far Field
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Field Name"
              fullWidth
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              helperText="Shown in the tree view and properties"
              InputLabelProps={{ shrink: true }}
            />
            <FormControl component="fieldset">
              <FormLabel component="legend">Field Computation</FormLabel>
              <RadioGroup value={farField ? 'far' : 'near'} onChange={(e) => setFarField(e.target.value === 'far')}>
                <FormControlLabel value="near" control={<Radio />} label="Near field (default)" />
                <FormControlLabel value="far" control={<Radio />} label="Far field" />
              </RadioGroup>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {farField
                  ? 'Far field: Computed at large distances from the antenna'
                  : 'Near field: Computed in the region close to the antenna'}
              </Typography>
            </FormControl>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add Field Region</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <Box sx={{ minHeight: 300 }}>{renderStepContent(activeStep)}</Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Box sx={{ flex: '1 1 auto' }} />
        <Button disabled={activeStep === 0} onClick={handleBack}>
          Back
        </Button>
        {activeStep === steps.length - 1 ? (
          <Button variant="contained" onClick={handleCreate} disabled={isNextDisabled()}>
            Create
          </Button>
        ) : (
          <Button variant="contained" onClick={handleNext} disabled={isNextDisabled()}>
            Next
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
