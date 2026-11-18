const { chromium, webkit } = require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const userId = 'trial-browser-fixture';
const source = ['Testcurry', '2 Portionen', 'Zutaten', '200 g Kichererbsen', 'Zubereitung', 'Alles garen.'].join('\n');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
let serverOffline = false;
const server = http.createServer((req, res) => {
  if (serverOffline) { res.writeHead(503); res.end(); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? 'Not found' : bytes);
  });
});

async function openFixture(page) {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.documentElement.classList.contains('design'));
  await page.evaluate(async userId => {
    await ensureAuthentication();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    currentUserId = userId;
    currentHouseholdId = '';
    appInitialized = true;
    offlineMode = true;
    cloudReady = false;
    await initializeOfflineData();
    state = {
      ...emptyState(),
      dishes: [
        { id: 'soup', name: 'Suppe', type: 'meal', ingredients: [], recipe: { servings: 2 } },
        { id: 'cake', name: 'Kuchen', type: 'baking', ingredients: [] }
      ],
      planningSettings: { configured: true, adults: 3, children: 0 }
    };
    $('#startup-gate').hidden = true;
    $('#auth-gate').hidden = true;
    $('.app-shell').hidden = false;
    setView('week');
    await renderCalendar();
  }, userId);
}

async function editorLayout(page, width, height, theme) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.evaluate(() => { themeOverride = null; applyTheme(); chooseDish(0); });
  for (const id of ['#choose-random-dish', '#choose-trial-dish']) {
    const rect = await page.locator(id).boundingBox();
    assert(rect && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= width + 1);
  }
  await page.locator('#choose-trial-dish').click();
  await page.locator('#dish-recipe-title').fill('Layoutprobe');
  await page.locator('.trial-source-editor summary').click();
  await page.locator('#trial-recipe-source').focus();
  const metrics = await page.evaluate(async () => {
    const field = $('#trial-recipe-source'), dialog = $('#dish-dialog');
    const keyboardHeight = innerHeight === 390 ? 210 : 300;
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: keyboardHeight });
    syncVisualViewport();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const fieldRect = field.getBoundingClientRect(), dialogRect = dialog.getBoundingClientRect();
    const result = {
      width: document.documentElement.scrollWidth, fontSize: parseFloat(getComputedStyle(field).fontSize),
      fieldTop: fieldRect.top, fieldBottom: fieldRect.bottom, dialogTop: dialogRect.top, dialogBottom: dialogRect.bottom,
      scrollable: dialog.scrollHeight > dialog.clientHeight, keyboardHeight,
      keyboard: document.documentElement.classList.contains('dish-keyboard-open')
    };
    delete visualViewport.height;
    syncVisualViewport();
    return result;
  });
  assert(metrics.width <= width + 1 && metrics.fontSize >= 16, JSON.stringify(metrics));
  assert(metrics.keyboard && metrics.scrollable && metrics.dialogBottom <= metrics.keyboardHeight + 1, JSON.stringify(metrics));
  assert(metrics.fieldTop < metrics.dialogBottom && metrics.fieldBottom > metrics.dialogTop, JSON.stringify(metrics));
  await page.locator('#dish-form [type="submit"]').click();
  await page.locator('#dish-dialog').waitFor({ state: 'hidden' });
  await page.locator('#toast .toast-action').click();
  assert.equal(await page.evaluate(() => state.dishes.length), 2);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.WOCHENTISCH_BROWSER_ENGINE || 'chromium';
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    await context.route('https://**/*', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openFixture(page);

    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
      for (const theme of ['light', 'dark']) await editorLayout(page, width, height, theme);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const collection = await page.evaluate(() => {
      const recipes = state.dishes;
      state.dishes = [];
      chooseDish(0);
      return recipes;
    });
    assert(await page.locator('#choose-random-dish').isDisabled());
    assert.match(await page.locator('#choose-random-hint').textContent(), /noch keine Kochgerichte/);
    assert(await page.locator('#choose-trial-dish').isEnabled());
    await page.locator('#close-chooser').click();
    await page.evaluate(recipes => { state.dishes = recipes; }, collection);
    await page.evaluate(() => { weekOffset = -1; chooseDish(0); });
    await page.locator('#choose-dish-search').fill('Kuchen');
    await page.locator('#choose-search-done').click();
    await page.locator('#choose-random-dish').click();
    assert.deepEqual(await page.evaluate(() => planForDate(rangeDates()[0])), ['soup']);
    assert.equal(await page.evaluate(() => plannedServingsForMeal($('#calendar .meal-card'))), 3);
    await page.evaluate(() => chooseDish(0));
    assert(await page.locator('#choose-random-dish').isDisabled());
    assert.match(await page.locator('#choose-random-hint').textContent(), /bereits eingeplant/);

    await page.locator('#choose-trial-dish').click();
    await page.locator('.trial-source-editor summary').click();
    await page.locator('#trial-recipe-source').fill(source);
    await page.locator('.trial-source-editor button').click();
    assert.equal(await page.locator('#dish-recipe-title').inputValue(), 'Testcurry');
    await page.locator('#recipe-ingredient-rows [data-recipe-field="amount"]').first().fill('250');
    await page.locator('#dish-form [type="submit"]').click();
    await page.locator('#dish-dialog').waitFor({ state: 'hidden' });
    const original = await page.evaluate(() => state.dishes.find(dish => dish.isTrial));
    assert.equal(original.trialSource, source);
    assert.equal(original.recipe.ingredients[0].amount, 250);
    await page.evaluate(async () => {
      await offlineStoreWriteQueue;
      localStorage.setItem(offlineSessionStorageKey, currentUserId);
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    if (engine === 'webkit') {
      // Windows WebKit's network emulation rejects navigation even with a
      // controlling service worker. Make the origin unavailable instead.
      serverOffline = true;
      await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { value: false }));
    } else {
      await context.setOffline(true);
    }
    await page.reload();
    await page.waitForFunction(() => !navigator.onLine && appInitialized && offlineMode);
    await page.evaluate(async () => { weekOffset = -1; await renderCalendar(); });
    assert.deepEqual(await page.evaluate(() => state.dishes.find(dish => dish.isTrial)), original);
    await page.evaluate(() => setView('dishes'));
    assert(!await page.getByRole('button', { name: 'Testcurry bearbeiten' }).isVisible());
    await page.evaluate(() => setView('shopping'));
    const ingredient = page.locator('#shopping-open .shopping-tile[data-name="Kichererbsen"]');
    await ingredient.waitFor();
    await page.evaluate(() => setView('week'));

    const card = page.getByRole('button', { name: 'Testcurry öffnen, Probegericht' });
    await card.click();
    await page.locator('#cooking-entry-dialog').getByRole('button', { name: 'Rezept ansehen' }).click();
    await page.getByText('Originaltext ansehen').click();
    assert.match(await page.locator('.recipe-import-source pre:visible').textContent(), /200 g Kichererbsen/);
    await page.getByText('Zubereitung ansehen', { exact: true }).click();
    assert(await page.getByText('Alles garen.', { exact: true }).isVisible());
    await page.locator('.recipe-back').click();
    await card.click();
    await page.locator('#cooking-entry-dialog').getByRole('button', { name: 'Gericht entfernen' }).click();
    assert(!await page.evaluate(id => state.dishes.some(dish => dish.id === id), original.id));
    await page.locator('#toast .toast-action').click();
    await card.click();
    await page.locator('#cooking-entry-dialog').getByRole('button', { name: 'In meine Gerichte übernehmen' }).click();
    await page.locator('#dish-recipe-title').fill('Suppe');
    await page.locator('#dish-form [type="submit"]').click();
    assert.match(await page.locator('#dish-form-error').textContent(), /existiert bereits/);
    await page.locator('#dish-recipe-title').fill('Testcurry');
    await page.locator('#dish-form [type="submit"]').click();
    await page.locator('#dish-dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(id => state.dishes.find(dish => dish.id === id), original.id), { ...original, isTrial: false });
    assert(await page.evaluate(id => planForDate(rangeDates()[0]).includes(id), original.id));

    await page.evaluate(() => { weekOffset = 0; chooseDish(1); });
    await page.locator('#choose-trial-dish').click();
    await page.locator('#dish-recipe-title').fill('Versuch ohne Anleitung');
    await page.locator('.trial-source-editor summary').click();
    await page.locator('#trial-recipe-source').fill('Erster Versuch.');
    await page.locator('.trial-source-editor button').click();
    assert.match(await page.locator('.trial-source-editor [role="status"]').textContent(), /erkannt/);
    await page.locator('#dish-form [type="submit"]').click();
    assert.equal(await page.evaluate(() => state.dishes.find(dish => dish.isTrial)?.trialSource), 'Erster Versuch.');

    await page.evaluate(() => {
      const model = window.WochentischCookingPlan;
      state = model.add(state, 'soup', keyFor(rangeDates()[2]), 3, 2, 'linked-rest-test');
      chooseDish(3);
    });
    await page.locator('#choose-random-dish').click();
    assert.match(await page.locator('#choose-random-hint').textContent(), /Restetag/);
    await page.locator('#choose-trial-dish').click();
    await page.locator('#dish-recipe-title').fill('Entwurf bleibt');
    await page.locator('#dish-form [type="submit"]').click();
    assert.match(await page.locator('#dish-form-error').textContent(), /Restetag/);
    assert.equal(await page.locator('#dish-recipe-title').inputValue(), 'Entwurf bleibt');
    assert(!await page.evaluate(() => state.dishes.some(dish => dish.name === 'Entwurf bleibt')));
    assert.deepEqual(errors, []);
    console.log(`${engine}: 8 layout/theme cases, simulated keyboard, random planning, trial edits, import fallback, offline restart, shopping, promotion, undo and rest collision passed.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
