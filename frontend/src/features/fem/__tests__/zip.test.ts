import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { zipFiles } from '../zip';

describe('zipFiles (openCFS export as one download)', () => {
  it('packs every file under its name, contents unchanged', () => {
    const files = { 'model.xml': '<cfsSimulation/>', 'mat.xml': '<cfsMaterialDataBase/>', 'mesh.cdb': 'NBLOCK\n1 0 0' };
    const bytes = zipFiles(files);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK"
    const back = unzipSync(bytes);
    expect(Object.keys(back).sort()).toEqual(Object.keys(files).sort());
    for (const [name, text] of Object.entries(files)) expect(strFromU8(back[name])).toBe(text);
  });

  it('keeps non-ASCII text (µ, ε) as UTF-8', () => {
    const back = unzipSync(zipFiles({ 'notes.txt': 'ε_r = 2.1, 5 µm' }));
    expect(strFromU8(back['notes.txt'])).toBe('ε_r = 2.1, 5 µm');
  });
});
