import { strToU8, zipSync } from 'fflate';

/** Text files (name → content) as one zip archive, so an export is a single download. */
export function zipFiles(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}
