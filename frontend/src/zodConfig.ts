import { z } from 'zod';

// zod probes `new Function("")` to decide whether it may JIT-compile parsers.
// The probe is caught, but a strict CSP (script-src 'self', no 'unsafe-eval')
// still reports it as a violation on every page load. Imported first in main.tsx.
z.config({ jitless: true });
