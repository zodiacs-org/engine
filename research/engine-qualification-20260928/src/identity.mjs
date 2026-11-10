import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { assert, digest, sha256 } from './common.mjs';

const MAX_FILES = 20000, MAX_BYTES = 256 * 1024 * 1024;
const within = (root, file) => file === root || file.startsWith(root + path.sep);

/** Inventory a trusted, standalone installed package. This is not code authentication or a sandbox. */
export async function identifyArtifact(entry) {
  assert(typeof entry === 'string' && path.isAbsolute(entry), 'Engine entry must be an absolute path');
  const absolute = path.resolve(entry);
  assert(await fs.realpath(absolute) === absolute, 'Entry/ancestor symlinks are unsupported');
  assert(path.basename(absolute) === 'index.js' && path.basename(path.dirname(absolute)) === 'dist', 'Expected installed package dist/index.js');
  const root = path.dirname(path.dirname(absolute)), files = {};
  let installedBytes = 0, fileCount = 0;
  async function visit(relative = '') {
    for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
      if (name === '.git') continue;
      const local = path.join(relative, name), full = path.join(root, local), stat = await fs.lstat(full);
      assert(!stat.isSymbolicLink(), 'Symlinks are unsupported in installed artifacts: ' + local);
      if (stat.isDirectory()) await visit(local);
      else {
        assert(stat.isFile(), 'Special filesystem entry in artifact: ' + local);
        assert(++fileCount <= MAX_FILES && installedBytes + stat.size <= MAX_BYTES, 'Artifact exceeds inventory safety limits');
        const bytes = await fs.readFile(full);
        installedBytes += bytes.length;
        assert(installedBytes <= MAX_BYTES, 'Artifact changed size while inventorying');
        files[local.split(path.sep).join('/')] = { sha256: sha256(bytes), bytes: bytes.length };
      }
    }
  }
  await visit();
  assert(files['dist/index.js'] && files['package.json'], 'Missing engine distribution or metadata');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert(pkg.name === '@zodiacs/engine' && typeof pkg.version === 'string' && pkg.version.length > 0, 'Expected @zodiacs/engine package metadata');
  const dependencies = [], visited = new Set();
  async function inspectPackage(packageRoot, metadata) {
    const relative = path.relative(root, packageRoot).split(path.sep).join('/') || '.';
    if (visited.has(relative)) return;
    visited.add(relative);
    assert(typeof metadata.name === 'string' && typeof metadata.version === 'string', 'Dependency identity is missing');
    const declared = { ...metadata.dependencies, ...metadata.optionalDependencies, ...metadata.peerDependencies };
    const require = createRequire(pathToFileURL(path.join(packageRoot, 'package.json')));
    const resolved = {};
    for (const name of Object.keys(declared).sort()) {
      let resolvedEntry;
      try { resolvedEntry = require.resolve(name); }
      catch { throw new Error('Unresolved declared runtime dependency (including optional/peer): ' + name + ' from ' + relative); }
      assert(path.isAbsolute(resolvedEntry) && within(root, resolvedEntry), 'Runtime dependency resolves outside standalone installation: ' + name);
      assert(await fs.realpath(resolvedEntry) === resolvedEntry, 'Resolved dependency contains a symlink');
      let parent = path.dirname(resolvedEntry), depRoot = null, dep = null;
      while (within(root, parent)) {
        try {
          const candidate = JSON.parse(await fs.readFile(path.join(parent, 'package.json'), 'utf8'));
          if (candidate.name === name) { depRoot = parent; dep = candidate; break; }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (parent === root) break;
        parent = path.dirname(parent);
      }
      assert(depRoot && dep, 'Cannot establish installed dependency package boundary: ' + name);
      assert(files[path.relative(root, resolvedEntry).split(path.sep).join('/')], 'Resolved dependency entry was not inventoried');
      resolved[name] = { requested: String(declared[name]), installed: dep.version, path: path.relative(root, depRoot).split(path.sep).join('/') };
      await inspectPackage(depRoot, dep);
    }
    dependencies.push({ path: relative, name: metadata.name, version: metadata.version, runtimeDependencies: resolved });
  }
  await inspectPackage(root, pkg);
  dependencies.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const identity = { schemaVersion: 1, name: pkg.name, version: pkg.version, entry: 'dist/index.js',
    scope: 'All regular files under the standalone installed package, including node_modules; .git excluded. Declared runtime/optional/peer dependency resolution checked recursively. Dynamic external imports and transient mutation are not authenticated.',
    files, dependencies, installedBytes, fileCount };
  return { ...identity, digest: digest(identity) };
}
