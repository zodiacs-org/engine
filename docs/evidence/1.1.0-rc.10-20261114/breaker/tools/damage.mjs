// Damage the installed package's pack chunk in place. Usage: node damage.mjs <consumer dir> <mode>
import { readdirSync, readFileSync, writeFileSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
const [dir, mode] = process.argv.slice(2);
const dist = join(dir, 'node_modules/@zodiacs/engine/dist');
const file = readdirSync(dist).map((n) => join(dist, n)).filter((n) => n.endsWith('.js')).sort((a, b) => readFileSync(b).length - readFileSync(a).length)[0];
let text = readFileSync(file, 'utf8');
const m = /"([A-Za-z0-9+/=]{100000,})"/.exec(text);
if (!m) throw new Error('no base64 literal found in ' + file);
const b64 = m[1];
const at = m.index + 1;
const put = (s) => text.slice(0, at) + s + text.slice(at + b64.length);
console.log(`chunk ${file}: ${text.length} chars, base64 literal ${b64.length} chars at ${at}`);
switch (mode) {
  case 'missing': text = put(''); break;                                   // bytes absent
  case 'flip-one': { const i = b64.length >> 1; text = put(b64.slice(0, i) + (b64[i] === 'A' ? 'B' : 'A') + b64.slice(i + 1)); break; }
  case 'flip-first': text = put((b64[0] === 'A' ? 'B' : 'A') + b64.slice(1)); break; // header byte
  case 'flip-last-data': { const i = b64.length - 8; text = put(b64.slice(0, i) + (b64[i] === 'A' ? 'B' : 'A') + b64.slice(i + 1)); break; }
  case 'flip-many': { const a = b64.split(''); for (let i = 1000; i < a.length; i += 9973) a[i] = a[i] === 'Q' ? 'R' : 'Q'; text = put(a.join('')); break; }
  case 'truncate-half': text = put(b64.slice(0, 4 * Math.floor(b64.length / 8))); break;
  case 'truncate-4': text = put(b64.slice(0, b64.length - 4)); break;       // three bytes short
  case 'swap-halves': { const h = 4 * Math.floor(b64.length / 8); text = put(b64.slice(h) + b64.slice(0, h)); break; }
  case 'not-base64': text = put('this is not base64 !!'); break;
  case 'zeros': text = put('A'.repeat(b64.length)); break;                 // right length, all zero bytes
  case 'wrong-sha': {                                                       // bytes intact, the expected digest changed
    const sha = '51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7';
    if (!text.includes(sha)) throw new Error('expected digest not in the chunk');
    text = text.split(sha).join('0'.repeat(64)); break;
  }
  case 'file-truncated': writeFileSync(file, text); truncateSync(file, Math.floor(text.length / 2)); console.log('file cut to half'); process.exit(0);
  case 'file-empty': writeFileSync(file, ''); process.exit(0);
  default: throw new Error('unknown mode ' + mode);
}
writeFileSync(file, text);
console.log(`mode ${mode}: written ${text.length} chars`);
