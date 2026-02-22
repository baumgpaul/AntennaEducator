/**
 * Number Parser Utility
 * Handles decimal separator normalization for international input
 * Accepts both '.' and ',' as decimal separators
 */

/**
 * Parse a number string accepting both '.' and ',' as decimal separators.
 * Also supports scientific notation (e.g., '1.2e-5', '1,2e-5', '3E+8').
 * @param value - Input string that may contain comma or period as decimal separator
 * @returns Parsed number or NaN if invalid
 */
export function parseDecimalNumber(value: string): number {
  if (typeof value !== 'string') {
    return parseFloat(value);
  }

  // Remove whitespace
  const trimmed = value.trim();

  if (trimmed === '' || trimmed === '-') {
    return NaN;
  }

  // Replace comma with period for decimal separator
  // Handle both European (1,23) and US (1.23) formats
  // Also handles scientific notation with comma: 1,2e-5 → 1.2e-5
  const normalized = trimmed.replace(',', '.');

  return parseFloat(normalized);
}

/**
 * Check if a string represents a valid numeric input (including partial input).
 * Accepts integers, decimals (. or ,), negative numbers, and scientific notation.
 * This is more permissive than parseDecimalNumber to allow mid-typing states.
 * @param value - Input string to validate
 * @returns true if the input is a valid or in-progress numeric entry
 */
export function isValidNumericInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return true;
  // Allow: optional sign, digits, one decimal (. or ,), optional exponent (e/E with optional sign and digits)
  return /^[+-]?\d*[.,]?\d*([eE][+-]?\d*)?$/.test(trimmed);
}

/**
 * Format a number for display, optionally using comma as decimal separator
 * @param value - Number to format
 * @param useComma - Whether to use comma instead of period (default: false)
 * @param decimals - Number of decimal places (optional)
 * @returns Formatted string
 */
export function formatDecimalNumber(
  value: number,
  useComma: boolean = false,
  decimals?: number
): string {
  if (isNaN(value) || !isFinite(value)) {
    return '';
  }

  const formatted = decimals !== undefined ? value.toFixed(decimals) : value.toString();

  return useComma ? formatted.replace('.', ',') : formatted;
}

/**
 * Create an onChange handler that parses decimal numbers for form inputs
 * @param onChange - React Hook Form onChange callback
 * @returns Handler function for input onChange events
 */
export function createNumberInputHandler(
  onChange: (value: number) => void
): (e: React.ChangeEvent<HTMLInputElement>) => void {
  return (e) => {
    const parsed = parseDecimalNumber(e.target.value);
    onChange(isNaN(parsed) ? 0 : parsed);
  };
}
