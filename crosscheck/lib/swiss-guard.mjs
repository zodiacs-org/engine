import { execFileSync } from 'node:child_process';
import { lstat, open, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MAX_FILE_BYTES } from '../tools/check.mjs';

const swissName = /(?:^|[^a-z0-9])(?:py)?swisseph(?:$|[^a-z0-9])/i;
const codeName = /\.(?:[cm]?[jt]sx?|py[iw]?|vue|svelte|html)$/i;
const dependencyKeys = new Set(['dependencies', 'devDependencies', 'optionalDependencies',
  'peerDependencies', 'bundledDependencies', 'bundleDependencies', 'overrides', 'resolutions', 'scripts']);

// Frozen exact paths authorized by the phase 2 brief for pre-existing,
// test-only tooling. No directory globs or content hashes: ordinary edits to
// these files are allowed, but new siblings and all dependencies still fail.
export const SWISS_TEST_IMPORT_PATHS = Object.freeze([
  'conformance/adapters/pyswisseph.py',
  'conformance/arbiters/l2/check_swiss.py',
  'conformance/arbiters/l3/check_swiss.py',
  'conformance/harness/lib.mjs',
  'conformance/harness/report.mjs',
  'docs/evidence/houses-extra-2026-09-29/tools/compare-swiss.py',
  'docs/evidence/houses-extra-2026-09-29/tools/diagnose-swiss.py',
  'docs/evidence/houses-extra-2026-09-29/tools/speed-flags.py',
  'docs/evidence/houses-extra-2026-09-29/tools/swiss-self-difference.py',
  'docs/evidence/nutation-2026-09-29/tools/ladder-compare.py',
  'docs/evidence/nutation-2026-09-29/tools/swiss-compare.py',
  'docs/evidence/sky-chinese-2026-09-29/tools/sky_swiss.py',
  'docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py'
]);
const testImportPaths = new Set(SWISS_TEST_IMPORT_PATHS);

function dependencyKind(path) {
  const name = basename(path).toLowerCase();
  if (['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pipfile.lock'].includes(name)) return 'json';
  if (/\.lock(?:b)?$/.test(name) || /(?:^|[.-])lock\.(?:json|ya?ml)$/.test(name) || name === 'shrinkwrap.yaml'
      || /^(?:requirements|constraints)(?:[._-].*)?$/.test(name)
      || /(?:^|\/)requirements\/.*\.(?:txt|in)$/.test(path)
      || ['pyproject.toml', 'pipfile', 'setup.py', 'setup.cfg'].includes(name)
      || /^(?:dockerfile(?:[.-].*)?|.*[.]dockerfile)$/.test(name)) return 'text';
  return null;
}

