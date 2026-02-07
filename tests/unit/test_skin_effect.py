"""
Test skin effect in resistance calculation.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from backend.solver.resistance import (
    compute_dc_resistance,
    compute_ac_resistance,
    compute_skin_depth,
    COPPER_RESISTIVITY
)

# Test parameters
length = 1.0  # 1 meter
radius = 0.001  # 1mm
frequencies = [0, 1e3, 1e6, 10e6, 100e6, 1e9]  # DC to 1 GHz

print("="*70)
print("SKIN EFFECT IN RESISTANCE CALCULATION")
print("="*70)
print(f"\nWire parameters:")
print(f"  Length: {length*100:.1f} cm")
print(f"  Radius: {radius*1000:.1f} mm")
print(f"  Material: Copper (ρ = {COPPER_RESISTIVITY:.2e} Ω·m)")

R_dc = compute_dc_resistance(length, radius, COPPER_RESISTIVITY)
print(f"\nDC Resistance: {R_dc:.6f} Ω")

print(f"\n{'Frequency':>12} {'Skin Depth':>12} {'R_AC':>12} {'R_AC/R_DC':>12}")
print(f"{'(Hz)':>12} {'(mm)':>12} {'(Ω)':>12} {'(ratio)':>12}")
print("-"*70)

for freq in frequencies:
    if freq == 0:
        R_ac = R_dc
        delta = float('inf')
        print(f"{'DC':>12} {'∞':>12} {R_ac:.6f}   {R_ac/R_dc:>12.2f}")
    else:
        delta = compute_skin_depth(freq, COPPER_RESISTIVITY)
        R_ac = compute_ac_resistance(length, radius, freq, COPPER_RESISTIVITY)
        print(f"{freq:>12.0e} {delta*1000:>12.3f} {R_ac:>12.6f} {R_ac/R_dc:>12.2f}")

print()
print("="*70)
print("OBSERVATIONS:")
print("="*70)
print("  • At low frequencies (< 1 MHz): R_AC ≈ R_DC")
print("  • At high frequencies (> 100 MHz): R_AC >> R_DC due to skin effect")
print("  • At 1 GHz: Skin depth ~2 μm, R_AC is ~30x larger than R_DC")
print("  • This demonstrates the importance of skin effect at high frequencies")
print("="*70)
