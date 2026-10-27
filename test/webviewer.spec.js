import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

/**
 * The setup mirrors what a host application written for @pdftron/webviewer does (options,
 * disabled elements, header customization, events), so these tests exercise the same calls.
 */
const DISABLED = [
    'ribbons', 'default-ribbon-group', 'toggleNotesButton', 'selectToolButton', 'defaultPageTransitionButton',
    'leftPanelButton', 'rotateHeader', 'rotateClockwiseButton', 'rotateCounterClockwiseButton', 'viewControlsDivider2',
    'toolbarGroup-Insert', 'toolbarGroup-Measure', 'toolbarGroup-Redact', 'toolbarGroup-Edit', 'toolbarGroup-EditText',
    'toolbarGroup-FillAndSign', 'toolbarGroup-Forms', 'notesPanelToggle',
];

const open = async (page, { annotations = false } = {}) => {
    await page.goto('/test/harness.html');
    await page.waitForFunction(() => window.harnessReady);
    await page.evaluate(async ({ disabled, annotations }) => {
        const events = [];
        window.events = events;
        const instance = await window.WebViewer({
            licenseKey: null,
            // A dependency installed from a URL gives the host app a path like this one: it must not matter.
            path: '/assets/webviewer-https://github-com/feiltom/pdfmatrix-webviewer-v10',
            css: '/test/fixtures/host-style.css?v=1',
            preloadWorker: 'pdf',
            disableLogs: true,
            annotationUser: 'Jean Test',
        }, document.getElementById('viewer'));
        window.instance = instance;
        instance.UI.hotkeys.off();
        instance.UI.disableElements(disabled);
        instance.UI.setActiveRibbonItem('toolbarGroup-View');
        instance.UI.setLanguage('fr');
        instance.UI.updateElement('downloadButton', {
            onClick: () => {
                events.push(['download']);
                instance.UI.downloadPdf({ includeAnnotations: false });
            },
        });
        if (annotations) {
            instance.UI.enableElements(['default-ribbon-group']);
        }
        const { documentViewer, annotationManager } = instance.Core;
        documentViewer.addEventListener(instance.Core.DocumentViewer.Events.DOCUMENT_LOADED, () => {
            events.push(['loaded']);
            instance.UI.setLayoutMode(instance.UI.LayoutMode.Continuous);
            instance.UI.setFitMode(instance.UI.FitMode.FitWidth);
        });
        documentViewer.addEventListener(instance.Core.DocumentViewer.Events.DOCUMENT_UNLOADED, () => events.push(['unloaded']));
        documentViewer.addEventListener(instance.Core.DocumentViewer.Events.PAGE_NUMBER_UPDATED, (n) => events.push(['page', n]));
        annotationManager.addEventListener(instance.Core.AnnotationManager.Events.ANNOTATION_CHANGED, (annots, action, opt) => {
            events.push(['annotation', action, annots.length, !!opt?.imported, opt?.source || null]);
        });
    }, { disabled: DISABLED, annotations });
};

const load = async (page, url = '/test/fixtures/multi.pdf', options = {}) => {
    await page.evaluate(async ({ url, options }) => {
        window.loadErrors = window.loadErrors || [];
        await window.instance.Core.documentViewer.loadDocument(url, {
            filename: 'doc.pdf',
            extension: 'pdf',
            documentId: 'doc-1',
            cacheKey: 'doc-1',
            withCredentials: true,
            ...options,
            onError: (error) => window.loadErrors.push(error.serverResponse.status),
        });
    }, { url, options });
};

const waitRendered = (page, pageNumber = 1) => page.waitForFunction((n) => {
    const root = document.querySelector('pdfmatrix-webviewer')?.shadowRoot;
    const canvas = root?.querySelector(`.pmw-page[data-page-number="${n}"] canvas`);
    return canvas && canvas.width > 0 && root.querySelector(`.pmw-page[data-page-number="${n}"] .textLayer`)?.childElementCount >= 0;
}, pageNumber);

