import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MAX_FILE_BYTES } from '../tools/check.mjs';

const swissName = /(?:^|[^a-z0-9])(?:py)?swisseph(?:$|[^a-z0-9])/i;
const codeName = /\.(?:[cm]?[jt]sx?|pyi?|vue|svelte|html)$/i;
const dependencyKeys = new Set(['dependencies', 'devDependencies', 'optionalDependencies',
  'peerDependencies', 'bundledDependencies', 'bundleDependencies', 'overrides', 'resolutions', 'scripts']);

function dependencyKind(path) {
  const name = basename(path).toLowerCase();
  if (['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pipfile.lock'].includes(name)) return 'json';
  if (/\.lock(?:b)?$/.test(name) || /(?:^|[.-])lock\.(?:json|ya?ml)$/.test(name)
      || /^(?:requirements|constraints)(?:[._-].*)?$/.test(name)
      || /(?:^|\/)requirements\/.*\.(?:txt|in)$/.test(path)
      || ['pyproject.toml', 'pipfile', 'setup.py', 'setup.cfg'].includes(name)
      || /^(?:dockerfile(?:[.-].*)?|.*[.]dockerfile)$/.test(name)) return 'text';
  return null;
}

// A lexical guard for literal module specifiers, not a sandbox for executing
// arbitrary programs. Comments and string contents are never parsed as code.
function tokens(source, python) {
  const result = [];
  let at = 0, line = 1;
  const add = (kind, value, startLine = line) => result.push({ kind, value, line: startLine });
  function scan(stopAtBrace = false) {
    let depth = 0;
    while (at < source.length) {
      const char = source[at];
      if (char === '}' && stopAtBrace && depth === 0) { at++; return; }
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
        const regexStart = !previous || controlCondition
          || (previous.kind === 'punctuation' && /^[({[=,:;!?|&+*%~<>^/-]$/.test(previous.value))
          || (previous.kind === 'word' && ['return', 'throw', 'case', 'yield', 'await', 'typeof', 'void', 'delete'].includes(previous.value));
        if (regexStart) {
          const startLine = line;
          at++;
          let inClass = false;
          while (at < source.length && source[at] !== '\n') {
            const current = source[at++];
            if (current === '\\') { at++; continue; }
            if (current === '[') inClass = true;
            else if (current === ']') inClass = false;
            else if (current === '/' && !inClass) break;
          }
          while (at < source.length && /[a-z]/i.test(source[at])) at++;
          add('regex', '/', startLine);
          continue;
        }
      }
      if (char === '"' || char === "'" || (!python && char === '`')) {
        const startLine = line;
        const quote = python && source.startsWith(char.repeat(3), at) ? char.repeat(3) : char;
        at += quote.length;
        let value = '', interpolated = false;
        while (at < source.length && !source.startsWith(quote, at)) {
          if (quote === '`' && source.startsWith('${', at)) {
            add('template', value, startLine);
            interpolated = true;
            at += 2;
            scan(true);
            value = '';
            continue;
          }
          if (source[at] === '\\') {
            at++;
            const escaped = source[at++];
            if (escaped === '\n') { line++; continue; }
            if ((escaped === 'x' || escaped === 'u') && source[at] !== '{') {
              const digits = escaped === 'x' ? 2 : 4;
              const hex = source.slice(at, at + digits);
              if (new RegExp(`^[0-9a-f]{${digits}}$`, 'i').test(hex)) {
                value += String.fromCharCode(parseInt(hex, 16)); at += digits; continue;
              }
            }
            if (escaped === 'u' && source[at] === '{') {
              const match = /^\{([0-9a-f]{1,6})\}/i.exec(source.slice(at));
              if (match && parseInt(match[1], 16) <= 0x10ffff) {
                value += String.fromCodePoint(parseInt(match[1], 16)); at += match[0].length; continue;
              }
            }
            value += escaped ?? '';
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
        if (char === '{') depth++;
        else if (char === '}') depth--;
        add('punctuation', char); at++;
      }
    }
  }
  scan();
  return result;
}

function importLines(source, python) {
  const lexemes = tokens(source, python);
  const significant = lexemes.filter(token => token.kind !== 'newline');
  const lines = new Set();
  for (let i = 0; i < significant.length; i++) {
    const token = significant[i];
    if (token.kind !== 'string' || !swissName.test(token.value)) continue;
    const previous = significant[i - 1];
    if (previous?.kind === 'word' && ['from', 'import'].includes(previous.value)) lines.add(token.line);
    let callerIndex = i - 1;
    while (significant[callerIndex]?.value === '(') callerIndex--;
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
    for (const [i, line] of source.split('\n').entries()) {
      if (!/^\s*#/.test(line) && swissName.test(line)) {
        errors.push({ path, rule: 'dependency', line: i + 1, reason: 'Swiss dependency forbidden' });
      }
    }
  }
  const exempt = path.startsWith('crosscheck/') || path === 'conformance/adapters/pyswisseph.py';
  const python = /\.pyi?$/i.test(path) || /^#![^\n]*\bpython[\d.]*\b/.test(source);
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
    if (!codeName.test(path) && !dependencyKind(path) && basename(path).includes('.')) continue;
    // Inspect working bytes, including local edits, with no traversal of ignored
    // caches or dependencies. Reject symlinks in every selected path component.
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (!(await lstat(join(root, ...parts.slice(0, i)))).isDirectory()) throw Error(`Unsafe tracked directory: ${path}`);
    }
    const full = join(root, path), info = await lstat(full);
    if (!info.isFile() || info.size >= MAX_FILE_BYTES) throw Error(`Unsafe tracked file: ${path}`);
    errors.push(...inspectTrackedFile(path, await readFile(full, 'utf8')));
  }
  return errors;
}
