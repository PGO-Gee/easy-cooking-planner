const { chromium } = require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const contents = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(contents);
  } catch {
    res.writeHead(404).end();
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ hasTouch: true, serviceWorkers: 'block' });
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.documentElement.classList.contains('design'));
    for (const [width, height, visibleHeight] of [[320, 568, 250], [390, 844, 420], [844, 390, 190], [1440, 900, 900]]) {
      await page.setViewportSize({ width, height });
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.evaluate(() => openRecipeCreation());
        await page.waitForFunction(dark => (getComputedStyle($('#recipe-import-dialog')).backgroundColor === 'rgb(28, 36, 46)') === dark, colorScheme === 'dark');
        await page.locator('#recipe-import-text-choice').click();
        const field = page.getByRole('textbox', { name: 'Rezepttext einfügen' });
        const analyze = page.locator('#recipe-import-analyze');
        assert(await field.evaluate(el => el === document.activeElement));
        assert.equal(await page.locator('#recipe-import-input .screenshot-import').isVisible(), false);
        assert(await analyze.isDisabled());
        await field.fill('Reispfanne\nZutaten\n250 g Reis\nZubereitung\nReis kochen.');
        const layout = await page.evaluate(visibleHeight => {
          Object.defineProperty(visualViewport, 'height', { configurable: true, value: visibleHeight });
          syncVisualViewport();
          const dialog = $('#recipe-import-dialog');
          const field = $('#recipe-import-text');
          const dialogRect = dialog.getBoundingClientRect();
          const fieldRect = field.getBoundingClientRect();
          const actionRects = [...dialog.querySelectorAll('button:enabled')].map(button => button.getBoundingClientRect())
            .filter(rect => rect.height);
          return {
            keyboard: document.documentElement.classList.contains('dish-keyboard-open'),
            fits: dialog.scrollWidth <= dialog.clientWidth && dialogRect.bottom <= visibleHeight,
            fieldHeight: fieldRect.height,
            fontSize: parseFloat(getComputedStyle(field).fontSize),
            actionsFit: actionRects.every(rect => rect.height >= 44 && rect.bottom <= dialogRect.bottom),
            overlapsField: $('#recipe-import-analyze').getBoundingClientRect().top < fieldRect.bottom
          };
        }, visibleHeight);
        const label = `${width}×${height} ${colorScheme}: ${JSON.stringify(layout)}`;
        assert.equal(layout.keyboard, visibleHeight < height, label);
        assert(layout.fits && layout.fieldHeight >= 64 && layout.fontSize >= 16, label);
        assert(layout.actionsFit && !layout.overlapsField, label);
        if (visibleHeight < height) await analyze.tap();
        else await analyze.click();
        await page.evaluate(() => { delete visualViewport.height; syncVisualViewport(); });
        assert.equal(await page.locator('#dish-recipe-title').inputValue(), 'Reispfanne');
        await page.evaluate(() => $('#dish-dialog').close());
      }
    }
    await page.evaluate(() => openRecipeCreation());
    await page.locator('#recipe-import-screenshot-choice').click();
    assert(await page.locator('#recipe-import-input input[type=file]').isVisible());
    await page.locator('#recipe-import-back').click();
    await page.locator('#recipe-import-text-choice').click();
    assert.equal(await page.locator('#recipe-import-input input[type=file]').isVisible(), false);
    console.log('Text import passed at four viewport sizes in light and dark, including tapping Analyze with the simulated keyboard open and switching from screenshot import.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
