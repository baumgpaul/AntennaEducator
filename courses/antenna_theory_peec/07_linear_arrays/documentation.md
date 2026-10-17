# Module 7: Linear Arrays and Beam Forming

## Theory

### Array Factor

A **linear array** of $N$ identical antenna elements (isotropic point sources for simplicity) spaced $d$ apart along the z-axis with progressive phase shift $\alpha$ between adjacent elements has an **array factor**:

$$\mathrm{AF}(\theta) = \sum_{n=0}^{N-1} e^{jn(kd\cos\theta + \alpha)} = \frac{\sin(N\psi/2)}{N\sin(\psi/2)}, \qquad \psi = kd\cos\theta + \alpha$$

The total radiation pattern is the product:

$$F_{total}(\theta) = F_{element}(\theta) \times |\mathrm{AF}(\theta)|^2$$

This is the **pattern multiplication theorem** (valid for identical, equally spaced elements).

### Main Lobe Direction

The main lobe occurs at $\psi = 0$, i.e., $\cos\theta_0 = -\alpha/(kd)$. Therefore:

| Configuration | Phase shift $\alpha$ | Main lobe $\theta_0$ |
|---|---|---|
| Broadside | $0$ | $90°$ (perpendicular to array axis) |
| End-fire (forward) | $-kd$ | $0°$ (along array axis) |
| End-fire (backward) | $+kd$ | $180°$ |
| Scanned | $-kd\cos\theta_0$ | Any $\theta_0$ |

### Directivity and Beamwidth

For a broadside uniform linear array:

$$\mathrm{HPBW} \approx \frac{0.886\lambda}{Nd} \quad (\text{radians}), \qquad D_0 \approx 2Nd/\lambda$$

So **doubling the number of elements** (keeping $d$ fixed) halves the beamwidth and doubles the directivity (+3 dB).

### Grating Lobes

Grating lobes are additional main lobes that appear when $d > \lambda$. They arise because $\psi = \pm 2\pi$ at angles other than $\theta_0$. To avoid grating lobes in visible space ($|\cos\theta| \leq 1$):

$$d \leq \frac{\lambda}{1 + |\cos\theta_0|} \leq \lambda$$

For a broadside array the most stringent condition is $d \leq \lambda$, and the safest design uses $d = \lambda/2$.

### From Isotropic to Dipole Array

Real dipole arrays replace the isotropic element pattern with $F_{dipole}(\theta)$. For a z-directed dipole array along z-axis:

$$F_{total}(\theta) = \left[\frac{\cos(\frac{\pi}{2}\cos\theta)}{\sin\theta}\right]^2 \times |\mathrm{AF}(\theta)|^2$$

Note: for an array along the z-axis, a z-directed dipole has **no gain advantage in the azimuthal direction** — both broadside and end-fire arrays of z-directed dipoles point their main beam perpendicular to the dipole axis.

---

## Worked Example

**Setup**: Two half-wave dipoles ($L = 0.5\ \mathrm{m}$, $r = 1\ \mathrm{mm}$, 21 segments each), placed along the x-axis separated by $d = \lambda/2 = 0.5\ \mathrm{m}$ at $f = 300\ \mathrm{MHz}$. Both dipoles are oriented along $\hat{z}$ (vertical), fed in phase ($\alpha = 0$, broadside configuration).

**Analytical predictions**:
- Main lobe at $\theta = 90°$ (broadside to the array axis, i.e., along the y-axis)
- $D_0 \approx D_{dipole} \times 2 \approx 1.64 \times 2 = 3.28 = 5.15\ \mathrm{dBi}$
- HPBW in the H-plane $\approx 0.886\lambda/(2d) \approx 0.886 \times 1/(2 \times 0.5) \approx 89°$

**Observe in the pre-loaded results:**

1. The **3D radiation pattern** is flattened in the x-direction compared to a single dipole — the array creates a directional beam.
2. Directivity is approximately $5.15\ \mathrm{dBi}$ (a 3 dB improvement over the single element).
3. In the H-plane cut (xz-plane), the pattern narrows by roughly half compared to the single-dipole case.

---

## Your Task

1. Using the two-element array project, run the solver and examine the radiation pattern.

2. **Extend to 4 elements**: Add two more dipoles at $x = \pm 0.25\ \mathrm{m}$ and $x = \pm 0.75\ \mathrm{m}$ (forming a 4-element broadside array with $d = \lambda/2$). All dipoles in phase.
   - Compare the directivity and HPBW with the 2-element case.
   - Does the directivity increase by another 3 dB?

3. **Grating lobe experiment**: Keep the 2-element array but **double the spacing** to $d = \lambda = 1\ \mathrm{m}$ (move the second dipole to $x = 1\ \mathrm{m}$). Keep $\alpha = 0$ (broadside).
   - Where do grating lobes appear? Compare with the theoretical prediction.
   - Can you eliminate the grating lobes by changing the inter-element spacing back to $d = \lambda/2$?

4. **End-fire configuration**: Using the 2-element array with $d = \lambda/4 = 0.25\ \mathrm{m}$, set the phase difference to $\alpha = -kd = -90°$ (i.e., the second element leads the first by $90°$). This requires feeding the two dipoles with different source phases.
   - What is the main lobe direction?
   - Compare the directivity with the broadside configuration.

> **Tip**: In the simulator, you can add multiple dipole elements and configure each source independently via the circuit editor. Use the Port Quantities view to verify that all elements are excited correctly.
