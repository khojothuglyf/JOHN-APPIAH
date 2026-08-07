/* ============================================================
   HOME PAGE SCRIPT
   Phase 3: loads live categories and featured products from the
   backend and renders them into the skeleton placeholders in
   index.html. Each region fails independently with a retry link.
   ============================================================ */

import { $ } from "../utils/dom.js";
import { observeReveal } from "../utils/reveal.js";
import { getCategories } from "../services/categoryService.js";
import { getFeaturedProducts } from "../services/productService.js";
import {
  productCardTemplate,
  categoryCardTemplate,
} from "../components/cards.js";

const FEATURED_LIMIT = 8;

/** Stagger-reveal the rendered cards as they scroll into view. */
function staggerReveal(container) {
  Array.from(container.children).forEach((child, index) => {
    child.setAttribute("data-reveal", "");
    child.setAttribute("data-reveal-delay", String((index % 8) * 40));
  });
  observeReveal(container);
}

document.addEventListener("DOMContentLoaded", () => {
  loadCategories();
  loadFeaturedProducts();
});

async function loadCategories() {
  const container = $("[data-categories]");
  if (!container) return;

  try {
    const categories = await getCategories();
    if (!Array.isArray(categories) || categories.length === 0) {
      renderEmpty(container, "Categories will be available soon.");
      return;
    }
    container.innerHTML = categories
      .map(categoryCardTemplate)
      .join("");
    staggerReveal(container);
  } catch (error) {
    console.error("Failed to load categories:", error);
    renderError(container);
  }
}

async function loadFeaturedProducts() {
  const container = $("[data-featured-products]");
  if (!container) return;

  try {
    const response = await getFeaturedProducts(FEATURED_LIMIT);
    const products = Array.isArray(response)
      ? response
      : response?.content ?? [];
    if (products.length === 0) {
      renderEmpty(container, "Featured products are on their way.");
      return;
    }
    container.innerHTML = products.map(productCardTemplate).join("");
    staggerReveal(container);
  } catch (error) {
    console.error("Failed to load featured products:", error);
    renderError(container);
  }
}

function renderEmpty(container, message) {
  container.innerHTML = `<p class="u-text-muted">${message}</p>`;
}

function renderError(container) {
  container.innerHTML = `
    <p class="u-text-muted">
      We couldn't load this section right now.
      <button class="btn-link" type="button" onclick="window.location.reload()">
        Try again
      </button>
    </p>
  `;
}
