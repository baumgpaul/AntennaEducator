# Module 5: Radiation Pattern and Directivity

## Theory

### Radiation Intensity

The **radiation intensity** $U(\theta, \phi)$ (W/sr) is the power radiated per unit solid angle in the direction $(\theta, \phi)$:

$$U(\theta, \phi) = r^2 \langle S_r\rangle = \frac{r^2|E_\theta|^2}{2Z_0}$$

The **total radiated power** is obtained by integrating over all directions:

$$P_{rad} = \int_0^{2\pi}\int_0^\pi U(\theta,\phi)\sin\theta\,d\theta\,d\phi$$

### Directivity

**Directivity** $D(\theta, \phi)$ compares the radiation intensity in a given direction to the isotropic average:

$$D(\theta, \phi) = \frac{4\pi U(\theta, \phi)}{P_{rad}} = \frac{U(\theta, \phi)}{P_{rad}/(4\pi)}$$

The **maximum directivity** $D_0 = D_{\max}$ (often just called "the directivity") is:

$$D_0 = \frac{4\pi U_{\max}}{P_{rad}}$$

For reference antennas:

| Antenna | $D_0$ | $D_0$ (dBi) |
|---|---|---|
| Isotropic | 1.000 | 0.00 |
| Hertz dipole ($L \ll \lambda$) | 1.500 | 1.76 |
| Half-wave dipole ($L = \lambda/2$) | 1.642 | 2.15 |

### Half-Wave Dipole Pattern

The far-field radiation pattern of a half-wave dipole is:

$$F(\theta) = \left[\frac{\cos\!\left(\dfrac{\pi}{2}\cos\theta\right)}{\sin\theta}\right]^2$$

This function peaks at $\theta = 90°$ (equatorial plane) and has **nulls at $\theta = 0°$ and $180°$** (along the dipole axis).

The **half-power beamwidth** (HPBW) of the half-wave dipole is approximately $78°$ in the E-plane.

### Pattern vs. Electrical Length

As the dipole is made longer than $\lambda/2$, the pattern changes:

| $L/\lambda$ | HPBW | $D_0$ (dBi) | Notes |
|---|---|---|---|
| 0.25 | $\approx 120°$ | 1.76 | Short dipole pattern |
| 0.50 | $\approx 78°$ | 2.15 | Classical half-wave |
| 1.00 | $\approx 47°$ | 2.41 | Main lobe sharpens |
| 1.25 | Split | — | First side lobes appear |
| 1.50 | Multi-lobe | — | Broadside null develops |

### Gain vs. Directivity

**Gain** $G = \eta_{rad} \cdot D$, where $\eta_{rad} = R_{rad}/(R_{rad}+R_{loss})$ is the radiation efficiency. For a lossless dipole (copper wire, short length), $G \approx D$. For thin wires at high frequency, skin-effect losses reduce efficiency.

---

## Worked Example

**Setup**: A half-wave dipole ($L = 0.5\ \mathrm{m}$, $f = 300\ \mathrm{MHz}$), wire radius $r = 1\ \mathrm{mm}$, 21 segments. Far-field radiation pattern computed (512 × 256 angular samples).

**Observe in the pre-loaded results:**

1. The **3D radiation pattern** shows the characteristic torus (donut) shape with maximum in the equatorial plane and nulls along the dipole axis.
2. The **directivity** shown in the results panel should be $D_0 \approx 2.15\ \mathrm{dBi}$.
3. The **E-plane pattern** (slice at $\phi = 0°$) closely matches the analytical formula $F(\theta) = [\cos(\pi\cos\theta/2)/\sin\theta]^2$.
4. The **HPBW** (angle between half-power points) should be approximately $78°$.

---

## Your Task

1. Open this project and run a **parameter study** sweeping frequency from $f = 200\ \mathrm{MHz}$ to $f = 900\ \mathrm{MHz}$ (8 points) with the dipole length held constant at $L = 0.5\ \mathrm{m}$.

2. For each frequency, compute the far-field radiation pattern (enable *Directivity* in the postprocessing settings).

3. From the parameter study results, fill in the table:

   | $f$ (MHz) | $L/\lambda$ | $D_0$ (dBi) | Pattern shape |
   |---|---|---|---|
   | 200 | 0.33 | ? | ? |
   | 300 | 0.50 | ? | ? |
   | 600 | 1.00 | ? | ? |
   | 750 | 1.25 | ? | ? |
   | 900 | 1.50 | ? | ? |

4. At what frequency does the main lobe first start to split into multiple lobes?

5. Compare the directivity at $L = \lambda$ with the value for $L = \lambda/2$. Is the directivity monotonically increasing with length?

> **Note**: Computing radiation patterns at each parameter study point takes approximately 2–5 seconds per frequency in the simulator. For a sweep of 8 points, expect ~20–40 seconds of compute time.
