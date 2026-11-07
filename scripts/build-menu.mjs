import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const common = { absWorkingDir: root, bundle: true, minify: true, treeShaking: true, target: 'es2022', write: false, sourcemap: false, legalComments: 'none', logLevel: 'warning' };
const javascript = await build({
  ...common,
  stdin: { contents: "import './menu.js';\nawait new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));\nawait import('./mobile.js');", resolveDir: resolve(root, 'public'), sourcefile: 'menu-entry-source.js', loader: 'js' },
  outfile: 'public/menu-entry.js', format: 'esm', platform: 'browser', splitting: false,
  plugins: [{ name: 'keep-editor-lazy', setup(context) {
    context.onResolve({ filter: /(?:^|\/)studio-inline\.js$/ }, () => ({ path: '/studio-inline.js', external: true }));
  } }],
});
const cssFiles = ['styles.css', 'design.css', 'tenant-studio.css', 'menu-next.css', 'customer-worlds.css', 'icons.css'];
const stylesheet = await build({
  ...common,
  stdin: { contents: cssFiles.map(file => `@import './${file}';`).join('\n'), resolveDir: resolve(root, 'public'), sourcefile: 'menu-entry-source.css', loader: 'css' },
  outfile: 'public/menu-entry.css',
  plugins: [{ name: 'public-css-paths', setup(context) {
    context.onResolve({ filter: /.*/ }, args => {
      if (args.kind === 'url-token') return { path: args.path, external: true };
      if (args.kind === 'import-rule' && args.path.startsWith('/')) return { path: resolve(root, 'public', args.path.slice(1)) };
      return undefined;
    });
  } }],
});

let stale = false;
for (const output of [...javascript.outputFiles, ...stylesheet.outputFiles]) {
  if (check) {
    const current = await readFile(output.path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!current?.equals(Buffer.from(output.contents))) {
      console.error(`Stale menu asset: ${output.path.endsWith('.css') ? 'public/menu-entry.css' : 'public/menu-entry.js'}; run npm run build:menu`);
      stale = true;
    }
  } else {
    await writeFile(output.path, output.contents);
    console.log(`Built public/menu-entry.${output.path.endsWith('.css') ? 'css' : 'js'} (${output.contents.length} bytes)`);
  }
}
if (stale) process.exitCode = 1;
