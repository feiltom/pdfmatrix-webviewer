import { AnnotationManager, AnnotationManagerEvents } from './annotation-manager.js';
import { Annotations } from './annotations.js';
import { DocumentViewer, DocumentViewerEvents, FitMode, LayoutMode, PageRotation } from './document-viewer.js';
import { Point, Quad, Rect } from './geometry.js';
import { Interaction, ToolNames } from './interaction.js';
import { loadPdfjs } from './pdfjs.js';
import { STYLES } from './styles.js';
import { UI } from './ui.js';

export const VERSION = '__VERSION__';

const toElement = (element) => {
    if (typeof element === 'string') {
        return document.querySelector(element);
    }
    return element;
};

/**
 * Creates a viewer inside `element`, like `WebViewer(options, element)` from
 * @pdftron/webviewer. Supported options: `initialDoc`, `css` (stylesheet loaded inside the
 * viewer's shadow root), `annotationUser`, `disableLogs`, `preloadWorker`, `enableAnnotations`
 * and the `initialDoc` loading options (`filename`, `extension`, `customHeaders`,
 * `withCredentials`). `licenseKey`, `path` and the other WebViewer options are accepted and
 * ignored: the viewer is open source and loads its assets relative to its own module.
 */
async function WebViewer(options = {}, element) {
    const container = toElement(element);
    if (!container) {
        throw new Error('WebViewer: a container element is required');
    }
    const doc = container.ownerDocument || document;

    const host = doc.createElement('pdfmatrix-webviewer');
    host.style.display = 'block';
    host.setAttribute('data-pdfmatrix-webviewer', VERSION);
    container.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLES;
    root.append(style);
    if (options.css) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = options.css;
        root.append(link);
    }

    const documentViewer = new DocumentViewer(doc, { disableLogs: !!options.disableLogs });
    const annotationManager = new AnnotationManager(documentViewer);
    if (options.annotationUser) {
        annotationManager.setCurrentUser(options.annotationUser);
    }
    let ui = null;
    const interaction = new Interaction(documentViewer, annotationManager, {
        t: (key) => ui.t(key),
        hotkeysEnabled: () => ui.hotkeysEnabled,
    });
    ui = new UI({ doc, root, viewer: documentViewer, manager: annotationManager, interaction, language: options.language || doc.documentElement.lang });
    if (options.enableAnnotations === false) {
        annotationManager.enableReadOnlyMode();
    }

    documentViewer.getAnnotationManager = () => annotationManager;
    documentViewer.getTool = (name) => ({ name, getName: () => name });
    documentViewer.getToolMode = () => documentViewer.getTool(interaction.toolMode);
    documentViewer.setToolMode = (tool) => ui.setToolMode(tool?.name || tool);

    let disposed = false;
    const disposeUi = ui.dispose.bind(ui);
    const dispose = async () => {
        if (disposed) {
            return;
        }
        disposed = true;
        interaction.destroy();
        disposeUi();
        await documentViewer.dispose();
        host.remove();
    };
    ui.dispose = dispose;

    const Core = {
        documentViewer,
        annotationManager,
        Annotations,
        Math: { Rect, Point, Quad },
        PageRotation,
        DocumentViewer: { Events: DocumentViewerEvents },
        AnnotationManager: { Events: AnnotationManagerEvents },
        Tools: { ToolNames },
        getDefaultBackendType: () => Promise.resolve('ems'),
        setWorkerPath: () => { },
        setResourcesPath: () => { },
    };

    const instance = {
        UI: ui,
        Core,
        loadDocument: (src, opts) => documentViewer.loadDocument(src, opts),
        // WebViewer 7 style aliases, still used by older integrations.
        docViewer: documentViewer,
        annotManager: annotationManager,
        Annotations,
        dispose,
    };

    if (options.preloadWorker) {
        loadPdfjs().catch(() => { });
    }
    if (options.initialDoc) {
        const src = Array.isArray(options.initialDoc) ? options.initialDoc[0] : options.initialDoc;
        documentViewer.loadDocument(src, {
            filename: options.filename,
            customHeaders: options.customHeaders,
            withCredentials: options.withCredentials,
            password: options.password,
        });
    }
    return instance;
}

WebViewer.WebComponent = WebViewer;
WebViewer.Iframe = WebViewer;
WebViewer.VERSION = VERSION;

export default WebViewer;
