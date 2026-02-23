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
import { ViewInAr, PanoramaFishEye, Timeline } from '@mui/icons-material';
import { getEllipseAxesFromPreset } from '@/types/fieldDefinitions';

const steps = ['Region Type', 'Shape', 'Parameters', 'Field Type'];

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
 * 2. Select shape (plane/ellipse for 2D, sphere/cuboid for 3D)
 * 3. Define parameters (center point, dimensions, sampling)
 * 4. Select field type (E, H, or Poynting)
 */
export function AddFieldDialog({ open, onClose, onCreate }: AddFieldDialogProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [regionType, setRegionType] = useState<'1D' | '2D' | '3D'>('2D');
  const [shape, setShape] = useState<'line' | 'arc' | 'plane' | 'ellipse' | 'sphere' | 'cuboid'>('plane');
  const [center, setCenter] = useState({ x: 0, y: 0, z: 0 });
  // Line start/end points
  const [lineStart, setLineStart] = useState({ x: 0, y: 0, z: 0 });
  const [lineEnd, setLineEnd] = useState({ x: 100, y: 0, z: 0 });
  // Arc angles
  const [arcAngles, setArcAngles] = useState({ start: 0, end: 360 });
  // 1D numPoints
  const [numPoints, setNumPoints] = useState(20);
  // Plane dimensions
  const [planeDims, setPlaneDims] = useState({ width: 100, height: 100 });
  // Ellipse radii
  const [radiusA, setRadiusA] = useState(50);
  const [radiusB, setRadiusB] = useState(50);
  // Custom axis vectors (for ellipse)
  const [customAxis1, setCustomAxis1] = useState({ x: 1, y: 0, z: 0 });
  const [customAxis2, setCustomAxis2] = useState({ x: 0, y: 1, z: 0 });
  // Normal preset / orientation
  const [normalPreset, setNormalPreset] = useState<'XY' | 'YZ' | 'XZ' | 'Custom'>('XY');
  const [customNormal, setCustomNormal] = useState({ x: 0, y: 0, z: 1 });
  // Sphere radius
  const [sphereRadius, setSphereRadius] = useState(50);
  // Cuboid dimensions
  const [cuboidDims, setCuboidDims] = useState({ Lx: 100, Ly: 100, Lz: 100 });
  // 2D sampling
  const [sampling2D, setSampling2D] = useState({ x: 20, y: 20 });
  // Sphere sampling
  const [sphereSampling, setSphereSampling] = useState({ theta: 18, phi: 36, radial: 10 });
  // Cuboid sampling
  const [cuboidSampling, setCuboidSampling] = useState({ Nx: 10, Ny: 10, Nz: 10 });

  const [fieldType, setFieldType] = useState<'E' | 'H' | 'poynting'>('E');
  const nameCounterRef = useRef(1);
  const [fieldName, setFieldName] = useState('E-field 2D plane 1');

  const generateDefaultName = () => {
    const typeLabel = regionType;
    const shapeLabel = shape;
    const selectedLabel = fieldType === 'E' ? 'E-field' : fieldType === 'H' ? 'H-field' : 'Poynting';
    return `${selectedLabel} ${typeLabel} ${shapeLabel} ${nameCounterRef.current}`;
  };

  // Reset shape when region type changes
  useEffect(() => {
    if (regionType === '1D') {
      setShape('line');
    } else if (regionType === '2D') {
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

  // Sync ellipse axes when preset changes
  useEffect(() => {
    if (normalPreset !== 'Custom') {
      const axes = getEllipseAxesFromPreset(normalPreset);
      setCustomAxis1({ x: axes.axis1[0], y: axes.axis1[1], z: axes.axis1[2] });
      setCustomAxis2({ x: axes.axis2[0], y: axes.axis2[1], z: axes.axis2[2] });
    }
  }, [normalPreset]);

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
      opacity: 0.3,
      fieldType,
    };

    if (regionType === '1D') {
      fieldDefinition.numPoints = numPoints;
      if (shape === 'line') {
        fieldDefinition.startPoint = [lineStart.x, lineStart.y, lineStart.z];
        fieldDefinition.endPoint = [lineEnd.x, lineEnd.y, lineEnd.z];
      } else if (shape === 'arc') {
        fieldDefinition.centerPoint = [center.x, center.y, center.z];
        fieldDefinition.normalPreset = normalPreset;
        fieldDefinition.axis1 = [customAxis1.x, customAxis1.y, customAxis1.z];
        fieldDefinition.axis2 = [customAxis2.x, customAxis2.y, customAxis2.z];
        fieldDefinition.radiusA = radiusA;
        fieldDefinition.radiusB = radiusB;
        fieldDefinition.startAngle = arcAngles.start;
        fieldDefinition.endAngle = arcAngles.end;
      }
    } else if (regionType === '2D') {
      fieldDefinition.centerPoint = [center.x, center.y, center.z];
      fieldDefinition.normalPreset = normalPreset;
      if (normalPreset === 'Custom') {
        fieldDefinition.normalVector = [customNormal.x, customNormal.y, customNormal.z];
      }
      if (shape === 'plane') {
        fieldDefinition.dimensions = { width: planeDims.width, height: planeDims.height };
        fieldDefinition.sampling = { x: sampling2D.x, y: sampling2D.y };
      } else {
        // Ellipse
        fieldDefinition.radiusA = radiusA;
        fieldDefinition.radiusB = radiusB;
        fieldDefinition.axis1 = [customAxis1.x, customAxis1.y, customAxis1.z];
        fieldDefinition.axis2 = [customAxis2.x, customAxis2.y, customAxis2.z];
        // For ellipse, x = angular, y = radial
        fieldDefinition.sampling = { x: sampling2D.x, y: sampling2D.y };
      }
    } else {
      fieldDefinition.centerPoint = [center.x, center.y, center.z];
      if (shape === 'sphere') {
        fieldDefinition.sphereRadius = sphereRadius;
        fieldDefinition.sampling = {
          theta: sphereSampling.theta,
          phi: sphereSampling.phi,
          radial: sphereSampling.radial,
        };
      } else {
        // Cuboid
        fieldDefinition.cuboidDimensions = {
          Lx: cuboidDims.Lx,
          Ly: cuboidDims.Ly,
          Lz: cuboidDims.Lz,
        };
        fieldDefinition.sampling = {
          Nx: cuboidSampling.Nx,
          Ny: cuboidSampling.Ny,
          Nz: cuboidSampling.Nz,
        };
      }
    }

    onCreate(fieldDefinition);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setActiveStep(0);
    setRegionType('2D');
    setShape('plane');
    setCenter({ x: 0, y: 0, z: 0 });
    // 1D states
    setLineStart({ x: 0, y: 0, z: 0 });
    setLineEnd({ x: 100, y: 0, z: 0 });
    setArcAngles({ start: 0, end: 360 });
    setNumPoints(20);
    // 2D states
    setPlaneDims({ width: 100, height: 100 });
    setRadiusA(50);
    setRadiusB(50);
    setNormalPreset('XY');
    setCustomNormal({ x: 0, y: 0, z: 1 });
    setCustomAxis1({ x: 1, y: 0, z: 0 });
    setCustomAxis2({ x: 0, y: 1, z: 0 });
    // 3D states
    setSphereRadius(50);
    setCuboidDims({ Lx: 100, Ly: 100, Lz: 100 });
    setSampling2D({ x: 20, y: 20 });
    setSphereSampling({ theta: 18, phi: 36, radial: 10 });
    setCuboidSampling({ Nx: 10, Ny: 10, Nz: 10 });
    setFieldType('E');
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
            <Grid item xs={4}>
              <Card variant="outlined" sx={{ bgcolor: regionType === '1D' ? 'action.selected' : 'background.paper' }}>
                <CardActionArea onClick={() => {
                  setRegionType('1D');
                  setTimeout(() => handleNext(), 100);
                }}>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Timeline sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h6">1D Region</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Line or Arc
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid item xs={4}>
              <Card variant="outlined" sx={{ bgcolor: regionType === '2D' ? 'action.selected' : 'background.paper' }}>
                <CardActionArea onClick={() => {
                  setRegionType('2D');
                  setTimeout(() => handleNext(), 100);
                }}>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <PanoramaFishEye sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h6">2D Region</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Plane or Ellipse
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid item xs={4}>
              <Card variant="outlined" sx={{ bgcolor: regionType === '3D' ? 'action.selected' : 'background.paper' }}>
                <CardActionArea onClick={() => {
                  setRegionType('3D');
                  setTimeout(() => handleNext(), 100);
                }}>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <ViewInAr sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h6">3D Region</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Sphere or Cuboid
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
                {/* 1D options */}
                <MenuItem
                  value="line"
                  sx={{ display: regionType === '1D' ? 'block' : 'none' }}
                >
                  Straight Line
                </MenuItem>
                <MenuItem
                  value="arc"
                  sx={{ display: regionType === '1D' ? 'block' : 'none' }}
                >
                  Elliptical Arc
                </MenuItem>

                {/* 2D options */}
                <MenuItem
                  value="plane"
                  sx={{ display: regionType === '2D' ? 'block' : 'none' }}
                >
                  Rectangular Plane
                </MenuItem>
                <MenuItem
                  value="ellipse"
                  sx={{ display: regionType === '2D' ? 'block' : 'none' }}
                >
                  Ellipse / Circle
                </MenuItem>

                {/* 3D options */}
                <MenuItem
                  value="sphere"
                  sx={{ display: regionType === '3D' ? 'block' : 'none' }}
                >
                  Sphere
                </MenuItem>
                <MenuItem
                  value="cuboid"
                  sx={{ display: regionType === '3D' ? 'block' : 'none' }}
                >
                  Cuboid
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 2:
        // Step 3: Parameters
        return (
          <Grid container spacing={2}>
            {/* ── Line: Start and End Points ── */}
            {shape === 'line' && (
              <>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    Start Point (mm)
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="X" type="number" value={lineStart.x}
                    onChange={(e) => setLineStart({ ...lineStart, x: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="Y" type="number" value={lineStart.y}
                    onChange={(e) => setLineStart({ ...lineStart, y: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="Z" type="number" value={lineStart.z}
                    onChange={(e) => setLineStart({ ...lineStart, z: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
                    End Point (mm)
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="X" type="number" value={lineEnd.x}
                    onChange={(e) => setLineEnd({ ...lineEnd, x: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="Y" type="number" value={lineEnd.y}
                    onChange={(e) => setLineEnd({ ...lineEnd, y: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="Z" type="number" value={lineEnd.z}
                    onChange={(e) => setLineEnd({ ...lineEnd, z: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Sampling
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth label="Number of Points" type="number" value={numPoints}
                    onChange={(e) => setNumPoints(parseInt(e.target.value) || 2)}
                    helperText="Uniformly distributed along the line" inputProps={{ min: 2 }} />
                </Grid>
              </>
            )}

            {/* ── Arc: Center, Axes, Radii, Angles ── */}
            {shape === 'arc' && (
              <>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    Center Point (mm)
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="X" type="number" value={center.x}
                    onChange={(e) => setCenter({ ...center, x: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="Y" type="number" value={center.y}
                    onChange={(e) => setCenter({ ...center, y: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={4}>
                  <TextField fullWidth label="Z" type="number" value={center.z}
                    onChange={(e) => setCenter({ ...center, z: parseFloat(e.target.value) || 0 })} />
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Ellipse Radii (mm)
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="Radius A" type="number" value={radiusA}
                    onChange={(e) => setRadiusA(parseFloat(e.target.value) || 1)}
                    helperText="Along Axis 1" />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="Radius B" type="number" value={radiusB}
                    onChange={(e) => setRadiusB(parseFloat(e.target.value) || 1)}
                    helperText="Along Axis 2" />
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth sx={{ mt: 1 }}>
                    <InputLabel>Orientation</InputLabel>
                    <Select value={normalPreset} label="Orientation"
                      onChange={(e) => setNormalPreset(e.target.value as any)}>
                      <MenuItem value="XY">XY Plane</MenuItem>
                      <MenuItem value="YZ">YZ Plane</MenuItem>
                      <MenuItem value="XZ">XZ Plane</MenuItem>
                      <MenuItem value="Custom">Custom</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                {normalPreset === 'Custom' && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Axis 1 (0° direction):
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="X" type="number" value={customAxis1.x}
                        onChange={(e) => setCustomAxis1({ ...customAxis1, x: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="Y" type="number" value={customAxis1.y}
                        onChange={(e) => setCustomAxis1({ ...customAxis1, y: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="Z" type="number" value={customAxis1.z}
                        onChange={(e) => setCustomAxis1({ ...customAxis1, z: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Axis 2 (90° direction):
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="X" type="number" value={customAxis2.x}
                        onChange={(e) => setCustomAxis2({ ...customAxis2, x: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="Y" type="number" value={customAxis2.y}
                        onChange={(e) => setCustomAxis2({ ...customAxis2, y: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="Z" type="number" value={customAxis2.z}
                        onChange={(e) => setCustomAxis2({ ...customAxis2, z: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                  </>
                )}

                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Arc Angles (degrees)
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="Start Angle" type="number" value={arcAngles.start}
                    onChange={(e) => setArcAngles({ ...arcAngles, start: parseFloat(e.target.value) || 0 })}
                    helperText="0° = along Axis 1" />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="End Angle" type="number" value={arcAngles.end}
                    onChange={(e) => setArcAngles({ ...arcAngles, end: parseFloat(e.target.value) || 360 })}
                    helperText="360° = full ellipse" />
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Sampling
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth label="Number of Points" type="number" value={numPoints}
                    onChange={(e) => setNumPoints(parseInt(e.target.value) || 2)}
                    helperText="Uniformly distributed along the arc" inputProps={{ min: 2 }} />
                </Grid>
              </>
            )}

            {/* Center Point (2D and 3D shapes) */}
            {(shape === 'plane' || shape === 'ellipse' || shape === 'sphere' || shape === 'cuboid') && (
              <>
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

                {/* Shape-specific parameters */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Dimensions
                  </Typography>
                </Grid>
              </>
            )}

            {/* ── Plane ── */}
            {shape === 'plane' && (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Width (mm)"
                    type="number"
                    value={planeDims.width}
                    onChange={(e) => setPlaneDims({ ...planeDims, width: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Height (mm)"
                    type="number"
                    value={planeDims.height}
                    onChange={(e) => setPlaneDims({ ...planeDims, height: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Orientation</InputLabel>
                    <Select
                      value={normalPreset}
                      label="Orientation"
                      onChange={(e) => setNormalPreset(e.target.value as any)}
                    >
                      <MenuItem value="XY">XY Plane</MenuItem>
                      <MenuItem value="YZ">YZ Plane</MenuItem>
                      <MenuItem value="XZ">XZ Plane</MenuItem>
                      <MenuItem value="Custom">Custom</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                {normalPreset === 'Custom' && (
                  <>
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Normal X"
                        type="number"
                        value={customNormal.x}
                        onChange={(e) => setCustomNormal({ ...customNormal, x: parseFloat(e.target.value) || 0 })}
                        inputProps={{ step: 0.1 }}
                      />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Normal Y"
                        type="number"
                        value={customNormal.y}
                        onChange={(e) => setCustomNormal({ ...customNormal, y: parseFloat(e.target.value) || 0 })}
                        inputProps={{ step: 0.1 }}
                      />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Normal Z"
                        type="number"
                        value={customNormal.z}
                        onChange={(e) => setCustomNormal({ ...customNormal, z: parseFloat(e.target.value) || 0 })}
                        inputProps={{ step: 0.1 }}
                      />
                    </Grid>
                  </>
                )}
              </>
            )}

            {/* ── Ellipse / Circle ── */}
            {shape === 'ellipse' && (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Radius A (mm)"
                    type="number"
                    value={radiusA}
                    onChange={(e) => setRadiusA(parseFloat(e.target.value) || 0)}
                    helperText="Semi-axis along Axis 1"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Radius B (mm)"
                    type="number"
                    value={radiusB}
                    onChange={(e) => setRadiusB(parseFloat(e.target.value) || 0)}
                    helperText="Semi-axis along Axis 2"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Orientation</InputLabel>
                    <Select
                      value={normalPreset}
                      label="Orientation"
                      onChange={(e) => setNormalPreset(e.target.value as any)}
                    >
                      <MenuItem value="XY">XY Plane</MenuItem>
                      <MenuItem value="YZ">YZ Plane</MenuItem>
                      <MenuItem value="XZ">XZ Plane</MenuItem>
                      <MenuItem value="Custom">Custom</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                {normalPreset === 'Custom' && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Axis 1 direction (semi-major):
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="A1 X" type="number" value={customAxis1.x}
                        onChange={(e) => setCustomAxis1({ ...customAxis1, x: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="A1 Y" type="number" value={customAxis1.y}
                        onChange={(e) => setCustomAxis1({ ...customAxis1, y: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="A1 Z" type="number" value={customAxis1.z}
                        onChange={(e) => setCustomAxis1({ ...customAxis1, z: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Axis 2 direction (semi-minor):
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="A2 X" type="number" value={customAxis2.x}
                        onChange={(e) => setCustomAxis2({ ...customAxis2, x: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="A2 Y" type="number" value={customAxis2.y}
                        onChange={(e) => setCustomAxis2({ ...customAxis2, y: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField fullWidth label="A2 Z" type="number" value={customAxis2.z}
                        onChange={(e) => setCustomAxis2({ ...customAxis2, z: parseFloat(e.target.value) || 0 })} inputProps={{ step: 0.1 }} />
                    </Grid>
                  </>
                )}
              </>
            )}

            {/* ── Sphere ── */}
            {shape === 'sphere' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Radius (mm)"
                  type="number"
                  value={sphereRadius}
                  onChange={(e) => setSphereRadius(parseFloat(e.target.value) || 0)}
                />
              </Grid>
            )}

            {/* ── Cuboid ── */}
            {shape === 'cuboid' && (
              <>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Lx (mm)"
                    type="number"
                    value={cuboidDims.Lx}
                    onChange={(e) => setCuboidDims({ ...cuboidDims, Lx: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Ly (mm)"
                    type="number"
                    value={cuboidDims.Ly}
                    onChange={(e) => setCuboidDims({ ...cuboidDims, Ly: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Lz (mm)"
                    type="number"
                    value={cuboidDims.Lz}
                    onChange={(e) => setCuboidDims({ ...cuboidDims, Lz: parseFloat(e.target.value) || 0 })}
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

            {/* 2D sampling: plane uses x/y; ellipse uses angle/radius */}
            {shape === 'plane' && (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Points in X"
                    type="number"
                    value={sampling2D.x}
                    onChange={(e) => setSampling2D({ ...sampling2D, x: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Points in Y"
                    type="number"
                    value={sampling2D.y}
                    onChange={(e) => setSampling2D({ ...sampling2D, y: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
              </>
            )}
            {shape === 'ellipse' && (
              <>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Angular Points"
                    type="number"
                    value={sampling2D.x}
                    onChange={(e) => setSampling2D({ ...sampling2D, x: parseInt(e.target.value) || 0 })}
                    helperText="Points around circumference"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Radial Points"
                    type="number"
                    value={sampling2D.y}
                    onChange={(e) => setSampling2D({ ...sampling2D, y: parseInt(e.target.value) || 0 })}
                    helperText="Points along radius"
                  />
                </Grid>
              </>
            )}

            {/* Sphere sampling: theta, phi, radial */}
            {shape === 'sphere' && (
              <>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Theta Points"
                    type="number"
                    value={sphereSampling.theta}
                    onChange={(e) => setSphereSampling({ ...sphereSampling, theta: parseInt(e.target.value) || 0 })}
                    helperText="Elevation (0° → 180°)"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Phi Points"
                    type="number"
                    value={sphereSampling.phi}
                    onChange={(e) => setSphereSampling({ ...sphereSampling, phi: parseInt(e.target.value) || 0 })}
                    helperText="Azimuth (0° → 360°)"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Radial Points"
                    type="number"
                    value={sphereSampling.radial}
                    onChange={(e) => setSphereSampling({ ...sphereSampling, radial: parseInt(e.target.value) || 0 })}
                    helperText="Center → surface"
                  />
                </Grid>
              </>
            )}

            {/* Cuboid sampling: Nx, Ny, Nz */}
            {shape === 'cuboid' && (
              <>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Nx"
                    type="number"
                    value={cuboidSampling.Nx}
                    onChange={(e) => setCuboidSampling({ ...cuboidSampling, Nx: parseInt(e.target.value) || 0 })}
                    helperText="Points along X"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Ny"
                    type="number"
                    value={cuboidSampling.Ny}
                    onChange={(e) => setCuboidSampling({ ...cuboidSampling, Ny: parseInt(e.target.value) || 0 })}
                    helperText="Points along Y"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Nz"
                    type="number"
                    value={cuboidSampling.Nz}
                    onChange={(e) => setCuboidSampling({ ...cuboidSampling, Nz: parseInt(e.target.value) || 0 })}
                    helperText="Points along Z"
                  />
                </Grid>
              </>
            )}
          </Grid>
        );

      case 3:
        // Step 4: Field Type Selection + Name
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
