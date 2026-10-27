# PDFMatrix WebViewer

Open-source, drop-in replacement for the part of [`@pdftron/webviewer`](https://www.npmjs.com/package/@pdftron/webviewer)
that browser applications typically use: a PDF viewer with a customizable header, page rotation,
annotations exchanged as XFDF, and the `Core` objects (document viewer, annotation manager,
annotation classes, coordinate conversions, page rendering to canvas).

It is built on [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and is the browser
counterpart of [PDFMatrix](https://github.com/feiltom/PDFMatrix), which replaces
`@pdftron/pdfnet-node` on the server. No license key, no server component.

## Installation

Keep the dependency name your code imports and point it to a release tarball. No registry
token is needed:

```json
"dependencies": {
  "@pdftron/webviewer": "https://github.com/feiltom/pdfmatrix-webviewer/releases/download/v0.1.0/feiltom-pdfmatrix-webviewer-0.1.0.tgz"
}
```

The package is also published to GitHub Packages as `@feiltom/pdfmatrix-webviewer`.

Application code stays unchanged:

```js
import WebViewer from '@pdftron/webviewer';

const instance = await WebViewer({ css: '/assets/webviewer/style.css', annotationUser: 'Jane' }, element);
const { documentViewer, annotationManager, Annotations } = instance.Core;
await documentViewer.loadDocument(url, { customHeaders, withCredentials: true, onError });
```

### Assets

pdf.js, its worker, CMaps, standard fonts and wasm image decoders ship in `dist/pdfjs/` and are
referenced with `new URL(..., import.meta.url)`. Bundlers such as webpack 5, Vite or esbuild emit
them with the application, so the WebViewer `path` option is ignored and nothing has to be copied.
The package still contains a `public/` folder because build configurations written for WebViewer
copy `node_modules/@pdftron/webviewer/public`.

These files add about 4 MB to the build output, mostly CMaps that are only fetched for documents
that need them. If a service worker precaches the whole build (Workbox `InjectManifest`), exclude
`pdfjs/cmaps/` and `pdfjs/standard_fonts/` from the precache manifest.

## Supported API

`WebViewer(options, element)` returns `{ UI, Core }` and renders the viewer in a shadow root inside
`element`. The `css` option loads a stylesheet into that shadow root, and `:host` rules apply.

**Options:** `css`, `annotationUser`, `disableLogs`, `preloadWorker`, `initialDoc`, `enableAnnotations`.
`licenseKey`, `path` and other options are accepted and ignored.

**`UI`:**
- **Header and elements:** `hotkeys.off()/on()`, `disableElements`, `enableElements`, `updateElement`
  (for example to override `downloadButton`'s `onClick`), `setActiveRibbonItem`, and
  `getModularHeader('default-top-header')` with `items`/`setItems`.
- **Components:** `CustomButton`, `StatefulButton`, `ToolButton`, `GroupedItems` and `Divider`.
  The `img` icon names used by WebViewer apps (`icon-header-full-screen`…) are mapped to built-in icons.
- **View:** `setLanguage` (`fr`, `en`), `setLayoutMode`, `setFitMode` (`FitWidth`, `FitPage`, `Zoom`),
  `setZoomLevel`, `setToolMode`.
- **Document:** `loadDocument`, `downloadPdf` and `dispose`.

**`Core.documentViewer`:**
- **Loading:** `loadDocument(url | Blob | ArrayBuffer, { customHeaders, withCredentials, filename,
  password, onError })`, where `onError` receives `error.serverResponse.status`, and `closeDocument`.
- **Pages:** `getPageCount`, `getCurrentPage`, `setCurrentPage`, `zoomTo`/`getZoomLevel`.
- **Rotation:** `setRotation(rotation, pageNumber)`, `getPageRotations`, `rotateClockwise`/`rotateCounterClockwise`.
- **Elements and events:** `getViewerElement`, `getScrollViewElement`, `addEventListener`/`trigger`
  (custom events included), `unmount`.
- **`getDocument()`:** `getPageInfo`, `getFileData`, `loadPageText`, and `loadCanvas({ pageNumber,
  multiplier, renderRect, drawComplete })` to render a page region, for example for OCR.
- **`getDisplayModeManager().getDisplayMode()`:** `pageToWindow`, `windowToPage`, `getSelectedPages`.
- **Events:** `documentLoaded`, `documentUnloaded`, `pageNumberUpdated`, `zoomUpdated`, `rotationUpdated`.

**`Core.annotationManager`:**
- **Store:** `getAnnotationsList`, `addAnnotation(s)`, `deleteAnnotation(s)` (with `{ source }`),
  `redrawAnnotation`, `drawAnnotationsFromList`, `jumpToAnnotation`.
- **XFDF:** `importAnnotations(xfdf)`, `exportAnnotations({ annotationList })`.
- **Selection:** `selectAnnotation`, `deselectAllAnnotations`, `getSelectedAnnotations`; `setCurrentUser`.
- **Events:** `annotationChanged(annotations, action, { imported, source })` and `annotationSelected`.

**`Core.Annotations`:**
- **Shapes:** `RectangleAnnotation`, `EllipseAnnotation`, `LineAnnotation`/`ArrowAnnotation`,
  `PolygonAnnotation`, `PolylineAnnotation`, `FreeHandAnnotation`.
- **Text and notes:** `FreeTextAnnotation`, `StickyAnnotation`, `StampAnnotation`.
- **Text markup:** `TextHighlightAnnotation`, `TextUnderlineAnnotation`, `TextStrikeoutAnnotation`,
  `TextSquigglyAnnotation`.
- **`Color`.**
- Other classes: `Core.Math` (`Rect`, `Point`, `Quad`), `Core.PageRotation`, `DocumentViewer.Events`,
  `AnnotationManager.Events`, `Tools.ToolNames`.

### Annotations and XFDF

The UI offers the *View*, *Annotate* (highlight, underline, strikeout, squiggly, free hand, free
text, note) and *Shapes* (rectangle, ellipse, line, arrow, polygon, polyline) ribbons when
`default-ribbon-group` is enabled. Annotations can be selected, moved, resized, recolored, edited
and deleted.

The XFDF follows WebViewer's dialect: PDF user space coordinates, a 0-based `page`, and Acrobat
quad order. It is what PDFMatrix's `PDFDoc.mergeXFDFString` reads on the server. Imported
annotations that are not modified are exported verbatim, including element types the viewer does
not draw (carets, links…), so stored XFDF does not lose information.

## Limitations

- Continuous single-column layout only. The facing and single-page modes fall back to it.
- No thumbnails, outline, search or notes panels; no comment replies; no undo/redo.
- `downloadPdf` downloads the original file and does not flatten annotations into it, and
  `print` downloads too. The host application keeps annotations as XFDF; merge them server-side
  (PDFMatrix `mergeXFDFString`) to produce an annotated PDF.
- PDF only (no Office or image documents), no form filling, redaction, measurement, page
  manipulation or digital signatures in the viewer.
- Annotations already embedded in a PDF are rendered as part of the page, not as editable objects.
- Text markup tools locate characters from pdf.js text content using proportional widths, which
  is close but not exact for every font.

## Development

Everything runs in podman (`Containerfile`, Playwright image with Node.js and browsers):

```sh
make install       # image + npm ci
make test          # build + browser tests (Chromium, Firefox, WebKit)
make test-webpack  # packs the library and builds a webpack host app with it, then tests it
make pack          # npm pack
```

`npm run fixtures` regenerates the PDF fixtures in `test/fixtures/`.

## License

Apache-2.0. pdf.js and its bundled resources are Apache-2.0 (see `dist/pdfjs/LICENSE`, and the
license files next to the fonts and wasm decoders).
