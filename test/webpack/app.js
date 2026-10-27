// A host application written for @pdftron/webviewer, bundled by webpack like a production app.
import WebViewer from '@pdftron/webviewer';

/* global PDFTRON_VERSION */
WebViewer({
    licenseKey: null,
    path: `/assets/webviewer-${PDFTRON_VERSION}`,
    css: `/assets/webviewer/style.css?v=${PDFTRON_VERSION}`,
    preloadWorker: 'pdf',
    disableLogs: true,
    annotationUser: 'Jean Test',
}, document.getElementById('viewer')).then((instance) => {
    window.instance = instance;
    window.loaded = [];
    instance.UI.hotkeys.off();
    instance.UI.setLanguage('fr');
    const { documentViewer } = instance.Core;
    documentViewer.addEventListener(instance.Core.DocumentViewer.Events.DOCUMENT_LOADED, () => {
        window.loaded.push(documentViewer.getPageCount());
        instance.UI.setFitMode(instance.UI.FitMode.FitWidth);
    });
    window.ready = true;
});