/** Fraction of non-white pixels of a canvas (or of the page canvas). */
const inkRatio = (page, pageNumber = 1) => page.evaluate((n) => {
    const canvas = document.querySelector('pdfmatrix-webviewer').shadowRoot.querySelector(`.pmw-page[data-page-number="${n}"] canvas`);
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) { ink += 1; }
    }
    return ink / (data.length / 4);
}, pageNumber);

const events = (page) => page.evaluate(() => window.events);

const pageBox = async (page, n = 1) => page.locator(`.pmw-page[data-page-number="${n}"]`).boundingBox();

test('loads a document with custom headers and renders it', async ({ page }) => {
    await open(page);
    await load(page, '/secure/doc.pdf', { customHeaders: { 'X-Token': 'secret' } });
    expect(await events(page)).toContainEqual(['loaded']);
    expect(await page.evaluate(() => window.instance.Core.documentViewer.getPageCount())).toBe(3);
    await waitRendered(page);
    expect(await inkRatio(page)).toBeGreaterThan(0.001);
    await expect(page.locator('.pmw-page[data-page-number="1"] .textLayer')).toContainText('Hello PDFMatrix WebViewer');
});

test('reports HTTP failures through onError', async ({ page }) => {
    await open(page);
    await load(page, '/secure/doc.pdf');
    await load(page, '/nope.pdf');
    expect(await page.evaluate(() => window.loadErrors)).toEqual([401, 404]);
    expect(await events(page)).not.toContainEqual(['loaded']);
});

test('host stylesheet is applied inside the viewer', async ({ page }) => {
    await open(page);
    // The stylesheet is a <link>: wait for it to load.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('pdfmatrix-webviewer')).position)).toBe('absolute');
});

test('fits the width and tracks the current page', async ({ page }) => {
    await open(page);
    await load(page);
    await waitRendered(page);
    const { pageWidth, scrollWidth } = await page.evaluate(() => {
        const root = document.querySelector('pdfmatrix-webviewer').shadowRoot;
        return {
            // Page 3 (/Rotate 90) is the widest page: it sets the fit-width scale.
            pageWidth: root.querySelector('.pmw-page[data-page-number="3"]').getBoundingClientRect().width,
            scrollWidth: root.querySelector('.pmw-scroll').clientWidth,
        };
    });
    expect(Math.abs(pageWidth - (scrollWidth - 32))).toBeLessThan(2);

    await page.evaluate(() => window.instance.Core.documentViewer.setCurrentPage(3));
    expect(await page.evaluate(() => window.instance.Core.documentViewer.getCurrentPage())).toBe(3);
    expect(await events(page)).toContainEqual(['page', 3]);

    await page.evaluate(() => { window.instance.Core.documentViewer.getScrollViewElement().scrollTop = 0; });
    await expect.poll(() => page.evaluate(() => window.instance.Core.documentViewer.getCurrentPage())).toBe(1);
    await expect(page.locator('.pmw-page-nav input')).toHaveValue('1');
});

test('rotates pages and reports rotations', async ({ page }) => {
    await open(page);
    await load(page);
    const before = await pageBox(page, 1);
    const result = await page.evaluate(() => {
        const { documentViewer, PageRotation } = window.instance.Core;
        const initial = documentViewer.getPageRotations()[1];
        documentViewer.setRotation(PageRotation.E_90, 1);
        return { initial, after: documentViewer.getPageRotations()[1], info3: documentViewer.getDocument().getPageInfo(3) };
    });
    expect(result.initial).toBe(0);
    expect(result.after).toBe(1);
    // Page 3 has /Rotate 90: page coordinates are those of the displayed page.
    expect(result.info3).toEqual({ width: 792, height: 612 });
    const after = await pageBox(page, 1);
    expect(after.height / after.width).toBeCloseTo(before.width / before.height, 1);
});

