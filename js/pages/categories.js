/* ============================================================
   CATEGORIES PAGE SCRIPT
   Loads the full category list from the backend and renders it
   as a card grid.
   ============================================================ */

import { $ } from "../utils/dom.js";
import { getCategories } from "../services/categoryService.js";
import { categoryCardTemplate } from "../components/cards.js";

document.addEventListener("DOMContentLoaded", async () => {
  const container = $("[data-categories]");
  if (!container) return;

  try {
    const categories = await getCategories();
    if (!Array.isArray(categories) || categories.length === 0) {
      renderEmpty(container);
      return;
    }
    container.innerHTML = categories.map(categoryCardTemplate).join("");
  } catch (error) {
    console.error("Failed to load categories:", error);
    renderError(container);
  }
});

function renderEmpty(container) {
  container.innerHTML = `
    <div class="page-placeholder" style="grid-column: 1 / -1">
      <span class="page-placeholder__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </span>
      <h2 class="page-placeholder__title">No categories yet</h2>
      <p class="page-placeholder__text">Categories will appear here as soon as they're published.</p>
    </div>
  `;
}

function renderError(container) {
  container.innerHTML = `
    <div class="page-placeholder" style="grid-column: 1 / -1">
      <span class="page-placeholder__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
      </span>
      <h2 class="page-placeholder__title">Couldn't load categories</h2>
      <p class="page-placeholder__text">Please check your connection and try again.</p>
      <button class="btn btn--primary" type="button" onclick="window.location.reload()">Try again</button>
    </div>
  `;
}
