import { expect, test } from '@playwright/test';

test('the webpack build loads the worker, wasm decoders and renders', async ({ page }) => {
    const failed = [];
    page.on('response', (r) => { if (r.status() >= 400) { failed.push(`${r.status()} ${r.url()}`); } });
    await page.goto('/');
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => window.instance.Core.documentViewer.loadDocument('/fixtures/jpx.pdf', { filename: 'jpx.pdf' }));
    await expect.poll(() => page.evaluate(() => window.loaded)).toEqual([1]);
    const ink = await page.waitForFunction(() => {
        const canvas = document.querySelector('pdfmatrix-webviewer').shadowRoot.querySelector('.pmw-page canvas');
        if (!canvas || !canvas.width) { return null; }
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) { n += 1; } }
        return n / (data.length / 4);
    });
    expect(await ink.jsonValue()).toBeGreaterThan(0.3);

    await page.evaluate(() => window.instance.Core.documentViewer.loadDocument('/fixtures/multi.pdf', { filename: 'multi.pdf' }));
    await expect.poll(() => page.evaluate(() => window.loaded)).toEqual([1, 3]);
    await expect(page.locator('.pmw-page[data-page-number="1"] .textLayer')).toContainText('Hello PDFMatrix WebViewer');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('pdfmatrix-webviewer')).position)).toBe('absolute');
    expect(failed).toEqual([]);
});
