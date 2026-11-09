const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const planner = source.slice(source.indexOf('function keyFor('), source.indexOf('function ingredientKey('));
function setup(days = {}, pins = {}, restDays = []) {
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 9 + i)));
  const week = '2026-11-09';
  const state = { dishes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], plans: { [week]: dates.map((_, i) => (days[i] || []).slice()) }, pinnedMeals: { [week]: dates.map((_, i) => (pins[i] || []).slice()) }, restDays: { [week]: restDays.slice() } };
  const messages = [];
  const ctx = { state, rangeDates: () => dates, mondayFor: date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7))),
    sameValue: (a, b) => JSON.stringify(a) === JSON.stringify(b), cleanRestDays: days => days || [], save: () => {}, renderCalendar: () => {}, showToast: (message, options) => messages.push({ message, ...options }) };
  vm.createContext(ctx); vm.runInContext(planner, ctx);
  return { ctx, dates, state, messages };
}

test('undoing a free rest day preserves rest-day edits in another week', () => {
  const { ctx, state, messages } = setup({});
  ctx.markRestDay(2);
  state.restDays['2026-11-16'] = [1];
  messages[0].onAction();
  assert.deepEqual(Array.from(state.restDays['2026-11-09'] || []), []);
  assert.deepEqual(Array.from(state.restDays['2026-11-16']), [1]);
});

test('undoing a free rest day ignores later changes on following visible days', () => {
  const { ctx, state, messages } = setup();
  ctx.markRestDay(2);
  state.plans['2026-11-09'][5] = ['a'];
  messages[0].onAction();
  assert.deepEqual(Array.from(state.restDays['2026-11-09'] || []), []);
  assert.deepEqual(Array.from(state.plans['2026-11-09'][5]), ['a']);
  assert.equal(messages[1].message, 'Plan wiederhergestellt.');
});

test('occupied-day shift moves meals, pins and rest evenings, then restores only the visible days', () => {
  const { ctx, state, messages } = setup({ 2: ['a', 'b'], 3: ['b'], 4: [], 5: ['a'] }, { 2: [true, false], 3: [false], 5: [true] }, [4]);
  ctx.markRestDay(2);
  assert.deepEqual(Array.from(state.plans['2026-11-09'][2]), []);
  assert.deepEqual(Array.from(state.plans['2026-11-09'][3]), ['a', 'b']);
  assert.deepEqual(Array.from(state.pinnedMeals['2026-11-09'][3]), [true, false]);
  assert.deepEqual(Array.from(state.restDays['2026-11-09']), [2, 5]);
  state.plans['2026-11-16'] = [[], ['a'], [], [], [], [], []];
  messages[0].onAction();
  assert.deepEqual(Array.from(state.plans['2026-11-09'][2]), ['a', 'b']);
  assert.deepEqual(Array.from(state.pinnedMeals['2026-11-09'][2]), [true, false]);
  assert.deepEqual(Array.from(state.restDays['2026-11-09']), [4]);
  assert.deepEqual(Array.from(state.plans['2026-11-16'][1]), ['a']);
});

test('undo leaves a visible day untouched when it changed after the shift', () => {
  const { ctx, state, messages } = setup({ 2: ['a'], 3: ['b'] });
  ctx.markRestDay(2);
  state.plans['2026-11-09'][4] = ['a'];
  messages[0].onAction();
  assert.deepEqual(Array.from(state.plans['2026-11-09'][4]), ['a']);
  assert.match(messages[1].message, /Rückgängig nicht möglich/);
  assert.deepEqual(Array.from(state.plans['2026-11-09'][2]), []);
});