test('creates the annotations a host app builds by hand', async ({ page }) => {
    await open(page);
    await load(page);
    const result = await page.evaluate(async () => {
        const { Annotations, annotationManager } = window.instance.Core;
        const polygon = new Annotations.PolygonAnnotation();
        [[100, 100], [300, 100], [300, 140], [100, 140]].forEach(([x, y]) => polygon.addPathPoint(x, y));
        polygon.PageNumber = 1;
        polygon.Color = new Annotations.Color(255, 158, 0, 1);
        polygon.FillColor = new Annotations.Color(255, 158, 0, 0.2);
        polygon.StrokeThickness = 2;
        polygon.Locked = true;
        polygon.Id = 'boundingbox';
        polygon.IsHoverable = false;
        polygon.LockedContents = true;
        polygon.ReadOnly = true;
        polygon.Listable = false;
        polygon.Printable = false;
        polygon.Width += 4;
        polygon.Height += 0.5;
        polygon.Author = null;
        annotationManager.addAnnotation(polygon, { source: 'createAnnotation' });
        annotationManager.redrawAnnotation(polygon);

        const highlight = new Annotations.TextHighlightAnnotation();
        highlight.PageNumber = 1;
        highlight.X = 72;
        highlight.Y = 50;
        highlight.Width = 200;
        highlight.Height = 30;
        highlight.StrokeColor = new Annotations.Color(138, 138, 138);
        highlight.Opacity = 0.3;
        highlight.Quads = [{ x1: 72, y1: 80, x2: 272, y2: 80, x3: 272, y3: 50, x4: 72, y4: 50 }];

        const label = new Annotations.FreeTextAnnotation();
        label.PageNumber = 1;
        label.X = 400;
        label.Y = 700;
        label.Width = 100;
        label.Height = 18;
        label.setContents('Contrôle');
        label.FontSize = '9px';
        label.TextColor = new Annotations.Color(40, 40, 40, 1);
        label.FillColor = new Annotations.Color(255, 255, 255, 0);
        label.StrokeThickness = 0;
        label.Subject = 'custom-legend';
        const box = new Annotations.RectangleAnnotation();
        box.PageNumber = 1;
        box.X = 380;
        box.Y = 700;
        box.Width = 18;
        box.Height = 18;
        box.FillColor = new Annotations.Color(138, 138, 138);
        box.Subject = 'custom-legend';
        annotationManager.addAnnotations([highlight, label, box]);
        await annotationManager.drawAnnotationsFromList([highlight, label, box]);

        const list = annotationManager.getAnnotationsList();
        const bbox = list.find((a) => a.Id === 'boundingbox');
        const legend = list.filter((a) => a.Subject === 'custom-legend');
        const xfdf = await annotationManager.exportAnnotations({ annotationList: [highlight, label] });
        annotationManager.jumpToAnnotation(bbox, { isSmoothScroll: false, verticalOffset: '10%', zoom: 1.2 });
        const zoom = window.instance.Core.documentViewer.getZoomLevel();
        annotationManager.deleteAnnotations(list.filter((a) => a.Id === 'boundingbox'), { force: true, source: 'clearBoundingBoxes' });
        return {
            count: list.length,
            bbox: { x: bbox.X, w: bbox.Width, h: bbox.Height, y: bbox.getY() },
            legendText: legend.find((a) => a instanceof Annotations.FreeTextAnnotation)?.getContents?.(),
            xfdf,
            zoom,
            remaining: annotationManager.getAnnotationsList().length,
        };
    });
    expect(result.count).toBe(4);
    expect(result.bbox).toEqual({ x: 100, w: 204, h: 40.5, y: 100 });
    expect(result.legendText).toBe('Contrôle');
    expect(result.zoom).toBeCloseTo(1.2);
    expect(result.remaining).toBe(3);
    expect(result.xfdf).toContain('<highlight page="0"');
    expect(result.xfdf).toContain('coords="72,742,272,742,72,712,272,712"');
    expect(result.xfdf).toContain('<freetext page="0"');
    expect(result.xfdf).toContain('<contents>Contrôle</contents>');
    expect(result.xfdf).toContain('font: Helvetica 9pt');
    const changes = (await events(page)).filter((e) => e[0] === 'annotation');
    expect(changes).toEqual([
        ['annotation', 'add', 1, false, 'createAnnotation'],
        ['annotation', 'add', 3, false, null],
        ['annotation', 'delete', 1, false, 'clearBoundingBoxes'],
    ]);
    await expect(page.locator('.pmw-annot-layer [data-annotation-id]')).toHaveCount(3);
});

