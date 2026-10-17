# Module 1: Fundamental Antenna Parameters

## Theory

An antenna is a transducer between a guided electromagnetic wave (the transmission line or circuit) and a free-space wave. At its terminals the antenna behaves as a complex impedance:

$$Z_{in} = R_{rad} + R_{loss} + jX_{in}$$

where

- $R_{rad}$ — **radiation resistance**: the equivalent resistance that dissipates the same power as the antenna radiates into free space
- $R_{loss}$ — **ohmic loss resistance**: power converted to heat
- $X_{in}$ — **input reactance**: reactive energy stored in the near field

### Resonance

At resonance $X_{in} = 0$, so $Z_{in}$ is purely real. For a half-wave dipole ($L = \lambda/2$) this occurs close to $Z_{in} \approx 73 + j42.5\ \Omega$ (slightly above $\lambda/2$ due to the finite gap; exact value depends on wire radius and gap size).

### Power Matching and Reflection

When an antenna is connected to a transmission line or source with characteristic impedance $Z_0$ (typically $50\ \Omega$), the **voltage reflection coefficient** at the terminal is:

$$\Gamma = \frac{Z_{in} - Z_0}{Z_{in} + Z_0}, \qquad |\Gamma| \in [0,1]$$

Derived quantities:

| Quantity | Formula |
|---|---|
| Return Loss | $\mathrm{RL} = -20\log_{10}|\Gamma|\ \mathrm{dB}$ |
| VSWR | $\mathrm{VSWR} = \dfrac{1+|\Gamma|}{1-|\Gamma|}$ |
| Mismatch Loss | $\mathrm{ML} = 1 - |\Gamma|^2$ |

Maximum power transfer occurs when $Z_{in} = Z_0^*$ (conjugate match). For a purely real $Z_0 = 50\ \Omega$ this means $Z_{in} = 50 + j0\ \Omega$.

### Bandwidth

Antenna bandwidth is often defined as the frequency range over which $\mathrm{VSWR} \leq 2$ (equivalently $|\Gamma| \leq 1/3$, or $\mathrm{RL} \geq 9.5\ \mathrm{dB}$). Thinner wires (larger $L/d$ ratio) produce sharper resonances and narrower bandwidths.

### Half-Wave Dipole Reference Values

| Parameter | Value |
|---|---|
| $R_{rad}$ | $\approx 73\ \Omega$ |
| $X_{in}$ at resonance | $\approx 0\ \Omega$ (slightly below $\lambda/2$) |
| VSWR at 50 Ω | $\approx 1.46$ (tuned) |
| Radiation efficiency (lossless) | $100\%$ |

---

## Worked Example

**Setup**: A center-fed dipole with total length $L = 0.47\ \mathrm{m}$ and wire radius $r = 1\ \mathrm{mm}$ is swept from $f = 200\ \mathrm{MHz}$ to $f = 400\ \mathrm{MHz}$. The reference impedance is $Z_0 = 50\ \Omega$.

**Expected observations from the pre-loaded simulation results:**

1. The **impedance curve** shows $R_{in}$ rising from low values toward ~73 Ω as frequency increases toward the resonance near 300 MHz.
2. The **reactance** $X_{in}$ crosses zero near $f \approx 305\ \mathrm{MHz}$, marking the resonant frequency.
3. The **VSWR** curve dips to a minimum near the resonant frequency. Because $Z_{in}(\mathrm{resonance}) \approx 73\ \Omega \neq 50\ \Omega$, the VSWR minimum is approximately $73/50 \approx 1.46$, not 1.0.
4. The **return loss** curve shows a peak (best match) aligned with the VSWR minimum.

Open the *Impedance* and *VSWR* tabs in the results panel to verify these observations.

---

## Your Task

Using this pre-configured dipole project as a starting point:

1. **Run the frequency sweep** (if not already showing results) by clicking *Solve → Frequency Sweep* in the Solver tab.
2. In the Solver tab, **change the dipole length** to $L = 0.5\ \mathrm{m}$ and re-mesh.
3. Observe how the resonant frequency and the VSWR minimum shift.
4. Use a **parameter study** to sweep dipole length from $L = 0.40\ \mathrm{m}$ to $L = 0.55\ \mathrm{m}$ (at a fixed frequency of $300\ \mathrm{MHz}$) and find the length that achieves $|\Gamma| < 0.05$ (i.e., better than $26\ \mathrm{dB}$ return loss) into $50\ \Omega$.

> **Hint**: At resonance $X_{in} = 0$, so the optimal length is the one where $Z_{in}$ is closest to $50\ \Omega$. Since $R_{rad} \approx 73\ \Omega$ at resonance, a perfect $50\ \Omega$ match requires a conjugate matching network or a different feed impedance.
