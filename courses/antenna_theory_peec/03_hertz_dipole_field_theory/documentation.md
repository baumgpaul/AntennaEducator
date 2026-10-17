# Module 3: Hertz Dipole and Field Theory

## Theory

### The Hertz Dipole

A **Hertz dipole** (or infinitesimal dipole) of length $\delta\ell \ll \lambda$ carrying a uniform current $I_0$ is the elementary building block of all wire antenna analysis. Its vector magnetic potential (in phasor form) is:

$$\vec{A}(\vec{r}) = \hat{z}\,\frac{\mu_0 I_0 \delta\ell}{4\pi}\,\frac{e^{-jkr}}{r}$$

From $\vec{A}$ we derive the complete field through $\vec{H} = \frac{1}{\mu_0}\nabla\times\vec{A}$ and Maxwell's curl equation for $\vec{E}$:

$$E_\theta = \frac{jkI_0\delta\ell}{4\pi}\,Z_0\sin\theta\left[\frac{1}{r} + \frac{1}{jkr^2} - \frac{1}{k^2r^3}\right]e^{-jkr}$$

$$H_\phi = \frac{jkI_0\delta\ell}{4\pi}\sin\theta\left[\frac{1}{r} + \frac{1}{jkr^2}\right]e^{-jkr}$$

where $Z_0 = \sqrt{\mu_0/\varepsilon_0} \approx 377\ \Omega$ is the intrinsic impedance of free space.

### Field Zones

The terms in $1/r$, $1/r^2$, $1/r^3$ correspond to three distinct regions:

| Zone | Distance | Dominant terms | Physical character |
|---|---|---|---|
| Reactive near field | $r \ll \lambda/(2\pi)$ | $1/r^3$ | Stored energy, no radiation |
| Radiating near field (Fresnel) | $\lambda/(2\pi) \ll r \ll 2D^2/\lambda$ | mixed | Pattern varies with distance |
| Far field (Fraunhofer) | $r \gg 2D^2/\lambda$ | $1/r$ only | Pattern constant, $E/H = Z_0$ |

For an electrically short antenna of length $D = \delta\ell$, the far-field criterion simplifies to $r \gg \lambda/(2\pi) \approx \lambda/6$.

### Far-Field Expression

In the far field only the $1/r$ terms survive:

$$E_\theta^{ff} = j\frac{Z_0 I_0\delta\ell}{2\lambda}\sin\theta\,\frac{e^{-jkr}}{r}, \qquad H_\phi^{ff} = \frac{E_\theta^{ff}}{Z_0}$$

Key properties:
- Amplitude decays as $1/r$ (spherical spreading)
- Phase advances as $e^{-jkr}$ (outward-traveling wave)
- $E$ and $H$ are **in phase** (real Poynting vector)
- $\vec{E} \perp \vec{H} \perp \hat{r}$ (transverse electromagnetic wave)

### Time-Averaged Poynting Vector

The radiated power density is:

$$\langle\vec{S}\rangle = \frac{1}{2}\mathrm{Re}(\vec{E}\times\vec{H}^*) = \hat{r}\,\frac{|E_\theta^{ff}|^2}{2Z_0} = \hat{r}\,\frac{Z_0(I_0\delta\ell)^2}{8\lambda^2 r^2}\sin^2\theta$$

Integrating over a sphere gives the total radiated power:

$$P_{rad} = \frac{\pi Z_0}{3}\left(\frac{I_0\delta\ell}{\lambda}\right)^2 \quad \Rightarrow \quad R_{rad} = \frac{2\pi Z_0}{3}\left(\frac{\delta\ell}{\lambda}\right)^2 \approx 789\left(\frac{\delta\ell}{\lambda}\right)^2\ \Omega$$

### Superposition: Finite Dipole

Any finite wire antenna is a superposition of Hertz dipoles. The PEEC solver computes the current on each segment and sums their contributions to compute impedance and fields — this is exactly the method of moments in 1D.

---

## Worked Example

**Setup**: A short dipole with $L = 0.05\ \mathrm{m}$ (i.e., $L/\lambda = 0.05$ at $300\ \mathrm{MHz}$, $\lambda = 1\ \mathrm{m}$), wire radius $r = 0.5\ \mathrm{mm}$, 11 segments, solved at $300\ \mathrm{MHz}$.

**Analytical reference**:
- $R_{rad} \approx 789 \times (0.05)^2 \approx 2.0\ \Omega$
- The near-field is strongly reactive at $r \sim \lambda/(2\pi) \approx 0.16\ \mathrm{m}$

**Observe in the pre-loaded results:**

1. In the *Near Field* visualization, the field magnitude in the xz-plane shows a **strong reactive region** close to the dipole (within ~$0.1\ \mathrm{m}$) and a smoother, $1/r$-decaying pattern farther out.
2. The input impedance should show $R_{in} \approx 2\ \Omega$ and a large negative reactance (capacitive, consistent with a short dipole below resonance).
3. The **far-field pattern** (3D radiation pattern) has the characteristic doughnut shape of $\sin^2\theta$.

---

## Your Task

1. Using this short-dipole project as a starting point, **increase the length** step by step: $L = 0.1,\ 0.2,\ 0.3,\ 0.5\ \mathrm{m}$ (keep frequency at $300\ \mathrm{MHz}$). Re-mesh and solve each time.
2. For each length, record $R_{rad}$ (from the port quantities) and compare with the Hertz dipole formula $R_{rad} = 789(L/\lambda)^2\ \Omega$. At what length does the formula start to overestimate significantly?
3. Run a **near-field computation** for the half-wave case ($L = 0.5\ \mathrm{m}$). In the near-field plot, estimate the distance from the dipole at which the field transitions from reactive (near-field zone) to radiating far-field behavior. Compare with the theoretical criterion $r > \lambda/(2\pi) = 0.16\ \mathrm{m}$.

> **Hint**: The Hertz dipole formula is only accurate for $L/\lambda \ll 1$. The PEEC solver does not make this approximation — it captures the full current distribution.