// A lexical guard for literal module specifiers, not a sandbox for executing
// arbitrary programs. Scan interpolation expressions while excluding comments
// and literal string text.
function tokens(source, python) {
  // Python normalizes CR and CRLF, while JavaScript also treats its Unicode
  // line separators as terminators. Keep comment boundaries and line numbers
  // consistent with the language being scanned.
  source = source.replace(python ? /\r\n?/g : /\r\n?|\u2028|\u2029/g, '\n');
  const result = [];
  let at = 0, line = 1;
  const add = (kind, value, startLine = line) => result.push({ kind, value, line: startLine });
  function scanFormat() {
    while (at < source.length) {
      const char = source[at++];
      if (char === '}') return;
      if (char === '{') scan(true, true);
      else if (char === '\n') line++;
    }
  }
  function scan(stopAtBrace = false, formattedField = false) {
    let depth = 0, parentheses = 0, brackets = 0;
    const blocks = [];
    while (at < source.length) {
      const char = source[at];
      if (char === '}' && stopAtBrace && depth === 0) { at++; return; }
      if (formattedField && char === ':' && depth === 0 && parentheses === 0 && brackets === 0) {
        at++;
        scanFormat();
        return;
      }
      if (char === '\n') { add('newline', '\n'); line++; at++; continue; }
      if (/\s/.test(char)) { at++; continue; }
      if ((python && char === '#') || (!python && source.startsWith('//', at))) {
        while (at < source.length && source[at] !== '\n') at++;
        continue;
      }
      if (!python && source.startsWith('/*', at)) {
        const end = source.indexOf('*/', at + 2);
        const stop = end < 0 ? source.length : end + 2;
        line += (source.slice(at, stop).match(/\n/g) ?? []).length;
        at = stop;
        continue;
      }
      if (!python && char === '/') {
        const preceding = result.filter(token => token.kind !== 'newline');
        const previous = preceding.at(-1);
        let controlCondition = false;
        if (previous?.value === ')') {
          let nesting = 1;
          for (let i = preceding.length - 2; i >= 0; i--) {
            if (preceding[i].value === ')') nesting++;
            if (preceding[i].value === '(' && --nesting === 0) {
              controlCondition = ['if', 'while', 'for', 'with', 'switch', 'catch'].includes(preceding[i - 1]?.value);
              break;
            }
          }
        }
        const regexStart = !previous || controlCondition || previous.blockEnd
          || (previous.kind === 'punctuation' && /^[({[=,:;!?|&+*%~<>^/-]$/.test(previous.value))
          || (previous.kind === 'word' && ['return', 'throw', 'case', 'yield', 'await', 'typeof', 'void', 'delete'].includes(previous.value));
        if (regexStart) {
          const startLine = line;
          let cursor = at + 1, inClass = false, closed = false;
          while (cursor < source.length && source[cursor] !== '\n') {
            const current = source[cursor++];
            if (current === '\\') { cursor++; continue; }
            if (current === '[') inClass = true;
            else if (current === ']') inClass = false;
            else if (current === '/' && !inClass) { closed = true; break; }
          }
          if (closed) {
            at = cursor;
            while (at < source.length && /[a-z]/i.test(source[at])) at++;
            add('regex', '/', startLine);
            continue;
          }
        }
      }
      const stringPrefix = python ? /^(?:[rubf]|br|rb|fr|rf)(?=['"])/i.exec(source.slice(at))?.[0] : null;
      const formatPrefix = stringPrefix && /f/i.test(stringPrefix);
      if (char === '"' || char === "'" || (!python && char === '`') || stringPrefix) {
        const startLine = line;
        if (stringPrefix) at += stringPrefix.length;
        const delimiter = source[at];
        const quote = python && source.startsWith(delimiter.repeat(3), at) ? delimiter.repeat(3) : delimiter;
        at += quote.length;
        let value = '', interpolated = false;
        while (at < source.length && !source.startsWith(quote, at)) {
          if (formatPrefix && (source.startsWith('{{', at) || source.startsWith('}}', at))) {
            value += source[at]; at += 2; continue;
          }
          if (formatPrefix && source[at] === '{') {
            add('template', value, startLine);
            interpolated = true;
            at++;
            scan(true, true);
            value = '';
            continue;
          }
          if (quote === '`' && source.startsWith('${', at)) {
            add('template', value, startLine);
            interpolated = true;
            at += 2;
            scan(true);
            value = '';
            continue;
          }
          if (source[at] === '\\') {
            if (python && /r/i.test(stringPrefix ?? '')) {
              value += source[at++];
              if (formatPrefix && (source[at] === '{' || source[at] === '}')) continue;
              if (source[at] === '\n') line++;
              value += source[at++] ?? '';
              continue;
            }
            at++;
            const escaped = source[at++];
            if (escaped === '\n') { line++; continue; }
            // A Python backslash does not escape an f-string replacement
            // brace. Leave it for the interpolation scanner on the next pass.
            if (formatPrefix && (escaped === '{' || escaped === '}')) {
              value += '\\'; at--; continue;
            }
            if (python && /^[0-7]$/.test(escaped)) {
              const tail = /^[0-7]{0,2}/.exec(source.slice(at))[0];
              value += String.fromCharCode(parseInt(escaped + tail, 8)); at += tail.length; continue;
            }
            if ((escaped === 'x' || escaped === 'u' || python && escaped === 'U') && source[at] !== '{') {
              const digits = escaped === 'x' ? 2 : escaped === 'u' ? 4 : 8;
              const hex = source.slice(at, at + digits);
              if (new RegExp(`^[0-9a-f]{${digits}}$`, 'i').test(hex) && parseInt(hex, 16) <= 0x10ffff) {
                value += String.fromCodePoint(parseInt(hex, 16)); at += digits; continue;
              }
            }
            if (escaped === 'u' && source[at] === '{') {
              const match = /^\{([0-9a-f]{1,6})\}/i.exec(source.slice(at));
              if (match && parseInt(match[1], 16) <= 0x10ffff) {
                value += String.fromCodePoint(parseInt(match[1], 16)); at += match[0].length; continue;
              }
            }
            const pythonEscapes = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
            value += python && escaped && !['\\', '"', "'"].includes(escaped)
              ? pythonEscapes[escaped] ?? `\\${escaped}` : escaped ?? '';
          } else {
            if (source[at] === '\n') line++;
            value += source[at++];
          }
        }
        at += quote.length;
        add(interpolated ? 'template' : 'string', value, startLine);
        continue;
      }
      const word = /^[a-z_$][\w$]*/i.exec(source.slice(at));
      if (word) { add('word', word[0]); at += word[0].length; }
      else {
        let blockEnd = false;
        if (!python && char === '{') {
          const preceding = result.filter(token => token.kind !== 'newline');
          const previous = preceding.at(-1);
          let block = !previous || [')', ';', '{', '}'].includes(previous.value)
            || ['else', 'try', 'finally', 'do'].includes(previous.value)
            || previous.value === 'class' || preceding.at(-2)?.value === 'class';
          // A function or class expression ends an operand; a following slash
          // is division. Declarations and control blocks can precede regexes.
          let declaration = previous?.value === 'class' ? preceding.length - 1
            : preceding.at(-2)?.value === 'class' ? preceding.length - 2 : -1;
          if (previous?.value === ')') {
            let nesting = 1;
            for (let i = preceding.length - 2; i >= 0; i--) {
              if (preceding[i].value === ')') nesting++;
              if (preceding[i].value === '(' && --nesting === 0) {
                if (preceding[i - 1]?.value === 'function') declaration = i - 1;
                else if (preceding[i - 2]?.value === 'function') declaration = i - 2;
                break;
              }
            }
          }
          if (declaration >= 0) {
            if (preceding[declaration - 1]?.value === 'async') declaration--;
            const before = preceding[declaration - 1];
            block = !before || [';', '{', '}', 'export', 'default'].includes(before.value)
              || before.line < preceding[declaration].line && before.value !== '=';
          }
          blocks.push(block);
        } else if (!python && char === '}') blockEnd = blocks.pop() ?? false;
        if (char === '{') depth++;
        else if (char === '}') depth--;
        else if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
        add('punctuation', char);
        if (blockEnd) result.at(-1).blockEnd = true;
        at++;
      }
    }
  }
  scan();
  return result;
}

function importLines(source, python) {
  const lexemes = tokens(source, python);
  const significant = [];
  let depth = 0, statementBreak = false;
  for (let i = 0; i < lexemes.length; i++) {
    const token = lexemes[i];
    if (python && token.value === '\\' && lexemes[i + 1]?.kind === 'newline') {
      i++;
      continue;
    }
    if (token.kind === 'newline') {
      if (python && depth === 0) statementBreak = true;
      continue;
    }
    // Adjacent Python string literals form one value. A physical newline
    // joins them only inside grouping or after explicit line continuation.
    const previous = significant.at(-1);
    if (python && token.kind === 'string' && previous?.kind === 'string' && !statementBreak) {
      previous.value += token.value;
    } else significant.push({ ...token });
    if (token.kind === 'punctuation' && ['(', '[', '{'].includes(token.value)) depth++;
    else if (token.kind === 'punctuation' && [')', ']', '}'].includes(token.value)) depth--;
    statementBreak = false;
  }
  const lines = new Set();
  for (let i = 0; i < significant.length; i++) {
    const token = significant[i];
    if (token.kind !== 'string' || !swissName.test(token.value)) continue;
    const previous = significant[i - 1];
    if (previous?.kind === 'word' && ['from', 'import'].includes(previous.value)) lines.add(token.line);
    let callerIndex = i - 1;
    while (significant[callerIndex]?.value === '(') callerIndex--;
    if (python && significant[callerIndex]?.value === '=' && significant[callerIndex - 1]?.value === 'name') {
      callerIndex -= 2;
      while (significant[callerIndex]?.value === '(') callerIndex--;
    }
    if (significant[callerIndex]?.value === '.' && significant[callerIndex - 1]?.value === '?') callerIndex -= 2;
    const caller = significant[callerIndex];
    if (callerIndex < i - 1 && caller?.kind === 'word'
        && ['import', 'require', '__import__', 'import_module'].includes(caller.value)) lines.add(token.line);
    if (callerIndex < i - 1 && caller?.value === 'resolve'
        && significant[callerIndex - 1]?.value === '.' && significant[callerIndex - 2]?.value === 'require') lines.add(token.line);
  }
  if (python) {
    for (let i = 0; i < lexemes.length; i++) {
      const start = lexemes[i];
      if (start.kind !== 'word' || !['from', 'import'].includes(start.value)) continue;
      let module = '', alias = false, depth = 0;
      const finish = () => { if (swissName.test(module)) lines.add(start.line); module = ''; alias = false; };
      for (let j = i + 1; j < lexemes.length; j++) {
        const token = lexemes[j];
        if (token.kind === 'newline' && depth === 0 && lexemes[j - 1]?.value !== '\\') break;
        if (token.value === ';' || (start.value === 'from' && token.value === 'import')) break;
        if (token.value === '(') depth++;
        else if (token.value === ')') depth--;
        else if (token.value === ',') finish();
        else if (token.kind === 'word' && token.value === 'as') alias = true;
        else if (!alias && (token.kind === 'word' || token.value === '.')) module += token.value;
      }
      finish();
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function jsonListsSwiss(value, withinDependencies = false) {
  if (typeof value === 'string') return withinDependencies && swissName.test(value);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => swissName.test(key)
    || (['name', 'resolved', 'from'].includes(key) && typeof child === 'string' && swissName.test(child))
    || jsonListsSwiss(child, withinDependencies || dependencyKeys.has(key)));
}

export function inspectTrackedFile(path, source) {
  const errors = [];
  const kind = dependencyKind(path);
  if (kind === 'json') {
    let manifest;
    try { manifest = JSON.parse(source); }
    catch { return [{ path, rule: 'manifest', line: null, reason: 'invalid dependency JSON' }]; }
    if (jsonListsSwiss(manifest)) errors.push({ path, rule: 'dependency', line: null, reason: 'Swiss dependency forbidden' });
  } else if (kind === 'text') {
    // Keep inline URL fragments such as #egg=...; only full-line comments
    // are ignored. Installation metadata is checked conservatively.
    const physicalLines = source.split('\n');
    for (let i = 0; i < physicalLines.length; i++) {
      const startLine = i + 1;
      let line = physicalLines[i];
      if (/^\s*#/.test(line)) continue;
      while (/\\\r?$/.test(line) && i + 1 < physicalLines.length) {
        line = line.replace(/\\\r?$/, '') + physicalLines[++i];
      }
      if (swissName.test(line)) {
        errors.push({ path, rule: 'dependency', line: startLine, reason: 'Swiss dependency forbidden' });
      }
    }
  }
  const exempt = path.startsWith('crosscheck/') || testImportPaths.has(path);
  const python = /\.py[iw]?$/i.test(path) || /^#![^\n]*\bpython[\d.]*\b/.test(source);
  if (!exempt && (codeName.test(path) || python || /^#![^\n]*\bnode\b/.test(source))) {
    for (const line of importLines(source, python)) errors.push({ path, rule: 'import', line, reason: 'Swiss import forbidden' });
  }
  return errors;
}

export function trackedPaths(root) {
  const output = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root, encoding: 'utf8', maxBuffer: 8_000_000
  });
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

export async function checkSwissBoundary(root, paths = trackedPaths(root)) {
  const errors = [];
  for (const path of paths) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '..' || part === '.')) {
      throw Error('Invalid tracked path in Swiss guard.');
    }
    // Inspect working bytes, including local edits, with no traversal of ignored
    // caches or dependencies. Reject symlinks in every selected path component.
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (!(await lstat(join(root, ...parts.slice(0, i)))).isDirectory()) throw Error(`Unsafe tracked directory: ${path}`);
    }
    const full = join(root, path), info = await lstat(full);
    if (!info.isFile()) throw Error(`Unsafe tracked file: ${path}`);
    // Read the shebang even for unrecognized suffixes. Unrelated binary and
    // documentation files need no complete content read or size restriction.
    if (!codeName.test(path) && !dependencyKind(path)) {
      const handle = await open(full, 'r');
      let shebang;
      try {
        const prefix = Buffer.alloc(256);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        shebang = prefix.subarray(0, bytesRead).toString('utf8').split('\n')[0];
      } finally { await handle.close(); }
      if (!/^#![^\n]*\b(?:python[\d.]*|node)\b/.test(shebang)) continue;
    }
    if (info.size >= MAX_FILE_BYTES) throw Error(`Unsafe tracked file: ${path}`);
    errors.push(...inspectTrackedFile(path, await readFile(full, 'utf8')));
  }
  return errors;
}
