# Module 8: Monopole over a Ground Plane

## Theory

### Image Theory

A perfectly conducting (PEC) plane forces the tangential electric field to zero on its surface. Above the plane, exactly the same field is produced if the plane is removed and replaced by the **mirror image** of every current:

- a current **perpendicular** to the plane has an image flowing in the **same** direction (vertical wires);
- a current **parallel** to the plane has an image flowing in the **opposite** direction (horizontal wires).

Below the plane there is no field at all — it is inside the conductor.

So a vertical rod of height $h$ standing on the plane, fed at its base, behaves above the plane exactly like a **dipole of length $2h$** fed at its centre. The quarter-wave monopole ($h = \lambda/4$) is "half of a half-wave dipole".

### Impedance: Half of the Dipole

The monopole and its image carry the same current, but the feed voltage only spans the real half (from the plane to the rod), while the equivalent dipole sees the full voltage across its gap. With the same current and half the voltage:

$$Z_{mono} = \tfrac{1}{2}\,Z_{dipole}(2h), \qquad R_{rad,\lambda/4} \approx \tfrac{73}{2} \approx 36.5\ \Omega$$

### Directivity: +3 dB

The monopole radiates the dipole's pattern, but only into the **upper half-space**. The same power concentrated into half the solid angle doubles the radiation intensity:

$$D_{mono} = 2\,D_{dipole} \quad\Rightarrow\quad D_{\lambda/4} \approx 1.64 \times 2 = 3.28 \approx 5.15\ \mathrm{dBi}$$

The maximum lies along the horizon ($\theta = 90°$), and the pattern is omnidirectional in azimuth — this is why monopoles are used for broadcast, car and mobile antennas.

### Practical Ground Planes

A real ground plane is finite (a car roof, a PCB copper pour, radial wires). The ideal-PEC model is accurate for planes several wavelengths across; smaller planes tilt the main lobe upward and add radiation below the horizon. The simulator models an **infinite** PEC plane at $z = 0$.

---

## Worked Example

**Setup**: A rod from $(0, 0, 0)$ to $(0, 0, 0.25)\ \mathrm{m}$ ($h = \lambda/4$ at $300\ \mathrm{MHz}$), wire radius $1\ \mathrm{mm}$, 10 segments, **ground plane enabled** (Designer ribbon → *Ground plane*), fed by a voltage source between node 0 (the plane) and node 1 (the base). Swept from $200$ to $400\ \mathrm{MHz}$.

**Observe in the pre-loaded results:**

1. **Resonance** ($X_{in} = 0$) at about $290\ \mathrm{MHz}$ with $R_{in} \approx 37\ \Omega$ — half of the $\approx 73\ \Omega$ of a resonant dipole. As for the dipole, resonance occurs slightly below the frequency where $h = \lambda/4$ exactly, because of the end effect of the finite wire radius.
2. At $300\ \mathrm{MHz}$: $Z_{in} \approx 42 + j17\ \Omega$ — Task 1 checks it against the equivalent $0.5\ \mathrm{m}$ dipole.
3. The **3D radiation pattern** is the upper half of the dipole's doughnut; nothing radiates below the plane.
4. Directivity $\approx 4.6\ \mathrm{dBi}$ on the default $19 \times 37$ angular grid. The maximum lies exactly on the horizon, between grid points of a coarse grid — refine it (see task 3) and the value approaches the theoretical $5.15\ \mathrm{dBi}$.

---

## Your Task

1. **Monopole vs. dipole**: Disable the ground plane and replace the rod with a dipole of length $0.5\ \mathrm{m}$ centred at the origin, with a feed gap of $4\ \mathrm{mm}$ — the monopole's $2\ \mathrm{mm}$ gap at the plane plus its mirror image. Solve at $300\ \mathrm{MHz}$ and compare with the monopole:
   - Is $Z_{dipole} \approx 2\,Z_{mono}$?
   - Repeat with the default $10\ \mathrm{mm}$ gap. Why does the feed gap change the reactance?
   - Is the directivity about $3\ \mathrm{dB}$ lower?
   - Why must the ground plane be off for the centred dipole? (Try enabling it and read the message.)

2. **Resonant length**: Change the monopole height so that it resonates exactly at $300\ \mathrm{MHz}$. How much shorter than $\lambda/4$ is it? Compare the relative shortening with the dipole of Module 1.

3. **Pattern sampling**: Increase the angular resolution of the directivity computation (e.g. $37 \times 73$ and $91 \times 181$ points). How does the computed directivity converge towards $5.15\ \mathrm{dBi}$? Why does a pattern whose maximum lies on the horizon need a fine $\theta$ grid?

4. **Short monopole**: Reduce the height to $h = 0.05\ \mathrm{m}$ ($\lambda/20$) and solve at $300\ \mathrm{MHz}$. Compare $R_{in}$ with the short-dipole formula $R_{rad} = 80\pi^2 (L/\lambda)^2$ applied to the equivalent dipole $L = 2h$, then halved. What happens to $X_{in}$?

> **Tip**: With the ground plane on, a wire touching $z = 0$ gets a small fixed feed gap (one wire diameter). If you use very many segments, the solver will ask for fewer: the base segment must be longer than that gap.
