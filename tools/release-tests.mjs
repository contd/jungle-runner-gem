/** Release-note gates and evidence checks without GitHub writes or credentials. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseNotes } from './release-notes.mjs';

/** Successful representative run with actual job names and step-name contracts. */
function fixture() {
  const names = [
    'Tests (ubuntu-22.04)', 'Tests (windows-latest)', 'Tests (macos-latest)',
    'Build desktop (linux)', 'Build desktop (windows)', 'Build desktop (macos)',
    'Build iOS simulator (unsigned ARM64)', 'Build Android debug APK (ARM64)',
    'Generate and verify documentation', 'deploy'
  ];
  return {
    version: '1.2.3', tag: 'v1.2.3',
    pagesUrl: 'https://contd.github.io/jungle-runner-gem/',
    runUrl: 'https://github.com/contd/jungle-runner-gem/actions/runs/123',
    jobs: names.map((name, index) => ({
      name, conclusion: 'success', html_url: `https://github.com/contd/jungle-runner-gem/actions/runs/123/job/${index}`,
      steps: ['Run npm run version:check', 'Run npm run lint', 'Run npm test', 'Run cargo fmt --check',
        name.includes('windows') ? 'Rust tests with Windows harness manifest' : 'Rust tests',
        'Run cargo clippy'].map(name => ({ name, conclusion: 'success' }))
    }))
  };
}

test('includes real test status links, Pages, docs snapshot and all platform downloads', () => {
  const notes = releaseNotes(fixture());
  assert.match(notes, /windows-latest \| Passed/);
  assert.match(notes, /https:\/\/contd.github.io\/jungle-runner-gem\//);
  assert.match(notes, /test-results.json/);
  assert.match(notes, /jungle-run-docs.zip/);
  for (const platform of ['windows', 'macos', 'linux', 'ios-simulator', 'android-debug']) {
    assert.match(notes, new RegExp(`jungle-run-${platform}\\.zip`));
  }
});

test('refuses mismatched tags, missing jobs, failures, and failed Pages deployments', () => {
  const input = fixture();
  assert.throws(() => releaseNotes({ ...input, tag: 'v1.2.4' }), /does not match/);
  assert.throws(() => releaseNotes({ ...input, jobs: input.jobs.slice(1) }), /gate did not succeed/);
  for (const job of input.jobs) {
    assert.throws(() => releaseNotes({
      ...input, jobs: input.jobs.map(entry => entry === job ? { ...entry, conclusion: 'failure' } : entry)
    }), /gate did not succeed/);
  }
});

test('does not claim tests passed when step evidence is absent', () => {
  const input = fixture();
  input.jobs[0].steps = [];
  assert.throws(() => releaseNotes(input), /Missing successful/);
});