const WEBVIEWER_XFDF = '<?xml version="1.0" encoding="UTF-8" ?><xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve"><fields /><annots>'
    + '<square page="0" rect="73.66,284.74,113.92,315.39" color="#E44234" flags="print" name="6903a59b-09f9-1960-9252-37ec1c2d0921" title="Admin Bewai" subject="Rectangle" date="D:20240515091551+02\'00\'" creationdate="D:20240515091551+02\'00\'" dashes=""/>'
    + '<ink page="0" rect="100,400,200,450" color="#2C6AFF" width="3" flags="print" name="ink-1" title="Admin Bewai" subject="Free Hand"><inklist><gesture>100,400;150,450;200,400</gesture></inklist></ink>'
    + '<text page="0" rect="500,700,520,720" color="#FFCD45" flags="print,nozoom,norotate" name="note-1" title="Admin Bewai" subject="Note" icon="Comment"><contents>Pièce à vérifier</contents></text>'
    + '<caret page="0" rect="10,10,20,20" name="caret-1"/>'
    + '</annots><pages><defmtx matrix="1,0,0,-1,0,792" /></pages></xfdf>';

test('imports WebViewer XFDF and exports untouched annotations verbatim', async ({ page }) => {
    await open(page);
    await load(page);
    const result = await page.evaluate(async (xfdf) => {
        const { annotationManager, Annotations } = window.instance.Core;
        await annotationManager.importAnnotations(xfdf);
        const list = annotationManager.getAnnotationsList();
        const square = list.find((a) => a.Id === '6903a59b-09f9-1960-9252-37ec1c2d0921');
        const exported = await annotationManager.exportAnnotations({ annotationList: list });
        const box = [square.X, square.Y, square.Width, square.Height].map((v) => Math.round(v * 100) / 100);
        square.X += 10;
        const modified = await annotationManager.exportAnnotations({ annotationList: [square] });
        return {
            count: list.length,
            isRect: square instanceof Annotations.RectangleAnnotation,
            color: square.Color.toHexString(),
            author: square.Author,
            box,
            note: list.find((a) => a.Id === 'note-1').getContents(),
            ink: list.find((a) => a.Id === 'ink-1').getPaths()[0].map((p) => [p.x, p.y]),
            exported,
            modified,
        };
    }, WEBVIEWER_XFDF);
    expect(result.count).toBe(4);
    expect(result.isRect).toBe(true);
    expect(result.color).toBe('#E44234');
    expect(result.author).toBe('Admin Bewai');
    expect(result.box).toEqual([73.66, 476.61, 40.26, 30.65]);
    expect(result.note).toBe('Pièce à vérifier');
    expect(result.ink).toEqual([[100, 392], [150, 342], [200, 392]]);
    expect(result.exported).toContain('<square page="0" rect="73.66,284.74,113.92,315.39" color="#E44234" flags="print" name="6903a59b-09f9-1960-9252-37ec1c2d0921"');
    expect(result.exported).toContain('<caret page="0" rect="10,10,20,20" name="caret-1"/>');
    expect(result.modified).toContain('rect="83.66,284.74,123.92,315.39"');
    expect(result.modified).toContain('title="Admin Bewai"');
    expect(result.modified).toContain('dashes=""');
    const changes = (await events(page)).filter((e) => e[0] === 'annotation');
    expect(changes).toEqual([['annotation', 'add', 4, true, null]]);
});

