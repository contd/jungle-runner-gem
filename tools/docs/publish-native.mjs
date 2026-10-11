/**
 * Assemble and verify the TypeDoc/rustdoc GitHub Pages artifact.
 * Paths are anchored to this module, not the caller's current directory.
 */
import { cp, readFile, readdir, access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

/** Repository root relative to the isolated documentation toolchain. */
const root = fileURLToPath(new URL('../../', import.meta.url));
/** TypeDoc owns this output directory and clears it at the start of each build. */
const docs = path.join(root, 'docs');

await cp(path.join(root, 'src-tauri/target/doc'), path.join(docs, 'native'), {
  recursive: true
});
await cp(new URL('./native-index.html', import.meta.url), path.join(docs, 'native/index.html'));

/** Discover every TypeScript/TSX module that must appear in the published reference. */
async function sourceModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const modules = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceModules(filename);
    return /\.(ts|tsx)$/.test(entry.name)
      ? [path.relative(root, filename).replaceAll(path.sep, '/')]
      : [];
  }));
  return modules.flat();
}

/** Enumerate generated HTML files, including rustdoc source/item pages. */
async function htmlPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlPages(filename);
    return entry.name.endsWith('.html') ? [filename] : [];
  }));
  return pages.flat();
}

/** Reflection data makes module coverage testable without depending on HTML styling. */
const reflection = JSON.parse(await readFile(path.join(docs, 'api.json'), 'utf8'));
for (const module of reflection.children) {
  assert(module.comment?.summary?.length, `Missing module-level documentation: ${module.name}`);
}
const generatedModules = new Set(reflection.children.flatMap((module) =>
  (module.sources ?? []).map((source) => source.fileName)
));
const expectedModules = (await Promise.all(['src', 'tests'].map((dir) =>
  sourceModules(path.join(root, dir))
))).flat();
for (const module of expectedModules) {
  assert(generatedModules.has(module), `Missing TypeDoc source module: ${module}`);
}

for (const filename of [
  'index.html',
  '.nojekyll',
  'native/jungle_run_lib/index.html',
  'native/jungle_run_lib/fn.run.html',
  'native/jungle_run/index.html',
  'native/jungle_run/fn.main.html'
]) {
  await access(path.join(docs, filename));
}

/** TypeDoc custom navigation URLs are literal; rebase native links on nested API pages. */
const pages = await htmlPages(docs);
for (const filename of pages) {
  const html = await readFile(filename, 'utf8');
  const relativeRoot = path.relative(path.dirname(filename), docs).replaceAll(path.sep, '/');
  const updated = html.replaceAll('href="./native/', `href="${relativeRoot || '.'}/native/`);
  if (updated !== html) {
    await writeFile(filename, updated);
  }

  /** Inline rustdoc scripts contain URL templates, not literal HTML resource links. */
  const markup = updated.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
  for (const match of markup.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const link = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(link)) continue;
    assert(!link.startsWith('/'), `Domain-root URL breaks repository Pages hosting: ${link} in ${filename}`);
    const pathname = decodeURIComponent(link.split(/[?#]/)[0]);
    if (!pathname) continue;
    const target = path.resolve(path.dirname(filename), pathname);
    assert(
      target === docs || target.startsWith(`${docs}${path.sep}`),
      `Link escapes the published site: ${link} in ${filename}`
    );
    await access(target).catch((error) => {
      throw new Error(`Broken documentation link "${link}" in ${path.relative(docs, filename)}`, { cause: error });
    });
  }
}

console.log(`Verified ${expectedModules.length} TypeScript/test modules, both native entry points, and local links in ${pages.length} HTML pages.`);
