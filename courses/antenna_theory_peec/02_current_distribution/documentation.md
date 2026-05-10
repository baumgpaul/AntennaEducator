# Module 2: Current Distribution and the Transmission Line Model

## Theory

### The Dipole as a Flared Transmission Line

A dipole antenna can be understood as an **open-ended two-wire transmission line** whose conductors are gradually spread apart until they are collinear. This spreading does not fundamentally change the boundary conditions — the current must still be zero at the open tips — but it transforms the strongly confined TEM wave into a radiating wave.

For a lossless, thin-wire dipole of half-length $h = L/2$, the standing-wave current distribution is:

$$I(z) = I_0 \sin\!\left(k\!\left(h - |z|\right)\right), \qquad k = \frac{2\pi}{\lambda}$$

This is a **sinusoidal standing wave** with:
- Zeros (current nodes) at the tips $|z| = h$
- Maxima (current antinodes) at positions where $k(h-|z|) = \pi/2$

### Effect of Electrical Length

The shape of the current distribution depends on the ratio $L/\lambda$:

| $L/\lambda$ | Distribution | Description |
|---|---|---|
| $\ll 1$ (short dipole) | $I(z) \approx I_0\!\left(1 - |z|/h\right)$ | Linear (triangular) |
| $0.5$ (half-wave) | Sinusoidal, one half-cycle | Single maximum at feed |
| $1.0$ (full-wave) | Two half-cycles, zero at feed | Two lobes, null at feed |
| $1.5$ | Three half-cycles | Null at feed |

### PEEC Discretization

In the 1D PEEC method the continuous current $I(z)$ is replaced by **constant basis functions** on each wire segment $\Delta\ell_m$:

$$I(z) \approx \sum_{m=1}^{N} I_m \,\Pi_m(z)$$

where $\Pi_m(z) = 1$ inside segment $m$ and 0 elsewhere. The PEEC solver assembles an impedance matrix $\mathbf{Z}$ and solves $\mathbf{Z}\,\mathbf{I} = \mathbf{V}$ at each frequency. The segment currents $I_m$ form the discrete approximation of $I(z)$.

With more segments the PEEC current envelope converges toward the sinusoidal analytical solution. Typically **21 segments per half-wavelength** gives $< 1\%$ error in radiation resistance.

### Physical Interpretation

The current distribution directly determines:
- **Radiation pattern**: $F(\theta) \propto \int I(z)\,e^{jkz\cos\theta}\,dz$
- **Radiation resistance**: $R_{rad} = \frac{1}{|I_0|^2}\oint |\vec{E}|^2 dA$
- **Resonance**: when the total electrical length causes the impedance to be real

---

## Worked Example

**Setup**: A gap-fed dipole with $L = 0.5\ \mathrm{m}$, wire radius $r = 1\ \mathrm{mm}$, 21 segments. Three single-frequency solves at:

- $f_1 = 150\ \mathrm{MHz}$ → $L/\lambda = 0.25$ (quarter-wave: short dipole regime)
- $f_2 = 300\ \mathrm{MHz}$ → $L/\lambda = 0.5$ (half-wave: classical distribution)
- $f_3 = 600\ \mathrm{MHz}$ → $L/\lambda = 1.0$ (full-wave: current null at feed)

**Observe in the pre-loaded results:**

In the *Current Distribution* plot (postprocessing tab):

1. At 150 MHz the magnitude envelope approximates a **half-sine** (one quarter of the full standing-wave pattern).
2. At 300 MHz the familiar **sinusoidal half-wave** distribution appears with a maximum at the feed point.
3. At 600 MHz a **full-wave** pattern appears with two lobes and a **zero at the feed** — the dipole is anti-resonant.

---

## Your Task

1. Using the Solver tab, run a **frequency sweep** from $f = 100\ \mathrm{MHz}$ to $f = 700\ \mathrm{MHz}$ (21 points).
2. After the sweep, open the *Current Distribution* postprocessing view and step through the frequency results.
3. Identify the frequency at which the **first current null** appears at the feed point ($z = 0$). Note this frequency.
4. **Relate to impedance**: check the impedance vs. frequency plot. Is this null frequency also an anti-resonance (maximum of $|Z_{in}|$)?
5. Compare the PEEC segment currents at $f_2 = 300\ \mathrm{MHz}$ with the analytical formula $I(z) = I_0\sin(k(h-|z|))$. How well does the PEEC solution match?

> **Hint**: The anti-resonance of a dipole (first current null at feed) occurs near $L = \lambda$, i.e., $f \approx c_0 / L$. For $L = 0.5\ \mathrm{m}$ this is $f \approx 600\ \mathrm{MHz}$.
