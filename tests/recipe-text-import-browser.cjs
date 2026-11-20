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

async function checkEditorStyle(editor, layout, findings) {
  const style = await editor.evaluate(dialog => {
    const element = selector => dialog.querySelector(selector);
    const rect = selector => element(selector).getBoundingClientRect();
    const fieldStyle = selector => {
      const css = getComputedStyle(element(selector));
      return [css.backgroundColor, css.borderTopWidth, css.borderTopColor, css.borderTopLeftRadius].join(' / ');
    };
    const title = rect('#dialog-title'), close = rect('#close-dish-dialog');
    const name = rect('[data-recipe-field="name"]'), amount = rect('[data-recipe-field="amount"]');
    const unit = rect('.recipe-ingredient-unit'), unitText = element('.recipe-ingredient-unit-label');
    const toggle = rect('.recipe-ingredient-note-toggle'), remove = rect('.recipe-ingredient-row .recipe-row-remove');
    const row = rect('.recipe-ingredient-row');
    const category = element('#dish-ingredient'), help = element('.main-ingredient-hint');
    return {
      unitWidth: unit.width,
      unitSameRow: Math.abs(unit.top + unit.height / 2 - amount.top - amount.height / 2) <= 2,
      unitFits: unit.left >= amount.right + 6 && unit.right <= toggle.left && unitText.scrollWidth <= unitText.clientWidth,
      nameAboveDetails: name.bottom <= amount.top,
      nameWeight: Number(getComputedStyle(element('[data-recipe-field="name"]')).fontWeight),
      amountWeight: Number(getComputedStyle(element('[data-recipe-field="amount"]')).fontWeight),
      cardSpacing: rect('.recipe-ingredient-row + .recipe-ingredient-row').top - row.bottom,
      cardBorder: parseFloat(getComputedStyle(element('.recipe-ingredient-row')).borderTopWidth),
      toggleWidth: toggle.width, toggleHeight: toggle.height, toggleFits: toggle.right <= row.right,
      categoryStyle: fieldStyle('#dish-ingredient'), timeStyle: fieldStyle('#dish-minutes'),
      categoryHasOuterField: Boolean(category.closest('.pantry-search')),
      categoryHelpBelow: help.getBoundingClientRect().top >= category.getBoundingClientRect().bottom,
      removeWidth: remove.width, removeHeight: remove.height,
      removeSameRow: Math.abs(remove.top - name.top) <= 2 && remove.left >= name.right + 6,
      closeWidth: close.width, closeHeight: close.height,
      closeInset: dialog.getBoundingClientRect().right - close.right,
      closeTitleGap: close.left - title.right,
      closeVerticalOffset: Math.abs(close.top + close.height / 2 - title.top - title.height / 2),
      duplicatePreparationHeading: Boolean(element('#editor-preparation h4'))
    };
  });
  const check = (condition, description) => { if (!condition) findings.push(`${layout}, ${description}`); };
  check(style.unitWidth >= 88 && style.unitWidth <= 112 && style.unitSameRow && style.unitFits,
    `Einheit soll kompakt neben der Menge stehen (Breite ${style.unitWidth}px, erwartet 88–112px)`);
  check(style.nameAboveDetails && style.nameWeight > style.amountWeight && style.cardSpacing >= 8 && style.cardBorder >= 1,
    'Zutatenname soll hervorgehoben über den Details stehen und jede Zutatenkarte soll klar getrennt sein');
  check(style.toggleWidth >= 44 && style.toggleHeight >= 44 && style.toggleFits,
    'Hinweis soll auch bei schmaler Breite neben den Details erreichbar bleiben');
  check(!style.categoryHasOuterField && style.categoryStyle === style.timeStyle && style.categoryHelpBelow,
    'Kategorie soll wie ein normales Eingabefeld aussehen, mit dem Hinweis darunter');
  check(style.removeWidth >= 44 && style.removeHeight >= 44 && style.removeSameRow,
    `Zutat entfernen soll neben dem Namen stehen und mindestens 44×44px groß sein (aktuell ${style.removeWidth}×${style.removeHeight}px)`);
  check(style.closeWidth >= 44 && style.closeHeight >= 44 && style.closeInset >= 8 && style.closeInset <= 16 &&
    style.closeTitleGap >= 8 && style.closeVerticalOffset <= 4,
    `Schließen-X soll rechts oben mit dem Titel ausgerichtet sein (Randabstand ${style.closeInset}px, vertikaler Versatz ${style.closeVerticalOffset}px)`);
  check(!style.duplicatePreparationHeading, 'Zubereitung soll im geöffneten Abschnitt keine zweite gleichbedeutende Überschrift haben');
}

