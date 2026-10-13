import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseNutationTerms } from './frames.mjs';

export const erfaDirectory = fileURLToPath(new URL('../runtime/erfa-source/',import.meta.url));
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const erfaCatalog = JSON.parse(await readFile(new URL('./erfa-catalog.json',import.meta.url),'utf8'));

// Fetch explicit public inputs only when called; no import-time network.
export async function acquireErfa() {
  await mkdir(erfaDirectory,{recursive:true});
  if (!(await lstat(erfaDirectory)).isDirectory()) throw Error('Regular ERFA runtime directory required');
  for (const [name,expected] of Object.entries(erfaCatalog.files)) {
    const path=join(erfaDirectory,name);
    let bytes;
    try {
      const info=await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size>=2_000_000) throw Error('Unsafe ERFA source file');
      bytes=await readFile(path);
    } catch (error) { if (error.code!=='ENOENT') throw error; }
    if (!bytes) {
      const response=await fetch(erfaCatalog.baseUrl+name,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if (response.status!==200) throw Error('ERFA source download failed');
      const chunks=[]; let size=0;
      for await (const chunk of response.body) {
        size+=chunk.length;
        if (size>=2_000_000) throw Error('Oversized ERFA source');
        chunks.push(chunk);
      }
      bytes=Buffer.concat(chunks);
      if (sha256(bytes)!==expected) throw Error(`ERFA digest mismatch: ${name}`);
      await writeFile(path,bytes,{flag:'wx'});
    }
    if (sha256(bytes)!==expected) throw Error(`ERFA digest mismatch: ${name}`);
  }
  return erfaCatalog;
}

export async function loadNutationTerms() {
  const bytes=await readFile(join(erfaDirectory,'nut00b.c'));
  if (sha256(bytes)!==erfaCatalog.files['nut00b.c']) throw Error('ERFA nutation source digest mismatch');
  return parseNutationTerms(bytes.toString('utf8'));
}