test('every annotation type survives an export/import round trip', async ({ page }) => {
    await open(page);
    await load(page);
    const result = await page.evaluate(async () => {
        const { Annotations, annotationManager } = window.instance.Core;
        const make = [];
        const rect = new Annotations.RectangleAnnotation({ PageNumber: 2 });
        rect.setRect({ x1: 10, y1: 20, x2: 110, y2: 70 });
        rect.FillColor = new Annotations.Color(0, 204, 99);
        make.push(rect);
        const ellipse = new Annotations.EllipseAnnotation({ PageNumber: 3 });
        ellipse.setRect({ x1: 30, y1: 40, x2: 90, y2: 100 });
        make.push(ellipse);
        const line = new Annotations.LineAnnotation({ PageNumber: 1 });
        line.setStartPoint(10, 10);
        line.setEndPoint(200, 120);
        line.EndStyle = 'OpenArrow';
        make.push(line);
        const poly = new Annotations.PolylineAnnotation({ PageNumber: 1 });
        [[5, 5], [50, 80], [90, 10]].forEach(([x, y]) => poly.addPathPoint(x, y));
        make.push(poly);
        const ink = new Annotations.FreeHandAnnotation({ PageNumber: 3 });
        ink.setPath([{ x: 1, y: 2 }, { x: 30, y: 40 }]);
        ink.setPath([{ x: 50, y: 60 }, { x: 70, y: 80 }], 1);
        make.push(ink);
        const under = new Annotations.TextUnderlineAnnotation({ PageNumber: 3 });
        under.Quads = [{ x1: 10, y1: 30, x2: 100, y2: 30, x3: 100, y3: 15, x4: 10, y4: 15 }];
        make.push(under);
        const note = new Annotations.StickyAnnotation({ PageNumber: 2 });
        note.X = 300;
        note.Y = 400;
        note.setContents('a & b < c');
        make.push(note);
        const text = new Annotations.FreeTextAnnotation({ PageNumber: 1 });
        text.setRect({ x1: 100, y1: 100, x2: 250, y2: 130 });
        text.setContents('Ligne 1\nLigne 2');
        text.TextColor = new Annotations.Color('#2C6AFF');
        text.FontSize = '14pt';
        text.TextAlign = 'center';
        make.push(text);
        annotationManager.addAnnotations(make);
        const xfdf = await annotationManager.exportAnnotations();
        const describe = (a) => ({
            type: a.elementName,
            page: a.PageNumber,
            box: [a.X, a.Y, a.Width, a.Height].map((v) => Math.round(v * 100) / 100),
            color: a.StrokeColor.toHexString(),
            contents: a.getContents(),
            extra: a.getPaths ? a.getPaths().length : a.getPath ? a.getPath().length : a.Quads ? a.Quads.length : a.EndStyle || a.FontSize || '',
        });
        const before = make.map(describe);
        annotationManager.deleteAnnotations(annotationManager.getAnnotationsList());
        const imported = await annotationManager.importAnnotations(xfdf);
        const freeText = imported.find((a) => a.elementName === 'freetext');
        return {
            before, after: imported.map(describe), xfdf,
            freeText: [freeText.TextColor.toHexString(), freeText.FontSize, freeText.TextAlign],
        };
    });
    if (process.env.XFDF_OUT) {
        writeFileSync(process.env.XFDF_OUT, result.xfdf);
    }
    expect(result.after).toEqual(result.before);
    expect(result.freeText).toEqual(['#2C6AFF', '14pt', 'center']);
    expect(result.xfdf).toContain('<contents>a &amp; b &lt; c</contents>');
});

