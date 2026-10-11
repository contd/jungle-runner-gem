/**
 * Generate release evidence from the current Actions run's actual job results.
 * Reject missing/failed gates and mismatched tags rather than publishing a
 * success-shaped release report. No test counts are inferred from job success.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Required matrix jobs and documentation deployment that must precede release. */
const REQUIRED_JOBS = [
  'Tests (ubuntu-22.04)', 'Tests (windows-latest)', 'Tests (macos-latest)',
  'Build desktop (linux)', 'Build desktop (windows)', 'Build desktop (macos)',
  'Build iOS simulator (unsigned ARM64)', 'Build Android debug APK (ARM64)',
  'Generate and verify documentation', 'deploy'
];

/** Build Markdown notes with verified status, per-job evidence links and limitations. */
export function releaseNotes({ version, tag, jobs, pagesUrl, runUrl }) {
  if (tag !== `v${version}`) throw new Error(`Release tag ${tag} does not match package version v${version}`);
  for (const name of REQUIRED_JOBS) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length !== 1 || matches[0].conclusion !== 'success') {
      throw new Error(`Release gate did not succeed: ${name}`);
    }
  }
  const docs = new URL(pagesUrl);
  if (docs.protocol !== 'https:') throw new Error('GitHub Pages URL must use HTTPS');
  const tests = jobs.filter(job => job.name.startsWith('Tests ('));
  const rows = tests.map(job => {
    const checks = ['npm run version:check', 'npm run lint', 'npm test',
      'cargo fmt', 'Rust tests', 'cargo clippy'];
    for (const check of checks) {
      if (!job.steps?.some(step => step.name.replace(/^Run /, '').startsWith(check) && step.conclusion === 'success')) {
        throw new Error(`Missing successful ${check} evidence in ${job.name}`);
      }
    }
    return `| ${job.name.slice(7, -1)} | Passed | [Test logs](${job.html_url}) |`;
  });
  return `## Jungle Run ${version}

All required tests and five-platform build jobs passed for this release.

### Test results

| Runner | Result | Evidence |
| :--- | :--- | :--- |
${rows.join('\n')}

Each runner passed version synchronization, TypeScript checks, frontend tests,
version/configuration tests, Rust tests (including native IPC), rustfmt, and
strict Clippy. Test counts and individual assertions are available in the linked
logs; \`test-results.json\` contains the run's job and step conclusions.

[Full workflow run](${runUrl})

### Documentation

- [GitHub Pages documentation](${docs.href}) (deployed successfully by this run).
- \`jungle-run-docs.zip\` is the version-specific TypeDoc/rustdoc snapshot.
- The live Pages site may advance with later main builds or releases.

### Downloads

| Asset | Contents |
| :--- | :--- |
| jungle-run-windows.zip | Unsigned x64 NSIS installer |
| jungle-run-macos.zip | Unsigned runner-architecture app ZIP and DMG |
| jungle-run-linux.zip | x64 DEB and AppImage |
| jungle-run-ios-simulator.zip | Unsigned ARM64 simulator app ZIP |
| jungle-run-android-debug.zip | ARM64 debug APK |

macOS binaries are not notarized. The iOS simulator app is not a physical-device
or App Store build. Android uses only the generated debug keystore and is not a
Play Store release. See the documentation for signing and installation details.
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const jobs = JSON.parse(readFileSync('release-assets/test-results.json', 'utf8')).jobs;
  const notes = releaseNotes({
    version, tag: process.env.RELEASE_TAG, jobs,
    pagesUrl: process.env.PAGES_URL, runUrl: process.env.RUN_URL
  });
  writeFileSync('release-notes.md', notes);
}
