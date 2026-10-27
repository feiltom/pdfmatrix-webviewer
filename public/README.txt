@feiltom/pdfmatrix-webviewer does not need static assets copied from this folder: pdf.js, its
worker, CMaps, fonts and wasm decoders are loaded relative to dist/webviewer.js and emitted by the
bundler. The folder exists because applications built for @pdftron/webviewer copy
node_modules/@pdftron/webviewer/public into their build output.
