# Module 6: Loop Antenna

## Theory

### The Magnetic Dipole

A small current loop is the **magnetic dual** of the Hertz electric dipole. The duality principle states that Maxwell's equations are symmetric under the exchange:

$$\vec{E} \leftrightarrow \vec{H}, \quad \vec{H} \leftrightarrow -\vec{E}, \quad \varepsilon_0 \leftrightarrow \mu_0$$

This means a small loop antenna with magnetic dipole moment $\vec{m} = I_0 A\,\hat{n}$ (where $A$ is loop area and $\hat{n}$ is the normal) radiates identically to a Hertz dipole but with $\vec{E}$ and $\vec{H}$ swapped:
- Loop axis is the **null direction** of the radiation pattern (same torus shape)
- $\vec{E}$ is in the $\hat{\phi}$ direction (azimuthal) — perpendicular to $\vec{E}$ of a co-axial dipole

### Small Loop Regime ($C \ll \lambda$)

For a circular loop of circumference $C = 2\pi a \ll \lambda$ carrying uniform current $I_0$:

$$R_{rad} = 20\pi^2\left(\frac{C}{\lambda}\right)^4 \,\Omega = 31200\left(\frac{A}{\lambda^2}\right)^2\,\Omega$$

The radiation resistance grows as the **fourth power** of the electrical size — much faster than the $L^2$ of a Hertz dipole. But for small loops $R_{rad}$ is still very small (milliohms), making ohmic losses dominant and radiation efficiency poor.

Example: a $10\ \mathrm{cm}$ circular loop at $300\ \mathrm{MHz}$ ($C/\lambda = 0.1$):
$$R_{rad} = 20\pi^2 \times (0.1)^4 \approx 0.020\ \Omega$$

This is why small AM broadcast receiving loops use many turns (boosting effective area).

### Resonant Loop ($C \approx \lambda$)

When the circumference equals one wavelength, the loop is **self-resonant**. The current distribution is no longer uniform — it has the standing-wave pattern expected for a closed resonant structure. The radiation resistance rises dramatically:

$$R_{rad}(\text{resonant loop}) \approx 100\text{–}200\ \Omega$$

The pattern also changes: it develops a squint away from the broadside direction, and the simple $\sin^2\theta$ doughnut breaks up.

### Practical Loop Shapes

The simulator supports:
- **Circular loop**: uniform circumference, most analytically tractable
- **Rectangular loop** (square): commonly used in practice (PCB antennas, balun loops)
- **Polygon**: multi-sided approximation to circular

For the small-loop regime all shapes with the same area and circumference behave similarly.

---

## Worked Example

**Setup**: A rectangular (square) loop, side length $s = 0.1\ \mathrm{m}$ (circumference $C = 0.4\ \mathrm{m}$), wire radius $r = 1\ \mathrm{mm}$, 20 segments (5 per side), at $f = 300\ \mathrm{MHz}$ ($C/\lambda = 0.4$).

This places the loop in the **transition regime** between small and resonant — large enough to have measurable $R_{rad}$ but the current is not yet fully standing-wave.

**Observe in the pre-loaded results:**

1. The **input impedance** is dominated by reactance (inductive for a small loop). $R_{rad}$ is small.
2. The **3D radiation pattern** has the classic doughnut shape with the maximum in the plane of the loop and null along the loop normal.
3. The **polarization** is horizontal (azimuthal $\hat{\phi}$) — orthogonal to that of a co-axial vertical dipole.
4. Directivity $\approx 1.76\ \mathrm{dBi}$ (same as Hertz dipole by duality).

---

## Your Task

1. Using this small-loop project, note the input impedance and radiation pattern at $300\ \mathrm{MHz}$.
2. **Scale the loop** to make the circumference equal to one wavelength: $C = \lambda = 1\ \mathrm{m}$, i.e., side $s = 0.25\ \mathrm{m}$. Re-mesh and solve at $300\ \mathrm{MHz}$.
3. Compare the resonant-loop results with the small-loop:
   - How does $R_{rad}$ change?
   - Does the pattern retain the simple doughnut shape?
   - What is the input reactance — is the loop near resonance?
4. Perform a **frequency sweep** from $100\ \mathrm{MHz}$ to $500\ \mathrm{MHz}$ for the resonant loop ($C = 1\ \mathrm{m}$). Where does the VSWR reach its minimum?

> **Hint**: A rectangular loop with $C = \lambda$ can resonate (become self-resonant) if the wire inductance is balanced by the distributed capacitance. But unlike a dipole, the resonance behavior is more complex and depends heavily on the feed gap.
