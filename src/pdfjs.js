import { assetTable, workerUrl } from './generated/assets.js';

/**
 * Lazy pdf.js loader. pdf.js and its worker, CMaps, standard fonts and wasm decoders ship in
 * `dist/pdfjs/` and are addressed with `new URL(..., import.meta.url)`, so bundlers (webpack 5,
 * Vite, esbuild) emit them next to the app without any copy step, and the viewer never depends
 * on the `path` option.
 */

let pdfjsPromise = null;
let table = null;

const assets = () => {
    if (!table) {
        table = assetTable();
    }
    return table;
};

export const loadPdfjs = () => {
    if (!pdfjsPromise) {
        pdfjsPromise = import('./pdfjs/pdf.min.mjs').then((lib) => {
            lib.GlobalWorkerOptions.workerSrc = workerUrl();
            return lib;
        });
        pdfjsPromise.catch(() => {
            pdfjsPromise = null;
        });
    }
    return pdfjsPromise;
};

/** Serves the binary files pdf.js asks for from the bundled asset table. */
export class BundledBinaryDataFactory {
    async fetch({ kind, filename }) {
        const url = assets()[kind]?.[filename];
        if (!url) {
            throw new Error(`Unknown ${kind} file: ${filename}`);
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Unable to load ${url}: HTTP ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    }
}

/**
 * Directory of the wasm files, used by pdf.js for the ICC color management module which it loads
 * by URL. Only available when the bundler kept the file names (otherwise ICC profiles fall back
 * to their alternate color space, which is what most viewers do anyway).
 */
export const wasmDirectory = () => {
    const url = assets().wasmUrl?.['qcms_bg.wasm'];
    return url && /\/qcms_bg\.wasm(\?.*)?$/.test(url) ? url.replace(/qcms_bg\.wasm(\?.*)?$/, '') : undefined;
};

export const documentOptions = () => ({
    BinaryDataFactory: BundledBinaryDataFactory,
    useWorkerFetch: false,
    wasmUrl: wasmDirectory(),
    isEvalSupported: false,
    enableXfa: false,
});
