// Packs the library, installs the tarball as `@pdftron/webviewer` in a throwaway app and builds it
// with a webpack configuration modeled on a real host application.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, 'out');
const require = createRequire(import.meta.url);
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'node_modules', '@pdftron', 'webviewer'), { recursive: true });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
execFileSync('npm', ['pack', '--pack-destination', out, '--silent'], { cwd: root, stdio: 'inherit' });
const tarball = join(out, `feiltom-pdfmatrix-webviewer-${pkg.version}.tgz`);
execFileSync('tar', ['xzf', tarball, '-C', join(out, 'node_modules', '@pdftron', 'webviewer'), '--strip-components=1']);

// The host computes its asset folder from the dependency spec; with a release URL it contains
// slashes and colons, which the viewer must not depend on.
const dependency = `https://github.com/feiltom/pdfmatrix-webviewer/releases/download/v${pkg.version}/feiltom-pdfmatrix-webviewer-${pkg.version}.tgz`;
const pdftronVersion = `${dependency.replace(/\./ig, '-')}-v10`;

const config = {
    mode: 'production',
    context: out,
    entry: join(here, 'app.js'),
    output: { path: join(out, 'dist'), filename: '[name].bundle.js', publicPath: '/', assetModuleFilename: '[path][name][ext]' },
    resolve: { modules: [join(out, 'node_modules'), join(root, 'node_modules')] },
    plugins: [
        new webpack.DefinePlugin({ PDFTRON_VERSION: JSON.stringify(pdftronVersion) }),
        new CopyPlugin({ patterns: [{ from: join(out, 'node_modules', '@pdftron', 'webviewer', 'public'), to: `assets/webviewer-${pdftronVersion}` }] }),
    ],
    optimization: { minimizer: [new TerserPlugin()] },
    performance: { hints: false },
};

const stats = await new Promise((resolve, reject) => {
    webpack(config, (error, result) => (error ? reject(error) : resolve(result)));
});
if (stats.hasErrors()) {
    console.error(stats.toString('errors-only'));
    process.exit(1);
}
const warnings = stats.toJson({ all: false, warnings: true }).warnings;
for (const w of warnings) {
    console.warn('webpack warning:', w.message.split('\n')[0]);
}

cpSync(join(root, 'test', 'fixtures'), join(out, 'dist', 'fixtures'), { recursive: true });
mkdirSync(join(out, 'dist', 'assets', 'webviewer'), { recursive: true });
cpSync(join(root, 'test', 'fixtures', 'host-style.css'), join(out, 'dist', 'assets', 'webviewer', 'style.css'));
writeFileSync(join(out, 'dist', 'index.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>webpack host</title>
<style>html,body{margin:0;height:100%}#viewer{position:relative;width:900px;height:800px}</style></head>
<body><div id="viewer"></div><script src="/main.bundle.js"></script></body></html>`);
console.log(`webpack host built in ${join(out, 'dist')} (${warnings.length} warnings)`);
