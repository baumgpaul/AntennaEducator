import { configureTextBuilder } from 'troika-three-text';
import robotoLatinWoff from '@fontsource/roboto/files/roboto-latin-400-normal.woff?url';

/**
 * 3D text labels (drei <Text> → troika-three-text) under the enforced CSP.
 *
 * By default troika typesets in a Web Worker whose code is loaded with
 * importScripts(blob:…), which `script-src 'self'` blocks, and it fetches font
 * data from cdn.jsdelivr.net, which `connect-src` blocks. So: typeset on the
 * main thread (a handful of labels, unnoticeable) and use a bundled font served
 * from our own origin. Must run before the first <Text> renders: imported first
 * in main.tsx. Labels are Latin only (numbers, axis letters, node ids).
 */
configureTextBuilder({ useWorker: false });

/** Pass as `font` to every drei <Text>; without it troika resolves fonts from its CDN. */
export const TEXT_FONT_URL: string = robotoLatinWoff;
