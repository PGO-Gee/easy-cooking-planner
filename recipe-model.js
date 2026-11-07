(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WochentischRecipes = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function parseAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return null;
    const amount = Number(text.replace(',', '.'));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function normalizeAmount(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const numeric = parseAmount(value);
    return numeric === null ? String(value).trim() : numeric;
  }

  function normalizeRecipe(recipe) {
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return null;
    const servingsValue = Number(recipe.servings);
    const servings = Number.isInteger(servingsValue) && servingsValue > 0 ? servingsValue : null;
    const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map(item => ({
      name: String(item?.name ?? '').trim(),
      amount: normalizeAmount(item?.amount),
      unit: String(item?.unit ?? '').trim(),
      note: String(item?.note ?? '').trim()
    })).filter(item => item.name);
    const steps = (Array.isArray(recipe.steps) ? recipe.steps : []).map(step => String(step ?? '').trim()).filter(Boolean);
    return { servings, ingredients, steps };
  }

  function formatAmount(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return '';
    const rounded = Number(amount.toFixed(3));
    if (rounded === 0) return '<0,001';
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3, useGrouping: false }).format(rounded);
  }

  function scaledAmount(amount, servings, baseServings) {
    const numeric = parseAmount(amount);
    if (numeric === null || !Number.isInteger(Number(servings)) || Number(servings) < 1 || !Number.isInteger(Number(baseServings)) || Number(baseServings) < 1) return null;
    return numeric * Number(servings) / Number(baseServings);
  }

  function shoppingIngredients(recipe, legacyIngredients = []) {
    if (!recipe || !Array.isArray(recipe.ingredients) || !recipe.ingredients.some(item => String(item?.name ?? '').trim())) {
      return Array.isArray(legacyIngredients) ? legacyIngredients.slice() : [];
    }
    const seen = new Set();
    return recipe.ingredients.map(item => String(item?.name ?? '').trim()).filter(name => {
      const key = name.toLocaleLowerCase('de-DE');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Older dishes may only have a shopping list; expose it in the same editor
  // without inventing quantities or discarding their existing names.
  function editableIngredients(recipe, legacyIngredients = []) {
    const normalized = normalizeRecipe(recipe);
    if (normalized?.ingredients.length) return normalized.ingredients;
    return (Array.isArray(legacyIngredients) ? legacyIngredients : [])
      .map(name => String(name ?? '').trim()).filter(Boolean)
      .map(name => ({ name, amount: null, unit: '', note: '' }));
  }

  function fingerprint(dish) {
    const value = JSON.stringify({ name: dish?.name, ingredient: dish?.ingredient, time: dish?.time,
      ingredients: dish?.ingredients, nutrition: dish?.nutrition, recipe: normalizeRecipe(dish?.recipe),
      catalogSourceVersion: dish?.catalogSourceVersion });
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  return Object.freeze({ parseAmount, normalizeAmount, normalizeRecipe, formatAmount, scaledAmount, shoppingIngredients, editableIngredients, fingerprint });
});
