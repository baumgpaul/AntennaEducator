# Module 9: Yagi-Uda Antenna

## Theory

### Parasitic Elements

A **Yagi-Uda** antenna has only one fed element — the **driven element**, usually a half-wave dipole. The other elements are plain wires without any source, **parasitically** excited by the field of the driven element. Each parasitic wire carries an induced current whose amplitude and phase depend on its length and its distance to the driven element. Their radiation adds to that of the driven element, and with the right phases the antenna becomes strongly directional.

This is the array of Module 7 again — but without a feed network: the element currents are set by **mutual coupling** alone.

### Reflector and Director

The phase of the induced current depends on whether the parasitic wire is above or below its own resonance:

| Element | Length | Behaviour | Effect |
|---|---|---|---|
| **Reflector** | slightly longer than $\lambda/2$ | inductive, current lags | pushes radiation **away** from itself |
| **Driven element** | about $\lambda/2$ | fed | — |
| **Director** | slightly shorter than $\lambda/2$ | capacitive, current leads | pulls radiation **towards** itself |

With spacings of $0.1\lambda$ to $0.25\lambda$, the field of reflector, driven element and director add up in the direction of the director (**forward**) and largely cancel backwards. Adding more directors increases directivity further: typical values are about $7$–$9\ \mathrm{dBi}$ for 3 elements and $12$–$15\ \mathrm{dBi}$ for 10 or more.

### Figures of Merit

- **Directivity** $D$ in the forward direction.
- **Front-to-back ratio** $F/B = U(\text{forward}) / U(\text{backward})$, usually in dB.
- **Input impedance**: mutual coupling lowers the driven element's resistance well below the $73\ \Omega$ of a lone dipole (often $20$–$40\ \Omega$) and shifts its reactance, so the driven-element length is adjusted for resonance.

All three depend on every length and spacing at once — Yagi design is an optimisation problem, and a Yagi is a narrowband antenna.

---

## Worked Example

**Setup** at $f = 300\ \mathrm{MHz}$ ($\lambda = 1\ \mathrm{m}$), all wires along $z$, boom along $x$, wire radius $1\ \mathrm{mm}$, 21 segments per element:

| Element | Length | Position |
|---|---|---|
| Reflector (parasitic rod) | $0.50\ \mathrm{m}$ | $x = -0.25\ \mathrm{m}$ |
| Driven dipole (fed) | $0.47\ \mathrm{m}$ | $x = 0$ |
| Director (parasitic rod) | $0.44\ \mathrm{m}$ | $x = +0.25\ \mathrm{m}$ |

Element spacing $\lambda/4$. Solved from $280$ to $320\ \mathrm{MHz}$.

**Observe in the pre-loaded results (300 MHz):**

1. The **currents** on the parasitic rods reach about half of the driven element's maximum (reflector $\approx 19\ \mathrm{mA}$, director $\approx 25\ \mathrm{mA}$, driven $\approx 43\ \mathrm{mA}$ for a $1\ \mathrm{V}$ feed) — wires without any source radiate a large share of the power.
2. The **radiation pattern** points along $+x$, towards the director ($\theta = 90°, \phi = 0°$).
3. Directivity $\approx 8.6\ \mathrm{dBi}$ (a lone half-wave dipole: $2.15\ \mathrm{dBi}$) and $F/B \approx 10\ \mathrm{dB}$.
4. $Z_{in} \approx 36 - j30\ \Omega$. The same dipole on its own gives $\approx 59 - j59\ \Omega$ at $300\ \mathrm{MHz}$ (Module 1): the coupling lowers the resistance considerably and changes the reactance.
5. Over the sweep, $F/B$ falls quickly above the design frequency (about $6\ \mathrm{dB}$ at $310\ \mathrm{MHz}$) — the Yagi is narrowband.

---

## Your Task

1. **Remove the director** (hide or delete it) and solve again. Then remove the reflector instead. How much does each parasitic element contribute to directivity and $F/B$?

2. **Swap the roles**: Make the reflector shorter ($0.44\ \mathrm{m}$) and the director longer ($0.50\ \mathrm{m}$). In which direction does the beam point now? Explain with the phase of the induced currents.

3. **Tune the front-to-back ratio**: Move the reflector to $x = -0.20\ \mathrm{m}$ and vary its length between $0.48$ and $0.52\ \mathrm{m}$. Which combination maximises $F/B$? What happens to the directivity at the same time?

4. **Match the feed**: Adjust the driven-element length until $X_{in} \approx 0$ at $300\ \mathrm{MHz}$. Does the resonant length get longer or shorter than $0.47\ \mathrm{m}$? What is $R_{in}$ then, and what VSWR does that give on a $50\ \Omega$ line?

5. **Add a second director** of $0.43\ \mathrm{m}$ at $x = +0.50\ \mathrm{m}$. How much directivity do you gain? Compare with the 2-element array of Module 7, which needed a feed for every element.

> **Tip**: Parasitic elements are rods (Designer ribbon → *Rod*) without a source. The solver needs at least one fed element in the system; parasitic wires simply carry the currents induced by mutual coupling.