async function checkImportedEditor(page) {
  const findings = [];
  const recipe = 'Reispfanne\n2 Portionen\nZutaten\n250 g Reis\n100 ml Brühe\n1 Paprika\n1 Zwiebel, fein gehackt\nZubereitung\nReis kochen.\nPaprika schneiden und unterheben.';
  for (const [width, height, keyboardHeight] of [[320, 568, 250], [393, 852, 420], [844, 390, 260], [1440, 900, 900]]) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.evaluate(() => openRecipeCreation());
      await page.getByRole('button', { name: 'Text importieren', exact: true }).click();
      await page.getByRole('textbox', { name: 'Rezepttext einfügen' }).fill(recipe);
      await page.getByRole('button', { name: 'Rezept erkennen' }).click();
      const editor = page.locator('#dish-dialog');
      assert.equal(await editor.locator('#dish-recipe-title').inputValue(), 'Reispfanne');
      for (const section of ['ingredients', 'preparation', 'nutrition']) {
        const details = editor.locator(`#editor-${section}`);
        if (!await details.evaluate(el => el.open)) await details.locator('summary').click();
        assert(await details.evaluate(el => el.open), `Editor section ${section} must open`);
      }
      assert.match(await editor.getByRole('combobox', { name: 'Zutat', exact: true }).first().inputValue(), /^reis$/i);
      const units = editor.getByRole('combobox', { name: 'Einheit', exact: true });
      const unitLabels = editor.locator('.recipe-ingredient-unit-label');
      assert.deepEqual(await units.evaluateAll(fields => fields.slice(0, 2).map(field => field.value)), ['g', 'ml']);
      assert.deepEqual((await unitLabels.allTextContents()).slice(0, 2), ['g', 'ml']);
      await units.first().selectOption('kg');
      assert.equal(await unitLabels.first().innerText(), 'kg');
      await units.first().selectOption('g');
      const notes = editor.locator('[data-recipe-field="note"]');
      const addNote = editor.locator('.recipe-ingredient-note-toggle').first();
      assert(await notes.first().isHidden(), 'Ein leerer Hinweis soll eingeklappt sein');
      assert(await notes.last().isVisible(), 'Ein übernommener Hinweis soll sichtbar sein');
      assert.equal(await notes.last().inputValue(), 'fein gehackt');
      assert.equal(await editor.getByRole('textbox', { name: 'Zubereitungsschritt 2' }).inputValue(), 'Paprika schneiden und unterheben.');

      const fields = [
        ['Rezeptname', '#dish-recipe-title', 'Reispfanne mit Paprika', 160],
        ['Kategorie', '#dish-ingredient', 'Vegetarisch', 130],
        ['Zeit', '#dish-minutes', '45', 48],
        ['Portionen', '#recipe-servings', '4', 48],
        ['Zutat', '[data-recipe-field="name"]', 'Basmatireis', 130],
        ['Menge', '[data-recipe-field="amount"]', '300', 44],
        ['Zutatenhinweis', '[data-recipe-field="note"]', 'vorher abspülen', 130],
        ['Zubereitung', '[data-recipe-field="step"]', 'Reis in Salzwasser kochen.', 145],
        ['Nährwert', '.dish-nutrition-fieldset input', '520', 48]
      ];
      const layout = `${width}×${height} ${colorScheme}`;
      await editor.evaluate(dialog => dialog.ownerDocument.activeElement.blur());
      await checkEditorStyle(editor, layout, findings);
      const measure = target => target.evaluate(async el => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = el.getBoundingClientRect();
        const dialog = el.closest('dialog');
        const bounds = dialog.getBoundingClientRect();
        const css = getComputedStyle(el);
        const top = Math.max(bounds.top + dialog.clientTop, visualViewport.offsetTop);
        const bottom = Math.min(bounds.top + dialog.clientTop + dialog.clientHeight, visualViewport.offsetTop + visualViewport.height);
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          focused: document.activeElement === el,
          keyboardOpen: document.documentElement.classList.contains('dish-keyboard-open'),
          value: el.value,
          visible: rect.top >= top - 1 && rect.bottom <= bottom + 1 && hit === el,
          height: rect.height,
          fontSize: parseFloat(css.fontSize),
          textWidth: Math.round(el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)),
          overflow: Math.max(dialog.scrollWidth - dialog.clientWidth, document.documentElement.scrollWidth - innerWidth)
        };
      });
      for (const [name, selector, value, minTextWidth] of fields) {
        const field = editor.locator(selector).first();
        if (name === 'Zutatenhinweis' && await field.isHidden()) await addNote.click();
        // Tap while the screen is full, then let the editor react to the keyboard resizing it.
        if (keyboardHeight < height) await field.tap();
        else await field.click();
        await page.evaluate(visibleHeight => {
          if (visibleHeight === innerHeight) return;
          Object.defineProperty(visualViewport, 'height', { configurable: true, value: visibleHeight });
          visualViewport.dispatchEvent(new Event('resize'));
        }, keyboardHeight);
        const afterFocus = await measure(field);
        await field.fill(value);
        const state = await measure(field);
        if (!afterFocus.visible || !state.focused || state.value !== value || !state.visible || state.overflow > 1 || state.keyboardOpen !== (keyboardHeight < height) ||
            (keyboardHeight < height && (state.height < 44 || state.fontSize < 16 || state.textWidth < minTextWidth))) {
          findings.push(`${layout}, ${name}: ${JSON.stringify({ ...state, visibleOnFocus: afterFocus.visible, minTextWidth })}`);
        }
        if (name === 'Menge' && keyboardHeight < height) {
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          assert(await addNote.evaluate(el => el === document.activeElement));
          await page.keyboard.press('Enter');
          // iOS can move the visual viewport without changing its height.
          await page.evaluate(() => {
            Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 24 });
            visualViewport.dispatchEvent(new Event('scroll'));
          });
          const note = await measure(editor.locator('[data-recipe-field="note"]').first());
          if (!note.focused || !note.visible || !note.keyboardOpen) {
            findings.push(`${layout}, Fokuswechsel Menge → Zutatenhinweis: ${JSON.stringify(note)}`);
          }
        }
        await page.evaluate(() => {
          document.activeElement.blur();
          delete visualViewport.height;
          delete visualViewport.offsetTop;
          visualViewport.dispatchEvent(new Event('resize'));
        });
      }
      for (const [, selector, value] of fields) {
        assert.equal(await editor.locator(selector).first().inputValue(), value, `${layout}, retained draft value for ${selector}`);
      }
      await addNote.click();
      assert(await notes.first().isHidden());
      await addNote.click();
      assert.equal(await notes.first().inputValue(), 'vorher abspülen');

      const ingredientNames = editor.getByRole('combobox', { name: 'Zutat', exact: true });
      const originalCount = await ingredientNames.count();
      await editor.locator('.recipe-ingredient-note-toggle').nth(1).click();
      assert(await notes.nth(1).isVisible());
      const addIngredient = editor.locator('#recipe-add-ingredient');
      await addIngredient.tap();
      assert.equal(await ingredientNames.count(), originalCount + 1, `${layout}, neue Zutatenzeile`);
      const newIngredient = ingredientNames.last();
      const newRow = editor.locator('.recipe-ingredient-row').last();
      const newAmount = newRow.getByRole('textbox', { name: 'Menge' });
      const newUnit = newRow.getByRole('combobox', { name: 'Einheit' });
      const newNote = newRow.getByRole('textbox', { name: 'Hinweis' });
      const checkEntry = async () => {
        for (const control of [newIngredient, newAmount, newUnit, newNote, addIngredient]) {
          const state = await measure(control);
          assert(state.visible, `${layout}, Schnell-Eingabe muss komplett sichtbar bleiben: ${control} ${JSON.stringify(state)}`);
        }
      };
      const tapVisible = async control => {
        const box = await control.boundingBox();
        assert(box && (await measure(control)).visible, `${layout}, ${control} muss ohne Scrollen erreichbar sein`);
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      };
      if (keyboardHeight < height) {
        await page.evaluate(visibleHeight => {
          Object.defineProperty(visualViewport, 'height', { configurable: true, value: visibleHeight });
          Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 24 });
          if (visibleHeight === 150) {
            // Model the additional bottom safe-area space on an iPhone in landscape.
            document.getElementById('dish-dialog').style.maxHeight = 'calc(var(--visual-viewport-height) - 16px - 21px)';
          }
          visualViewport.dispatchEvent(new Event('resize'));
        }, width > height ? 150 : keyboardHeight);
      }
      const afterAdd = await measure(newIngredient);
      assert(afterAdd.focused && afterAdd.visible, `${layout}, neues Feld direkt nach dem Hinzufügen: ${JSON.stringify(afterAdd)}`);
      // Do not click or fill the new field directly. Playwright could scroll it into view for us.
      await checkEntry();
      await page.keyboard.insertText('Reis');
      const afterTyping = await measure(newIngredient);
      assert(afterTyping.focused && afterTyping.visible && afterTyping.value === 'Reis',
        `${layout}, Eingabe im neuen Feld: ${JSON.stringify(afterTyping)}`);
      await checkEntry();
      await tapVisible(newAmount);
      await page.keyboard.insertText('25');
      await newUnit.selectOption('g');
      await tapVisible(newNote);
      await page.keyboard.insertText('vorher waschen');
      await checkEntry();
      await tapVisible(addIngredient);
      await page.keyboard.insertText('Zitronenmelisse');
      assert.equal(await ingredientNames.count(), originalCount + 2);
      const nextName = await measure(ingredientNames.last());
      assert(nextName.focused && nextName.visible && nextName.value === 'Zitronenmelisse', `${layout}, zweite neue Zutat: ${JSON.stringify(nextName)}`);
      await checkEntry();
      assert.equal(await editor.locator('[data-recipe-field="amount"]').nth(originalCount).inputValue(), '25');
      assert.equal(await units.nth(originalCount).inputValue(), 'g');
      assert.equal(await notes.nth(originalCount).inputValue(), 'vorher waschen');
      await tapVisible(addIngredient);
      assert.equal(await ingredientNames.count(), originalCount + 3);
      assert(await notes.nth(originalCount + 1).isHidden(), `${layout}, der leere Hinweis der vorherigen Zutat wird wieder eingeklappt`);
      await checkEntry();
      assert(await notes.first().isVisible(), `${layout}, zuvor geöffneter Hinweis bleibt geöffnet`);
      assert(await notes.nth(1).isVisible(), `${layout}, leerer geöffneter Hinweis bleibt geöffnet`);
      assert.equal(await notes.first().inputValue(), 'vorher abspülen');
      assert.equal(await ingredientNames.first().inputValue(), 'Basmatireis');
      await page.evaluate(() => {
        delete visualViewport.height;
        delete visualViewport.offsetTop;
        document.getElementById('dish-dialog').style.removeProperty('max-height');
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await editor.evaluate(el => el.close());
    }
  }
  assert(findings.length === 0, `Imported recipe editor findings:\n${findings.join('\n')}`);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ hasTouch: true, serviceWorkers: 'block' });
    const cdp = await page.context().newCDPSession(page);
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
        if (visibleHeight < height) {
          const recipe = 'Reispfanne\nZutaten\n250 g Reis\nZubereitung\n' + Array.from({ length: 30 }, (_, i) => `${i + 1}. Reis kochen.`).join('\n');
          await field.fill(recipe);
          await field.evaluate(el => { el.scrollTop = 0; });
          const beforeScroll = await page.evaluate(() => ({
            pageY: scrollY,
            bodyTop: document.body.getBoundingClientRect().top,
            dialogTop: $('#recipe-import-dialog').getBoundingClientRect().top,
            dialogScroll: $('#recipe-import-dialog').scrollTop,
            actionTop: $('#recipe-import-analyze').getBoundingClientRect().top
          }));
          const box = await field.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, 250);
          await page.waitForFunction(() => $('#recipe-import-text').scrollTop > 0);
          const afterScroll = await page.evaluate(() => ({
            pageY: scrollY,
            bodyTop: document.body.getBoundingClientRect().top,
            dialogTop: $('#recipe-import-dialog').getBoundingClientRect().top,
            dialogScroll: $('#recipe-import-dialog').scrollTop,
            actionTop: $('#recipe-import-analyze').getBoundingClientRect().top
          }));
          assert.deepEqual(afterScroll, beforeScroll, `Text scroll moved surrounding UI: ${label}`);
          await page.mouse.wheel(0, -1000);
          await page.waitForFunction(() => $('#recipe-import-text').scrollTop === 0);
          assert.equal(await field.inputValue(), recipe);
        }
        if (visibleHeight < height) await analyze.tap();
        else await analyze.click();
        await page.evaluate(() => { delete visualViewport.height; syncVisualViewport(); });
        assert.equal(await page.locator('#dish-recipe-title').inputValue(), 'Reispfanne');
        await page.evaluate(() => $('#dish-dialog').close());
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => openRecipeCreation());
    await page.locator('#recipe-import-text-choice').click();
    await page.locator('#recipe-import-text').fill('Reispfanne\nZutaten\n250 g Reis\nZubereitung\nReis kochen.');
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: 150 });
      syncVisualViewport();
      $('#recipe-import-dialog').scrollTop = 0;
    });
    const dialog = page.locator('#recipe-import-dialog');
    const scrollBefore = await page.evaluate(() => ({ pageY: scrollY, bodyTop: document.body.getBoundingClientRect().top, dialogTop: $('#recipe-import-dialog').getBoundingClientRect().top }));
    assert(await dialog.evaluate(el => el.scrollHeight > el.clientHeight), 'Small viewport must make the dialog scrollable');
    const dialogBox = await dialog.boundingBox();
    await page.mouse.move(dialogBox.x + 6, dialogBox.y + dialogBox.height / 2);
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => $('#recipe-import-dialog').scrollTop > 0);
    const scrollAfter = await page.evaluate(() => ({ pageY: scrollY, bodyTop: document.body.getBoundingClientRect().top, dialogTop: $('#recipe-import-dialog').getBoundingClientRect().top }));
    assert.deepEqual(scrollAfter, scrollBefore, 'Dialog scrolling moved the page or dialog');
    const actionVisible = await page.locator('#recipe-import-analyze').evaluate(el => {
      const action = el.getBoundingClientRect(), dialog = el.closest('dialog').getBoundingClientRect();
      return action.top >= dialog.top && action.bottom <= dialog.bottom && action.bottom <= visualViewport.height;
    });
    assert(actionVisible, 'Analyze button must be reachable by scrolling the dialog');
    await page.locator('#recipe-import-analyze').tap();
    await page.evaluate(() => { delete visualViewport.height; syncVisualViewport(); });
    assert.equal(await page.locator('#dish-recipe-title').inputValue(), 'Reispfanne');
    await page.evaluate(() => $('#dish-dialog').close());
    await page.evaluate(() => openRecipeCreation());
    await page.locator('#recipe-import-screenshot-choice').click();
    assert(await page.locator('#recipe-import-input input[type=file]').isVisible());
    await page.locator('#recipe-import-back').click();
    await page.locator('#recipe-import-text-choice').click();
    assert.equal(await page.locator('#recipe-import-input input[type=file]').isVisible(), false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#recipe-import-text').fill('Reispfanne\nZutaten\n250 g Reis\nZubereitung\n' + Array.from({ length: 30 }, (_, i) => `${i + 1}. Reis kochen.`).join('\n'));
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: 420 });
      syncVisualViewport();
      $('#recipe-import-text').scrollTop = 0;
    });
    const swipe = async (x, fromY, toY, checkFrame) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: fromY + (toY - fromY) * step / 8 }] });
        await checkFrame();
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const stableFrame = () => {
      const dialog = document.querySelector('#recipe-import-dialog');
      const action = document.querySelector('#recipe-import-analyze');
      const rect = dialog.getBoundingClientRect(), button = action.getBoundingClientRect();
      return { pageY: scrollY, viewportTop: visualViewport.offsetTop, bodyTop: document.body.getBoundingClientRect().top, top: rect.top, bottom: rect.bottom, buttonTop: button.top, buttonBottom: button.bottom };
    };
    const baseline = await page.evaluate(stableFrame);
    const checkFrame = async () => assert.deepEqual(await page.evaluate(stableFrame), baseline, 'A touch gesture moved the surrounding interface');
    const textBox = await page.locator('#recipe-import-text').boundingBox();
    const textX = textBox.x + textBox.width / 2;
    await swipe(textX, textBox.y + 35, textBox.y + 95, checkFrame);
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(stableFrame), baseline, 'Swipe at the text boundary moved the surrounding interface');
    const actionBox = await page.locator('#recipe-import-back').boundingBox();
    await swipe(actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2, Math.max(10, actionBox.y - 160), checkFrame);
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(stableFrame), baseline, 'Swipe outside the text field moved the surrounding interface');
    assert(baseline.top >= 0 && baseline.bottom <= 420 && baseline.buttonBottom <= baseline.bottom, 'Dialog and action must remain visible above the simulated keyboard');
    await swipe(textX, textBox.y + 130, textBox.y + 35, checkFrame);
    await page.waitForFunction(() => $('#recipe-import-text').scrollTop > 0);
    const gestures = await page.evaluate(() => {
      function moveWasBlocked(target, delta) {
        const { left, width, top, height } = target.getBoundingClientRect();
        const clientX = left + width / 2, y = top + height / 2;
        for (const [type, clientY] of [['touchstart', y], ['touchmove', y + delta]]) {
          const touch = new Touch({ identifier: 1, target, clientX, clientY });
          const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch] });
          target.dispatchEvent(event);
          if (type === 'touchmove') return event.defaultPrevented;
        }
      }
      const text = $('#recipe-import-text');
      text.scrollTop = 0;
      const atStart = moveWasBlocked(text, 30);
      const inText = moveWasBlocked(text, -30);
      text.scrollTop = text.scrollHeight;
      const atEnd = moveWasBlocked(text, -30);
      const action = moveWasBlocked($('#recipe-import-back'), -30);
      return { atStart, inText, atEnd, action };
    });
    assert.deepEqual(gestures, { atStart: true, inText: false, atEnd: true, action: true }, 'Only gestures with room to scroll should reach the browser');
    await page.evaluate(() => { delete visualViewport.height; syncVisualViewport(); });
    const confirmDiscard = page.waitForEvent('dialog');
    const close = page.locator('#recipe-import-close').click();
    const prompt = await confirmDiscard;
    const message = prompt.message();
    await prompt.accept();
    await close;
    assert.equal(message, 'Rezepttext verwerfen?');
    console.log('Text import passed layout, scrolling, touch swipes, simulated keyboard, recipe recognition, and screenshot-to-text switching.');
    await checkImportedEditor(page);
    console.log('Imported editor passed focus, viewport, field size and draft checks.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
