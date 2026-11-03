import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
await import('./build-app.mjs');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const allowed = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.webp', '.ttf', '.mp4', '.wav', '.vtt']);
async function copy(path) {
  const destination = resolve(output, path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(resolve(root, path), destination);
  if (extname(path) === '.html') {
    const html = await readFile(destination, 'utf8');
    await writeFile(destination, html.replace('<html ', '<html data-deployment="static" '));
  }
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.includes('.test.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && (allowed.has(extname(path)) || entry.name.endsWith('-OFL.txt'))) await copy(relative(root, path));
  }
}
for (const path of ['index.html', 'site.css', 'site.js']) await copy(path);
for (const directory of ['demo', 'brand', 'assets', 'video']) await walk(resolve(root, directory));
// The separately published Evaluation Lab includes a prebuilt bundle whose
// build-time contract is not in this source checkout. Preserve that release.
const previousIndex = process.argv.indexOf('--previous-release');
if (previousIndex !== -1) {
  if (!process.argv[previousIndex + 1]) throw new Error('Provide the previous release directory.');
  const previous = resolve(process.argv[previousIndex + 1]);
  for (const path of ['demo/eval.html', 'demo/eval.css', 'demo/eval-app.js', 'demo/eval', 'demo/build/eval.js']) {
    await cp(resolve(previous, path), resolve(output, path), { recursive: true });
  }
  const lab = resolve(output, 'demo/eval.html');
  await writeFile(lab, (await readFile(lab, 'utf8'))
    .replace('<pre id="case-input"', '<pre tabindex="0" aria-label="Case input" id="case-input"')
    .replace('<div class="table-scroll">', '<div class="table-scroll" tabindex="0" role="region" aria-label="Evaluation attempts">'));
  for (const [path, anchor, link] of [
    ['index.html', '<div class="hero-actions">', '<a class="rm-button rm-button--secondary" href="demo/eval.html">Explore the Evaluation Lab ↗</a>'],
    ['demo/index.html', '<nav>', '<a href="eval.html">Evaluation Lab</a>'],
  ]) {
    const destination = resolve(output, path);
    await writeFile(destination, (await readFile(destination, 'utf8')).replace(anchor, anchor + link));
  }
}
await writeFile(resolve(output, '.nojekyll'), '');
const manifest = [];
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await inventory(path);
    else { const bytes = await readFile(path); manifest.push({ path: relative(output, path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
  }
}
await inventory(output);
await writeFile(resolve(output, 'release-manifest.json'), JSON.stringify({ version: '2.0.0', builtAt: new Date().toISOString(), files: manifest.sort((a,b) => a.path.localeCompare(b.path)) }, null, 2));
console.log(`Packaged ${manifest.length} static files in ${output}`);
