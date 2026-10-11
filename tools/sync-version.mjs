/**
 * Synchronize the root npm version with the native crate and its locked entry.
 * Tauri reads its version directly from package.json. No dependency resolution,
 * network access, or unrelated lockfile updates are needed for a version bump.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/** Synchronize or validate a project's native versions, rejecting ambiguous files. */
export function syncVersions(root, { check = false } = {}) {
  const read = path => readFileSync(resolve(root, path), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  if (typeof version !== 'string' || !semanticVersion.test(version)) {
    throw new Error('package.json must contain a valid semantic version');
  }
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  if (config.version !== '../package.json') {
    throw new Error('Tauri version must reference ../package.json');
  }

  const manifest = read('src-tauri/Cargo.toml');
  const packageSections = manifest.match(/^\[package\]\r?\n[\s\S]*?(?=^\[|(?![\s\S]))/gm);
  if (packageSections?.length !== 1) throw new Error('Expected one Cargo [package] section');
  const packageSection = packageSections[0];
  const name = /^name\s*=\s*"([^"]+)"\s*$/m.exec(packageSection)?.[1];
  if (!name) throw new Error('Missing native crate name');
  const versionLine = /^version\s*=\s*"([^"]+)"[ \t]*$/gm;
  if ([...packageSection.matchAll(versionLine)].length !== 1) {
    throw new Error('Expected one native package version');
  }
  const newManifest = manifest.replace(packageSection, packageSection.replace(versionLine, `version = "${version}"`));

  const lock = read('src-tauri/Cargo.lock');
  const sections = lock.match(/^\[\[package\]\]\r?\n[\s\S]*?(?=^\[\[package\]\]|(?![\s\S]))/gm) ?? [];
  const matches = sections.filter(section => /^name\s*=\s*"([^"]+)"\s*$/m.exec(section)?.[1] === name);
  if (matches.length !== 1 || [...matches[0].matchAll(versionLine)].length !== 1) {
    throw new Error(`Expected one locked version for native crate ${name}`);
  }
  const newLock = lock.replace(matches[0], matches[0].replace(versionLine, `version = "${version}"`));
  const updates = [
    ['src-tauri/Cargo.toml', manifest, newManifest],
    ['src-tauri/Cargo.lock', lock, newLock]
  ].filter(([, before, after]) => before !== after);
  if (check && updates.length) {
    throw new Error(`Native version differs from npm ${version}; run npm run version:sync`);
  }
  for (const [path, , contents] of updates) writeFileSync(resolve(root, path), contents);
  return { version, changed: updates.map(([path]) => path) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = syncVersions(root, { check: process.argv.includes('--check') });
  // npm creates its version commit after this hook; include native files in it.
  if (process.env.npm_lifecycle_event === 'version' && existsSync(resolve(root, '.git'))) {
    execFileSync('git', ['add', '--', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'], { cwd: root, stdio: 'inherit' });
  }
  console.log(`npm, Tauri and Rust versions synchronized at ${result.version}`);
}
