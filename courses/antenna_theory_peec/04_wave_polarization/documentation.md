# Module 4: Wave Polarization

## Theory

### Definition

**Polarization** describes the locus traced by the tip of the electric field vector $\vec{E}(t)$ at a fixed observation point as a function of time. In the most general case the locus is an **ellipse** — elliptical polarization — with linear and circular polarization as special cases.

For a plane wave propagating in the $\hat{r}$ direction, $\vec{E}$ lies in the plane perpendicular to $\hat{r}$ and can be decomposed into two orthogonal components:

$$\vec{E} = E_1\hat{e}_1 e^{j\delta_1} + E_2\hat{e}_2 e^{j\delta_2}$$

| Condition | Polarization |
|---|---|
| $E_2 = 0$ (or $E_1 = 0$) | Linear |
| $E_1 = E_2$, $\delta_2 - \delta_1 = \pm 90°$ | Circular (RHCP/LHCP) |
| All other cases | Elliptical |

### Linear Polarization of a z-Directed Dipole

A dipole oriented along $\hat{z}$ radiates **linearly polarized** waves with the electric field in the meridional plane (the plane containing $\hat{z}$ and the observation direction $\hat{r}$):

$$\vec{E}^{ff} = E_\theta(\theta, r)\,\hat{\theta}$$

This means:
- In the **equatorial plane** ($\theta = 90°$): $\hat{\theta} = -\hat{z}$, so $\vec{E}$ points along $-\hat{z}$ (vertical polarization)
- At an **oblique angle**: $\hat{\theta}$ has both $\hat{z}$ and radial components, but $\vec{E}$ always lies in the meridional plane

The $\hat{\phi}$ component of $\vec{E}$ is **zero everywhere** for a z-directed dipole by symmetry.

### Axial Ratio and Cross-Polarization

For a linearly polarized wave the **axial ratio** (AR) is infinity (major to minor axis of the polarization ellipse). For circular polarization AR = 1. In practice, cross-polarization isolation is:

$$\mathrm{XPD} = 20\log_{10}\frac{|E_{co}|}{|E_{cross}|}\ \mathrm{dB}$$

For an ideal z-directed dipole, XPD $\to \infty$ (no cross-polarization).

### Polarization Mismatch Loss

When a receiving antenna with polarization $\hat{e}_{rx}$ is illuminated by a wave with polarization $\hat{e}_{inc}$, the **polarization efficiency** is:

$$\eta_p = |\hat{e}_{rx}^* \cdot \hat{e}_{inc}|^2 \in [0, 1]$$

- Matched polarizations ($\hat{e}_{rx} = \hat{e}_{inc}$): $\eta_p = 1$ (0 dB loss)
- Orthogonal polarizations: $\eta_p = 0$ (complete rejection)
- 45° misalignment: $\eta_p = 0.5$ (3 dB loss)

### Why This Matters

Polarization mismatch is a major source of link-budget loss in practice:
- A vertical dipole transmitter illuminating a horizontal dipole receiver → **complete null**
- GPS satellites transmit RHCP → a linearly polarized receive antenna has 3 dB polarization loss

---

## Worked Example

**Setup**: A z-directed half-wave dipole, $L = 0.5\ \mathrm{m}$, at $f = 300\ \mathrm{MHz}$ ($L = \lambda/2$), wire radius $r = 1\ \mathrm{mm}$, 21 segments.

Near-field computations are run in two orthogonal planes:
- **Meridional cut** (xz-plane, $\phi = 0°$): shows the E-field pointing in $\hat{\theta}$ (in-plane with $\hat{z}$)
- **Equatorial cut** (xy-plane, $\theta = 90°$): shows the E-field pointing along $-\hat{z}$ everywhere in the plane

**Observe in the pre-loaded results:**

1. In the meridional (xz) cut, the $|E_\theta|$ component dominates; $|E_\phi| \approx 0$ everywhere.
2. In the equatorial (xy) cut, the field magnitude is uniform in all $\hat{\phi}$ directions (omnidirectional in the horizontal plane), and $\vec{E}$ is vertically polarized ($-\hat{z}$).
3. The near-field magnitude in the equatorial plane has a **null along the dipole axis** ($z$-axis) and maximum in the equatorial plane — the classic donut pattern.

---

## Your Task

1. Using this project, open the **Near Field** postprocessing view and select the xz-plane.
   - Verify that only $E_\theta$ has significant magnitude and $E_\phi \approx 0$.
2. Switch to the xy-plane (equatorial) near-field cut.
   - Confirm that $|E_\theta|$ is approximately uniform in $\phi$ (omnidirectional pattern in elevation).
3. **Think**: If you wanted to create a **circularly polarized** antenna using two dipoles, how would you orient and phase-shift them? What would the VSWR look like if you combined two perpendicular dipoles fed 90° out of phase?

> **Note**: The simulator does not yet natively compute the polarization ellipse. You can infer polarization by examining which $E$ components ($E_\theta$, $E_\phi$) dominate in each observation plane.
