/* ============================================================
   PRODUCTS PAGE SCRIPT (catalog listing)
   Reads search / category / sort / page from the URL, loads the
   category filter list and renders the paged product grid.
   ============================================================ */

import { $, getQueryParam, pageUrl } from "../utils/dom.js";
import { getCategories } from "../services/categoryService.js";
import { getProducts } from "../services/productService.js";
import { productCardTemplate } from "../components/cards.js";

const SORT_VALUES = new Set(["", "price_asc", "price_desc", "newest", "rating"]);

const SKELETON_CARD = `
  <div class="card">
    <div class="skeleton skeleton--image"></div>
    <div class="card__body">
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--text-sm" style="width: 60%"></div>
      <div class="skeleton skeleton--text-lg" style="width: 40%"></div>
    </div>
  </div>
`;

const state = {
  q: getQueryParam("keyword") ?? getQueryParam("q") ?? "",
  categoryId: getQueryParam("categoryId") ?? "",
  category: getQueryParam("category") ?? "",
  sort: getQueryParam("sort"),
  page: Math.max(0, Number(getQueryParam("page")) || 0),
};

let grid;
let countEl;
let paginationEl;

document.addEventListener("DOMContentLoaded", async () => {
  grid = $("[data-products]");
  countEl = $("[data-results-count]");
  paginationEl = $("[data-pagination]");
  if (!grid) return;

  if (!SORT_VALUES.has(state.sort)) state.sort = "";

  populateForm();
  bindEvents();
  await loadCategories();
  await loadProducts();
});

function populateForm() {
  const search = $("[data-catalog-search]");
  if (search) search.value = state.q;
}

function bindEvents() {
  const form = $("[data-catalog-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.q = $("[data-catalog-search]", form)?.value.trim() ?? "";
    state.page = 0;
    navigate();
  });

  $("[data-catalog-category]")?.addEventListener("change", (event) => {
    state.categoryId = event.target.value || "";
    state.page = 0;
    navigate();
  });

  $("[data-catalog-sort]")?.addEventListener("change", (event) => {
    state.sort = event.target.value || "";
    state.page = 0;
    navigate();
  });

  paginationEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;

    const target = button.dataset.page;
    const totalPages = Number(paginationEl.dataset.totalPages) || 0;
    if (target === "prev") state.page = Math.max(0, state.page - 1);
    else if (target === "next") state.page = Math.min(totalPages - 1, state.page + 1);
    else state.page = Math.max(0, Number(target));

    navigate();
  });
}

async function loadCategories() {
  const select = $("[data-catalog-category]");
  if (!select) return;

  try {
    const categories = await getCategories();
    if (Array.isArray(categories)) {
      categories.forEach((category) => {
        select.add(new Option(category.name, String(category.id)));
      });
    }

    if (!state.categoryId && state.category) {
      const match = categories.find(
        (category) =>
          category.name.toLowerCase() === state.category.toLowerCase()
      );
      if (match) state.categoryId = String(match.id);
    }

    if (state.categoryId) select.value = state.categoryId;
  } catch (error) {
    console.error("Failed to load categories:", error);
  }
}

async function loadProducts() {
  grid.innerHTML = SKELETON_CARD.repeat(8);
  countEl.textContent = "";
  paginationEl.innerHTML = "";

  try {
    const data = await getProducts({
      page: state.page,
      keyword: state.q || undefined,
      categoryId: state.categoryId || undefined,
      sort: state.sort || undefined,
    });

    const products = Array.isArray(data) ? data : data.content ?? [];
    renderProducts(products);
    renderCount(data);
    renderPagination(data);
  } catch (error) {
    console.error("Failed to load products:", error);
    renderError();
  }
}

function renderProducts(products) {
  if (products.length === 0) {
    grid.innerHTML = `
      <div class="page-placeholder" style="grid-column: 1 / -1">
        <span class="page-placeholder__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </span>
        <h2 class="page-placeholder__title">No products found</h2>
        <p class="page-placeholder__text">
          Try a different search term or clear the filters.
        </p>
        <a class="btn btn--primary" href="products.html">Clear filters</a>
      </div>
    `;
    return;
  }
  grid.innerHTML = products.map(productCardTemplate).join("");
}

function renderCount(data) {
  const total = Number(data.totalElements);
  if (!Number.isFinite(total) || total === 0) return;

  const size = Number(data.size) || 1;
  const start = Number(data.page) * size + 1;
  const end = Math.min(total, Number(data.page) * size + size);
  countEl.textContent = `Showing ${start}–${end} of ${total} products`;
}

function renderPagination(data) {
  const totalPages = Number(data.totalPages) || 0;
  if (totalPages <= 1) return;

  paginationEl.dataset.totalPages = String(totalPages);

  const pages = pageNumbers(state.page, totalPages);
  const prev = `
    <button class="pagination__btn" type="button" data-page="prev"
      aria-label="Previous page" ${state.page === 0 ? "disabled" : ""}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
    </button>`;
  const next = `
    <button class="pagination__btn" type="button" data-page="next"
      aria-label="Next page" ${state.page >= totalPages - 1 ? "disabled" : ""}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
    </button>`;

  const pagesHtml = pages
    .map((page) =>
      page === "ellipsis"
        ? '<span class="pagination__ellipsis" aria-hidden="true">…</span>'
        : `<button class="pagination__page${page === state.page ? " is-active" : ""}"
            type="button" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ""}>
            ${page + 1}
          </button>`
    )
    .join("");

  paginationEl.innerHTML = prev + pagesHtml + next;
}

/** Compact window of page indexes with ellipsis for large sets. */
function pageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index);
  }

  const indexes = new Set([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...indexes]
    .filter((page) => page >= 0 && page < total)
    .sort((a, b) => a - b);

  const result = [];
  let previous = -2;
  sorted.forEach((page) => {
    if (page - previous > 1) result.push("ellipsis");
    result.push(page);
    previous = page;
  });
  return result;
}

function renderError() {
  grid.innerHTML = `
    <div class="page-placeholder" style="grid-column: 1 / -1">
      <span class="page-placeholder__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
      </span>
      <h2 class="page-placeholder__title">Couldn't load products</h2>
      <p class="page-placeholder__text">Please check your connection and try again.</p>
      <button class="btn btn--primary" type="button" onclick="window.location.reload()">Try again</button>
    </div>
  `;
}

/** Navigate to the products URL that reflects the current state. */
function navigate() {
  const params = new URLSearchParams();
  if (state.q) params.set("keyword", state.q);
  if (state.categoryId) params.set("categoryId", state.categoryId);
  if (state.sort) params.set("sort", state.sort);
  if (state.page > 0) params.set("page", String(state.page));

  const search = params.toString();
  window.location.assign(pageUrl("pages/products.html") + (search ? `?${search}` : ""));
}
