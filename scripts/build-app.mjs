import { build } from 'esbuild';

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