test('renders a page region for OCR with loadCanvas', async ({ page }) => {
    await open(page);
    await load(page);
    const result = await page.evaluate(() => new Promise((resolve) => {
        window.instance.Core.documentViewer.getDocument().loadCanvas({
            pageNumber: 1,
            multiplier: 4,
            renderRect: { x1: 68, y1: 46, x2: 368, y2: 80 },
            drawComplete: (canvas) => {
                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let ink = 0;
                for (let i = 0; i < data.length; i += 4) { if (data[i] < 128) { ink += 1; } }
                resolve({ width: canvas.width, height: canvas.height, ink });
            },
        });
    }));
    expect(result.width).toBe(1200);
    expect(result.height).toBe(136);
    expect(result.ink).toBeGreaterThan(1000);
});

test('converts between page and window coordinates', async ({ page }) => {
    await open(page);
    await load(page);
    const result = await page.evaluate(() => {
        const { documentViewer } = window.instance.Core;
        documentViewer.setRotation(1, 2);
        const mode = documentViewer.getDisplayModeManager().getDisplayMode();
        const origin = mode.pageToWindow({ x: 0, y: 0 }, 1);
        const w = mode.pageToWindow({ x: 100, y: 200 }, 2);
        const back = mode.windowToPage(w, 2);
        const p3 = mode.pageToWindow({ x: 10, y: 10 }, 3);
        return { origin, back: [back.x, back.y].map((v) => Math.round(v * 1000) / 1000), selected: mode.getSelectedPages(origin, p3) };
    });
    expect(result.origin.y).toBe(0);
    expect(result.back).toEqual([100, 200]);
    expect(result.selected).toEqual({ first: 1, last: 3 });
});

test('header: custom and stateful buttons, disabled elements, download override', async ({ page }) => {
    await open(page);
    await load(page);
    await page.evaluate(() => {
        const { UI } = window.instance;
        const header = UI.getModularHeader('default-top-header');
        const custom = new UI.Components.CustomButton({
            dataElement: 'newWindowButton', img: 'icon-panel-thumbnail-line', title: 'Nouvelle fenêtre',
            onClick: () => window.events.push(['custom']),
        });
        const toggle = new UI.Components.StatefulButton({
            dataElement: 'fullscreen-btn',
            initialState: 'default',
            states: {
                default: { img: 'icon-header-full-screen', title: 'Plein écran', onClick: (update) => { update('fullscreen'); window.events.push(['fs', true]); } },
                fullscreen: { img: 'icon-header-full-screen-exit', title: 'Fermer', className: 'active', onClick: (update) => { update('default'); window.events.push(['fs', false]); } },
            },
        });
        header.setItems([...header.items, custom, toggle]);
    });
    await expect(page.locator('[data-element="rotateClockwiseButton"]')).toHaveCount(0);
    await expect(page.locator('[data-element="selectToolButton"]')).toHaveCount(0);
    await expect(page.locator('[data-element="toolbarGroup-View"]')).toHaveCount(0);
    await page.locator('[data-element="newWindowButton"]').click();
    await page.locator('[data-element="fullscreen-btn"]').click();
    await expect(page.locator('[data-element="fullscreen-btn"]')).toHaveClass(/active/);
    await expect(page.locator('[data-element="fullscreen-btn"]')).toHaveAttribute('title', 'Fermer');
    await page.locator('[data-element="fullscreen-btn"]').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-element="downloadButton"]').click();
    expect((await download).suggestedFilename()).toBe('doc.pdf');
    expect((await events(page)).filter((e) => ['custom', 'fs', 'download'].includes(e[0]))).toEqual([
        ['custom'], ['fs', true], ['fs', false], ['download'],
    ]);
    await expect(page.locator('[data-element="zoomInButton"]')).toHaveAttribute('title', 'Zoom avant');
});

