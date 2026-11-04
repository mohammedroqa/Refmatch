import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const guide = (await readFile('docs/evaluation-v2.md', 'utf8')).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
await writeFile('demo/eval-method.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RefMatch — Evaluation method</title><link rel="stylesheet" href="../brand/theme.css"><link rel="stylesheet" href="eval.css"></head><body><main class="shell"><p><a href="eval.html">← Evaluation Lab</a></p><h1>Evaluation method</h1><pre style="max-height:none" tabindex="0" aria-label="Evaluation guide">' + guide + '</pre></main></body></html>');

await build({
  entryPoints: ['demo/copilot-client.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: 'demo/build/copilot.js',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

await build({ entryPoints: ['demo/weekly-copilot.js'], bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
  outfile: 'demo/build/weekly-copilot.js', minify: true, sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info' });

await build({ entryPoints: ['demo/eval-app.js'], bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], outfile: 'demo/build/eval.js', minify: true, sourcemap: false, logLevel: 'info' });
