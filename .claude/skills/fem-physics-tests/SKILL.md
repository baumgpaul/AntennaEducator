---
name: fem-physics-tests
description: The physics test standard for new FEM physics, boundary conditions, element types or solver features (femsolver/, mesher/, backend/fem). Use when adding or changing physics, before calling FEM work done.
---

# FEM physics test standard

FEM Studio is a teaching tool: wrong physics shown to students is the worst bug. Every new
physics / BC / element type / solver path gets **all** of these before merging
(tests in `femsolver/tests`, `mesher/tests`, service level in `tests/fem`):

1. **Analytic benchmarks** — textbook cases with closed-form answers (plate capacitor,
   coax `C = 2πε/ln(b/a)`, …), with an explicit tolerance that reflects the mesh.
2. **Convergence rate** — manufactured solution (or analytic case) on ≥ 3 refinements;
   assert the measured order (P1: error ∝ h² in L2/energy quantities, h¹ in the gradient).
   A wrong order catches bugs that a single tolerance check misses.
3. **Consistency** — energy vs. ½CU², charge from flux vs. from capacitance, global balances
   (sum of charges, Gauss's law) — "two ways" must agree.
4. **Each boundary condition** on its own — Dirichlet, Neumann/zero-flux, symmetry, charge, etc.
5. **Symmetry / invariance** — mirroring, rotation, translation, scaling, material scaling give
   the expected (often identical) result.
6. **Regression fixtures** — small stored reference results so refactors can't drift.
7. **Mutation check** — break the code on purpose (sign, factor 2, wrong Jacobian) and confirm
   a test fails; at least once per new feature.
8. **openCFS** — where the physics exists in openCFS, export the case and check it validates
   against the XSD (cross-check against the openCFS binary is TODO 2d).

In the PR's "Verified" section, give the numbers: error vs theory, measured order, counts.