test('draws, selects, moves and deletes a rectangle with the tools', async ({ page }) => {
    await open(page, { annotations: true });
    await load(page);
    await waitRendered(page);
    await page.locator('[data-element="toolbarGroup-Shapes"]').click();
    await page.locator('[data-element="rectangleToolGroupButton"]').click();
    const box = await pageBox(page, 1);
    await page.mouse.move(box.x + 100, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 360, { steps: 5 });
    await page.mouse.up();
    const created = await page.evaluate(() => {
        const [a] = window.instance.Core.annotationManager.getAnnotationsList();
        return a && { type: a.elementName, author: a.Author, w: a.Width, x: a.X };
    });
    expect(created.type).toBe('square');
    expect(created.author).toBe('Jean Test');
    const scale = await page.evaluate(() => window.instance.Core.documentViewer.getZoomLevel());
    expect(created.w).toBeCloseTo(100 / scale, 0);

    // Back to the edit tool, select the rectangle and move it.
    await page.locator('[data-element="rectangleToolGroupButton"]').click();
    await page.mouse.move(box.x + 150, box.y + 330);
    await page.mouse.down();
    await page.mouse.move(box.x + 190, box.y + 330, { steps: 4 });
    await page.mouse.up();
    const movedX = await page.evaluate(() => window.instance.Core.annotationManager.getAnnotationsList()[0].X);
    expect(movedX - created.x).toBeCloseTo(40 / scale, 0);

    await page.locator('[data-element="annotationDeleteButton"]').click();
    expect(await page.evaluate(() => window.instance.Core.annotationManager.getAnnotationsList().length)).toBe(0);
    const changes = (await events(page)).filter((e) => e[0] === 'annotation');
    expect(changes).toEqual([
        ['annotation', 'add', 1, false, null],
        ['annotation', 'modify', 1, false, null],
        ['annotation', 'delete', 1, false, null],
    ]);
});

test('highlights text with the highlight tool', async ({ page }) => {
    await open(page, { annotations: true });
    await load(page);
    await waitRendered(page);
    await page.locator('[data-element="toolbarGroup-Annotate"]').click();
    await page.locator('[data-element="highlightToolGroupButton"]').click();
    const scale = await page.evaluate(() => window.instance.Core.documentViewer.getZoomLevel());
    const box = await pageBox(page, 1);
    // "Hello PDFMatrix WebViewer": 24pt Helvetica, baseline at y = 792 - 720 = 72.
    await page.mouse.move(box.x + 74 * scale, box.y + 62 * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + 160 * scale, box.y + 62 * scale, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.instance.Core.annotationManager.getAnnotationsList().length)).toBe(1);
    const a = await page.evaluate(() => {
        const [h] = window.instance.Core.annotationManager.getAnnotationsList();
        return { type: h.elementName, quads: h.Quads.length, contents: h.getContents(), y: h.Y, h: h.Height };
    });
    expect(a.type).toBe('highlight');
    expect(a.quads).toBe(1);
    expect(a.contents).toMatch(/^Hello PD/);
    expect(a.y).toBeGreaterThan(45);
    expect(a.y + a.h).toBeLessThan(80);
});

test('creates free text and notes', async ({ page }) => {
    await open(page, { annotations: true });
    await load(page);
    await waitRendered(page);
    await page.locator('[data-element="toolbarGroup-Annotate"]').click();
    await page.locator('[data-element="freeTextToolGroupButton"]').click();
    const box = await pageBox(page, 1);
    await page.mouse.click(box.x + 100, box.y + 400);
    await page.locator('.pmw-freetext-editor textarea').fill('Texte libre');
    await page.mouse.click(box.x + 400, box.y + 600);
    await page.locator('[data-element="stickyToolGroupButton"]').click();
    await page.mouse.click(box.x + 300, box.y + 200);
    await page.locator('.pmw-note-editor textarea').fill('Une note');
    await page.locator('.pmw-note-editor button', { hasText: 'Enregistrer' }).click();
    const list = await page.evaluate(() => window.instance.Core.annotationManager.getAnnotationsList()
        .map((a) => [a.elementName, a.getContents()]));
    expect(list).toEqual([['freetext', 'Texte libre'], ['text', 'Une note']]);
});

