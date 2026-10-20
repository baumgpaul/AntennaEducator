import type { FieldType } from '@/types/fieldDefinitions';
import type { DisplayQuantity } from '@/types/postprocessing';

const FIELD_UNITS: Record<FieldType, [string, string]> = { E: ['E', 'V/m'], H: ['H', 'A/m'], poynting: ['S', 'W/m²'] };

/** Label and unit of the displayed quantity, e.g. "|E|" in V/m or "∠E" in °. */
export function quantityLabel(fieldType: FieldType, dq: DisplayQuantity = 'magnitude'): { label: string; unit: string } {
  const [sym, unit] = FIELD_UNITS[fieldType];
  if (dq === 'phase') return { label: `∠${sym}`, unit: '°' };
  if (dq === 'real') return { label: `Re ${sym}`, unit };
  if (dq === 'imaginary') return { label: `Im ${sym}`, unit };
  if (dq === 'instantaneous') return { label: `${sym}(t)`, unit };
  return { label: `|${sym}|`, unit };
}
