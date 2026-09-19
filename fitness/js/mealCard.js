// Shared "Meal N" accordion -- one food per row, weight/quantity as given
// (not forced into grams), swap options (an alternative to a real food,
// never eaten alongside it) split into their own dimmed group and excluded
// from the meal's own displayed totals. Used by both Today's tickable meal
// list and Plan's read-only reference view, so the two never drift apart.
import { qs, qsa, escapeHtml } from './utils.js';

// A meal's own foods breakdown (fitness.meal_foods) is empty until that
// data is entered by hand -- fall back to a single "food" built from the
// meal's own name/totals so the accordion never opens onto a blank list
// before that data exists.
export function mealFoods(meal){
  if (meal.foods && meal.foods.length) return meal.foods;
  return [{ name: meal.name, quantity: null, unit: null, kcal: meal.kcal, protein_g: meal.protein_g, carbs_g: meal.carbs_g ?? 0, fat_g: meal.fat_g ?? 0, is_swap_option: false }];
}

// Grams render tight ("250g", matching the app's existing "45g carbs"
// convention); anything else renders as given ("6 whole", "1 scoop") rather
// than converted into an invented gram figure.
export function foodQtyLabel(food){
  if (food.quantity == null) return '—';
  return food.unit === 'g' ? `${food.quantity}g` : `${food.quantity} ${food.unit}`;
}

export function foodRowHtml(food){
  return `
    <li class="meal-food-row ${food.is_swap_option ? 'is-swap' : ''}">
      <div class="meal-food-top">
        <span class="meal-food-name">${escapeHtml(food.name)}</span>
        <span class="meal-food-qty">${escapeHtml(foodQtyLabel(food))}</span>
      </div>
      <div class="meal-food-macro">${food.kcal ?? 0} kcal · ${food.protein_g ?? 0}g protein · ${food.carbs_g ?? 0}g carbs · ${food.fat_g ?? 0}g fat</div>
    </li>`;
}

// `opts.itemId` present -> a tickable row (Today): renders the tick-box,
// checked state, and the data-* attributes computeTotals() reads. Omitted
// (Plan) -> a plain reference card, no checkbox, no tick-status.
export function mealAccordionHtml(meal, idx, opts = {}){
  const { itemId, checked } = opts;
  const carbs = meal.carbs_g ?? 0;
  const fat = meal.fat_g ?? 0;
  const allFoods = mealFoods(meal);
  const foods = allFoods.filter((f) => !f.is_swap_option);
  const swaps = allFoods.filter((f) => f.is_swap_option);
  const tickable = itemId != null;
  return `
    <li class="tick-row meal-acc ${checked ? 'is-checked' : ''}" ${tickable ? `data-item-id="${escapeHtml(itemId)}" data-kcal="${meal.kcal}" data-protein="${meal.protein_g}" data-carbs="${carbs}" data-fat="${fat}"` : ''}>
      <div class="meal-acc-header">
        ${tickable ? `<button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark Meal ${idx} as eaten"></button>` : ''}
        <button type="button" class="meal-acc-summary" aria-expanded="false">
          <span class="meal-acc-title-row">
            <span class="meal-acc-title">Meal ${idx} <span class="meal-acc-time">${escapeHtml(meal.time_label)}</span></span>
            <span class="meal-acc-chevron" aria-hidden="true">⌄</span>
          </span>
          <span class="meal-acc-macro">${meal.kcal} kcal · ${meal.protein_g}g protein · ${carbs}g carbs · ${fat}g fat</span>
        </button>
        ${tickable ? `<span class="tick-status" aria-live="polite"></span>` : ''}
      </div>
      <div class="meal-acc-body" hidden>
        <ul class="meal-food-list">${foods.map(foodRowHtml).join('')}</ul>
        ${swaps.length ? `
          <div class="meal-food-swaps">
            <div class="meal-food-swaps-label">Or swap the protein for</div>
            <ul class="meal-food-list">${swaps.map(foodRowHtml).join('')}</ul>
          </div>` : ''}
        ${meal.notes ? `<div class="tick-notes">${escapeHtml(meal.notes)}</div>` : ''}
      </div>
    </li>`;
}

// Expand/collapse only -- independent of any tick-box, which each caller
// wires separately (Today has one, Plan doesn't).
export function wireMealAccordionToggles(root){
  qsa('.meal-acc-summary', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      qs('.meal-acc-body', btn.closest('.meal-acc')).hidden = expanded;
    });
  });
}
