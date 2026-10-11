/**
 * Version synchronization regressions and actual npm-version lifecycle coverage.
 * The filename keeps these Node-runner tests out of Vitest's test discovery.
 * Fixtures live in isolated temporary directories and never change the worktree.
 */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { syncVersions } from './sync-version.mjs';

/** Isolated minimal project, recreated for each test. */
let root;
/** Write one fixture relative to the isolated project. */
const write = (path, text) => writeFileSync(join(root, path), text);
/** Read one fixture without modifying its bytes. */
const read = path => readFileSync(join(root, path), 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jungle-version-'));
  mkdirSync(join(root, 'src-tauri'));
  mkdirSync(join(root, 'tools'));
  write('package.json', JSON.stringify({
    name: 'fixture', version: '1.0.0', private: true,
    scripts: { version: 'node tools/sync-version.mjs' }
  }));
  write('src-tauri/tauri.conf.json', JSON.stringify({ version: '../package.json' }));
  write('src-tauri/Cargo.toml', '[package]\nname = "jungle-run"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n');
  write('src-tauri/Cargo.lock', 'version = 4\n\n[[package]]\nname = "jungle-run"\nversion = "0.1.0"\n\n[[package]]\nname = "other"\nversion = "0.1.0"\n');
  cpSync(new URL('./sync-version.mjs', import.meta.url), join(root, 'tools/sync-version.mjs'));
});
afterEach(() => { rmSync(root, { recursive: true }); });

test('synchronizes only the native package and leaves dependencies untouched', () => {
  const result = syncVersions(root);
  assert.equal(result.version, '1.0.0');
  assert.match(read('src-tauri/Cargo.toml'), /version = "1.0.0"/);
  assert.match(read('src-tauri/Cargo.lock'), /name = "other"\nversion = "0.1.0"/);
  assert.deepEqual(syncVersions(root, { check: true }).changed, []);
});

test('check mode fails without writing when a native version differs', () => {
  const before = read('src-tauri/Cargo.toml');
  assert.throws(() => syncVersions(root, { check: true }), /version differs/);
  assert.equal(read('src-tauri/Cargo.toml'), before);
});

test('rejects ambiguous lock entries before writing any files', () => {
  const before = read('src-tauri/Cargo.toml');
  write('src-tauri/Cargo.lock', read('src-tauri/Cargo.lock') + '\n[[package]]\nname = "jungle-run"\nversion = "0.1.0"\n');
  assert.throws(() => syncVersions(root), /Expected one locked version/);
  assert.equal(read('src-tauri/Cargo.toml'), before);
});

test('supports prerelease versions and preserves Windows line endings', () => {
  const manifest = read('src-tauri/Cargo.toml').replaceAll('\n', '\r\n');
  write('src-tauri/Cargo.toml', manifest);
  write('package.json', JSON.stringify({ version: '1.2.3-beta.1' }));
  syncVersions(root);
  assert.equal(read('src-tauri/Cargo.toml'), manifest.replace('0.1.0', '1.2.3-beta.1'));
  assert.equal(syncVersions(root, { check: true }).version, '1.2.3-beta.1');
});

test('rejects invalid semantic versions and a stale Tauri configuration', () => {
  for (const version of ['1.2', '01.2.3', '1.2.3-beta..1', '1.2.3-01']) {
    write('package.json', JSON.stringify({ version }));
    assert.throws(() => syncVersions(root), /valid semantic version/);
  }
  write('package.json', JSON.stringify({ version: '1.0.0' }));
  write('src-tauri/tauri.conf.json', JSON.stringify({ version: '0.1.0' }));
  assert.throws(() => syncVersions(root), /must reference/);
});

test('shared Tauri config leaves the signing team unset for unsigned simulator CI', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.equal(config.bundle.iOS?.developmentTeam, undefined);
});

test('npm version patch runs the hook with no git commit or tag', () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['version', 'patch', '--no-git-tag-version'], {
    cwd: root, env: { ...process.env, npm_lifecycle_event: '', npm_config_git_tag_version: 'false' },
    // Windows npm is a command shim, not an executable binary.
    shell: process.platform === 'win32'
  });
  assert.equal(JSON.parse(read('package.json')).version, '1.0.1');
  assert.equal(syncVersions(root, { check: true }).version, '1.0.1');
});

test('npm version includes native manifests in its version commit and tag', () => {
  syncVersions(root);
  write('.npmrc', `message=${JSON.stringify('Version %s\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')}\n`);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git(['init', '--quiet']);
  git(['config', 'user.name', 'Version Test']);
  git(['config', 'user.email', 'version-test@example.invalid']);
  git(['add', '--', '.npmrc', 'package.json', 'tools/sync-version.mjs', 'src-tauri']);
  git(['commit', '--quiet', '-m', 'Version fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['version', 'minor'], {
      cwd: root, shell: process.platform === 'win32'
    });
  assert.equal(syncVersions(root, { check: true }).version, '1.1.0');
  const changed = git(['show', '--format=', '--name-only', 'HEAD']);
  assert.match(changed, /src-tauri\/Cargo.toml/);
  assert.match(changed, /src-tauri\/Cargo.lock/);
  assert.equal(git(['tag', '--list', 'v1.1.0']).trim(), 'v1.1.0');
});