test('OCR mode shows the selection helper and keeps host mouse listeners working', async ({ page }) => {
    await open(page);
    // Single-page document: the host formula adds page 1's window origin, which is 0 here.
    await load(page, '/test/fixtures/text.pdf');
    await waitRendered(page);
    await page.evaluate(() => {
        const { documentViewer } = window.instance.Core;
        const el = documentViewer.getViewerElement();
        el.classList.add('is-ocr');
        const mode = documentViewer.getDisplayModeManager().getDisplayMode();
        const start = {};
        el.addEventListener('mousedown', (e) => { start.x = e.clientX; start.y = e.clientY; });
        el.addEventListener('mouseup', (e) => {
            const rect = el.getBoundingClientRect();
            const windowPoint = mode.pageToWindow({ x: 0, y: 0 }, 1);
            const p = { x: start.x - rect.left + windowPoint.x, y: start.y - rect.top + windowPoint.y };
            const { first } = mode.getSelectedPages(p, p);
            const coords = mode.windowToPage(p, first);
            window.events.push(['ocr', first, Math.round(coords.x), Math.round(coords.y), e.clientX - start.x]);
        });
    });
    const box = await pageBox(page, 1);
    const scale = await page.evaluate(() => window.instance.Core.documentViewer.getZoomLevel());
    await page.mouse.move(box.x + 72 * scale, box.y + 50 * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + 200 * scale, box.y + 80 * scale, { steps: 4 });
    const helper = page.locator('.ui-selectable-helper');
    await expect(helper).toBeVisible();
    expect(await helper.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(255, 158, 0)');
    await page.mouse.up();
    await expect(helper).toHaveCount(0);
    const ocr = (await events(page)).find((e) => e[0] === 'ocr');
    expect(ocr[1]).toBe(1);
    expect(Math.abs(ocr[2] - 72)).toBeLessThanOrEqual(1);
    expect(Math.abs(ocr[3] - 50)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.instance.Core.annotationManager.getAnnotationsList().length)).toBe(0);
});

test('decodes JPEG 2000 images with the bundled wasm decoder', async ({ page }) => {
    await open(page);
    await load(page, '/test/fixtures/jpx.pdf');
    await waitRendered(page);
    expect(await inkRatio(page)).toBeGreaterThan(0.3);
});

test('closes, reloads and disposes cleanly', async ({ page }) => {
    await open(page);
    await load(page);
    await page.evaluate(async () => {
        const { documentViewer } = window.instance.Core;
        await documentViewer.closeDocument();
        await documentViewer.loadDocument('/test/fixtures/jpx.pdf', { filename: 'b.pdf' });
    });
    expect(await page.evaluate(() => window.instance.Core.documentViewer.getPageCount())).toBe(1);
    await page.evaluate(async () => {
        await window.instance.UI.dispose();
        await window.instance.Core.documentViewer.unmount();
    });
    await expect(page.locator('pdfmatrix-webviewer')).toHaveCount(0);
    const loads = (await events(page)).filter((e) => e[0] === 'loaded' || e[0] === 'unloaded').map((e) => e[0]);
    expect(loads).toEqual(['loaded', 'unloaded', 'loaded', 'unloaded']);
});

test('CommonJS entry returns the WebViewer function', () => {
    const require = createRequire(import.meta.url);
    const WebViewer = require('../dist/webviewer.cjs');
    expect(typeof WebViewer).toBe('function');
    expect(WebViewer.default).toBe(WebViewer);
    expect(WebViewer.WebComponent).toBe(WebViewer);
});
