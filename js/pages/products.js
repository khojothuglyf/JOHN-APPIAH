/* ============================================================
   PRODUCTS PAGE SCRIPT (catalog listing)
   Reads search / category / sort / page / advanced filter
   params from the URL and renders the paged product grid.

   Two rendering modes:

   - Server mode (default): a single page straight from the
     backend (keyword, categoryId, sort, page) - fast, real
     pagination, works on any catalog size.

   - Filter mode: when any advanced filter is active (price range,
     rating, availability, seller, discount) - or a sort the
     backend does not implement (Top Rated, Biggest Discount) -
     the page fetches the full matching set and applies filters,
     sorting and pagination client-side. Facets (seller list and
     price bounds) are derived from that set so the sidebar stays
     honest. This keeps the UI working even before the backend
     implements the filter params; once it does, the client-side
     pass can be dropped without changing the page.
   ============================================================ */

import {
  $,
  $$,
  escapeHtml,
  getQueryParam,
  pageUrl,
} from "../utils/dom.js";
import { formatCurrency, discountPercent } from "../utils/format.js";
import { getCategories } from "../services/categoryService.js";
import {
  getProducts,
  getAllMatchingProducts,
} from "../services/productService.js";
import { productCardTemplate } from "../components/cards.js";

const SORT_VALUES = new Set([
  "",
  "price_asc",
  "price_desc",
  "newest",
  "rating",
  "discount",
]);

/** Sorts the backend cannot apply; they force client-side mode. */
const CLIENT_MODE_SORTS = new Set(["rating", "discount"]);

/** Page size used when paginating the client-side filter mode. */
const CLIENT_PAGE_SIZE = 24;

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

const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

const state = {
  q: getQueryParam("keyword") ?? getQueryParam("q") ?? "",
  categoryId: getQueryParam("categoryId") ?? "",
  category: getQueryParam("category") ?? "",
  sort: getQueryParam("sort") ?? "",
  page: Math.max(0, Number(getQueryParam("page")) || 0),
  minPrice: parseFilterNumber(getQueryParam("minPrice")),
  maxPrice: parseFilterNumber(getQueryParam("maxPrice")),
  minRating: parseFilterNumber(getQueryParam("minRating")),
  inStock: getQueryParam("inStock") === "1",
  seller: getQueryParam("seller") ?? "",
  discount: parseFilterNumber(getQueryParam("discount")),
};

let grid;
let countEl;
let paginationEl;
let chipsEl;
let sellerListEl;
let minSlider;
let maxSlider;
let minInput;
let maxInput;
let highlight;
let clientProducts = [];

/** Parse a positive number filter value, falling back to 0. */
function parseFilterNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value) || lo));

/** Whether the catalog must run in advanced client-side mode. */
function filterModeActive() {
  return (
    CLIENT_MODE_SORTS.has(state.sort) ||
    state.minPrice > 0 ||
    state.maxPrice > 0 ||
    state.minRating > 0 ||
    state.inStock ||
    !!state.seller ||
    state.discount > 0
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  grid = $("[data-products]");
  countEl = $("[data-results-count]");
  paginationEl = $("[data-pagination]");
  chipsEl = $("[data-filter-chips]");
  if (!grid) return;

  if (!SORT_VALUES.has(state.sort)) state.sort = "";

  cacheFilterElements();
  syncFilterInputs();
  renderChips();
  populateForm();
  bindEvents();
  await loadCategories();
  await loadProducts();
});

/** Grab the advanced filter DOM nodes once. */
function cacheFilterElements() {
  minSlider = $("[data-price-min-slider]");
  maxSlider = $("[data-price-max-slider]");
  minInput = $("[data-price-min-input]");
  maxInput = $("[data-price-max-input]");
  highlight = $("[data-price-highlight]");
  sellerListEl = $("[data-seller-list]");
}

/** Reflect the URL state in the filter controls. */
function syncFilterInputs() {
  $$("[data-rating]").forEach((radio) => {
    radio.checked = Number(radio.value) === state.minRating;
  });
  $$("[data-discount]").forEach((radio) => {
    radio.checked = Number(radio.value) === state.discount;
  });
  const inStock = $("[data-in-stock]");
  if (inStock) inStock.checked = state.inStock;
  if (minInput) minInput.value = state.minPrice || "";
  if (maxInput) maxInput.value = state.maxPrice || "";
}

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

  /* Mobile filter drawer */
  $("[data-filter-toggle]")?.addEventListener("click", () => {
    $(".catalog-filters")?.classList.add("catalog-filters--open");
  });
  $("[data-filter-close]")?.addEventListener("click", () => {
    $(".catalog-filters")?.classList.remove("catalog-filters--open");
  });

  /* Chips + clear-all */
  chipsEl?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter-chip]");
    if (chip) {
      clearOneFilter(chip.dataset.filterChip);
      return;
    }
    if (event.target.closest("[data-filter-clear]")) clearAllFilters();
  });
  $$("[data-filter-clear]").forEach((button) => {
    button.addEventListener("click", clearAllFilters);
  });

  bindPriceEvents();
  bindRadioEvents();
  bindSellerEvents();
}

function bindPriceEvents() {
  if (minSlider && maxSlider) {
    const syncMin = () => {
      let lo = Number(minSlider.value);
      const hi = Number(maxSlider.value);
      if (lo > hi) {
        lo = hi;
        minSlider.value = lo;
      }
      if (minInput) minInput.value = lo || "";
      updatePriceHighlight();
    };
    const syncMax = () => {
      let hi = Number(maxSlider.value);
      const lo = Number(minSlider.value);
      if (hi < lo) {
        hi = lo;
        maxSlider.value = hi;
      }
      if (maxInput) maxInput.value = hi || "";
      updatePriceHighlight();
    };

    minSlider.addEventListener("input", syncMin);
    maxSlider.addEventListener("input", syncMax);
    minSlider.addEventListener("change", () => {
      state.minPrice = Number(minSlider.value) || 0;
      state.page = 0;
      navigate();
    });
    maxSlider.addEventListener("change", () => {
      state.maxPrice = Number(maxSlider.value) || 0;
      state.page = 0;
      navigate();
    });
  }

  minInput?.addEventListener("change", () => {
    const value = Number(minInput.value);
    state.minPrice =
      Number.isFinite(value) && value > 0
        ? state.maxPrice > 0
          ? Math.min(value, state.maxPrice)
          : value
        : 0;
    state.page = 0;
    navigate();
  });

  maxInput?.addEventListener("change", () => {
    const value = Number(maxInput.value);
    state.maxPrice =
      Number.isFinite(value) && value > 0
        ? state.minPrice > 0
          ? Math.max(value, state.minPrice)
          : value
        : 0;
    state.page = 0;
    navigate();
  });
}

function bindRadioEvents() {
  $$("[data-rating]").forEach((radio) => {
    radio.addEventListener("change", () => {
      state.minRating = Number(radio.value) || 0;
      state.page = 0;
      navigate();
    });
  });

  $$("[data-discount]").forEach((radio) => {
    radio.addEventListener("change", () => {
      state.discount = Number(radio.value) || 0;
      state.page = 0;
      navigate();
    });
  });

  $("[data-in-stock]")?.addEventListener("change", (event) => {
    state.inStock = event.target.checked;
    state.page = 0;
    navigate();
  });
}

function bindSellerEvents() {
  sellerListEl?.addEventListener("change", (event) => {
    const box = event.target.closest("[data-seller-facet]");
    if (!box) return;
    state.seller = box.checked ? box.value : "";
    state.page = 0;
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
  if (filterModeActive()) return loadFiltered();
  return loadFromServer();
}

async function loadFromServer() {
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
    if (products.length === 0) {
      grid.innerHTML = emptyResultsHtml();
      renderCount(0, 0, 0);
      return;
    }
    grid.innerHTML = products.map(productCardTemplate).join("");

    const total = Number(data.totalElements);
    const size = Number(data.size) || 1;
    const start = Number(data.page) * size + 1;
    renderCount(total, start, Math.min(total, start + size - 1));
    renderPagination(Number(data.totalPages) || 0);
  } catch (error) {
    console.error("Failed to load products:", error);
    renderError();
  }
}

async function loadFiltered() {
  grid.innerHTML = SKELETON_CARD.repeat(8);
  countEl.textContent = "";
  paginationEl.innerHTML = "";

  try {
    clientProducts = await getAllMatchingProducts({
      keyword: state.q || undefined,
      categoryId: state.categoryId || undefined,
    });
    renderFacets(clientProducts);
    renderClientPage(filterProducts(clientProducts));
  } catch (error) {
    console.error("Failed to load products:", error);
    renderError();
  }
}

/* ---- Advanced filtering (client-side filter mode) ---- */

function filterProducts(products) {
  return products.filter((product) => {
    const price = Number(product.price) || 0;

    if (state.minPrice > 0 && price < state.minPrice) return false;
    if (state.maxPrice > 0 && price > state.maxPrice) return false;
    if (state.minRating > 0 && (Number(product.rating) || 0) < state.minRating) {
      return false;
    }
    if (state.inStock && !(Number(product.stock) > 0)) return false;
    if (state.seller && product.sellerName !== state.seller) return false;
    if (
      state.discount > 0 &&
      discountPercent(price, product.oldPrice) < state.discount
    ) {
      return false;
    }
    return true;
  });
}

function sortProducts(products) {
  const sorted = [...products];
  switch (state.sort) {
    case "price_asc":
      sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      break;
    case "price_desc":
      sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      break;
    case "rating":
      sorted.sort(
        (a, b) =>
          (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
          (Number(b.reviewsCount) || 0) - (Number(a.reviewsCount) || 0)
      );
      break;
    case "discount":
      sorted.sort(
        (a, b) =>
          discountPercent(Number(b.price), Number(b.oldPrice)) -
          discountPercent(Number(a.price), Number(a.oldPrice))
      );
      break;
    default:
      break;
  }
  return sorted;
}

function renderClientPage(products) {
  const total = products.length;
  if (total === 0) {
    grid.innerHTML = emptyResultsHtml();
    renderCount(0, 0, 0);
    paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(total / CLIENT_PAGE_SIZE);
  if (state.page >= totalPages) state.page = totalPages - 1;

  const startIndex = state.page * CLIENT_PAGE_SIZE;
  const pageProducts = sortProducts(products).slice(
    startIndex,
    startIndex + CLIENT_PAGE_SIZE
  );

  grid.innerHTML = pageProducts.map(productCardTemplate).join("");
  renderCount(total, startIndex + 1, Math.min(total, startIndex + CLIENT_PAGE_SIZE));
  renderPagination(totalPages);
}

/** Build the price slider bounds and the seller facet from the
 *  full matching set (pre-price-filter so ranges can widen). */
function renderFacets(products) {
  const prices = products
    .map((product) => Number(product.price) || 0)
    .filter((price) => price > 0);
  const min = prices.length ? Math.floor(Math.min(...prices)) : 0;
  const max = prices.length ? Math.ceil(Math.max(...prices)) : 0;

  if (minSlider && maxSlider) {
    minSlider.min = min;
    minSlider.max = max || min + 1;
    maxSlider.min = min;
    maxSlider.max = max || min + 1;
    minSlider.value = clamp(state.minPrice || min, min, max);
    maxSlider.value = clamp(state.maxPrice || max || min, min, max);
  }
  if (minInput) minInput.min = min;
  if (maxInput) maxInput.max = max;
  updatePriceHighlight();

  const counts = new Map();
  products.forEach((product) => {
    const name = (product.sellerName || "").trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  });
  const sellers = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const section = sellerListEl?.closest("[data-seller-section]");
  if (!sellerListEl) return;
  if (sellers.length === 0) {
    if (section) section.hidden = true;
    sellerListEl.innerHTML = "";
    return;
  }
  if (section) section.hidden = false;
  sellerListEl.innerHTML = sellers
    .map(
      ([name, count]) => `
      <label class="filter-check">
        <input type="checkbox" data-seller-facet value="${escapeHtml(name)}"
          ${state.seller === name ? "checked" : ""} />
        <span>${escapeHtml(name)}</span>
        <span class="filter-check__count">${count}</span>
      </label>`
    )
    .join("");
}

function updatePriceHighlight() {
  if (!highlight || !minSlider || !maxSlider) return;
  const lo = Number(minSlider.value);
  const hi = Number(maxSlider.value);
  const min = Number(minSlider.min);
  const max = Number(maxSlider.max);
  const span = max - min || 1;
  highlight.style.left = `${((lo - min) / span) * 100}%`;
  highlight.style.right = `${100 - ((hi - min) / span) * 100}%`;
}

/* ---- Shared rendering helpers ---- */

function renderCount(total, start, end) {
  if (!Number.isFinite(total) || total === 0) {
    countEl.textContent = "";
    return;
  }
  countEl.textContent = `Showing ${start}–${end} of ${total} product${
    total === 1 ? "" : "s"
  }`;
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    paginationEl.innerHTML = "";
    return;
  }

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

function renderChips() {
  if (!chipsEl) return;

  const chips = [];
  if (state.minPrice > 0 || state.maxPrice > 0) {
    chips.push({
      key: "price",
      label: `Price ${formatCurrency(state.minPrice || 0)} – ${formatCurrency(
        state.maxPrice || 0
      )}`,
    });
  }
  if (state.minRating > 0) {
    chips.push({ key: "minRating", label: `${state.minRating}★ & up` });
  }
  if (state.inStock) chips.push({ key: "inStock", label: "In stock only" });
  if (state.seller) chips.push({ key: "seller", label: state.seller });
  if (state.discount > 0) {
    chips.push({ key: "discount", label: `${state.discount}%+ off` });
  }

  if (chips.length === 0) {
    chipsEl.innerHTML = "";
    chipsEl.hidden = true;
    return;
  }

  chipsEl.hidden = false;
  chipsEl.innerHTML =
    chips
      .map(
        (chip) => `
      <span class="filter-chip">
        <span>${escapeHtml(chip.label)}</span>
        <button class="filter-chip__remove" type="button"
          data-filter-chip="${chip.key}"
          aria-label="Remove ${escapeHtml(chip.label)} filter">
          ${ICON_CLOSE}
        </button>
      </span>`
      )
      .join("") +
    `<button class="btn-link filter-chip__clear" type="button" data-filter-clear>
       Clear all
     </button>`;
}

function clearOneFilter(key) {
  switch (key) {
    case "price":
      state.minPrice = 0;
      state.maxPrice = 0;
      break;
    case "minRating":
      state.minRating = 0;
      break;
    case "inStock":
      state.inStock = false;
      break;
    case "seller":
      state.seller = "";
      break;
    case "discount":
      state.discount = 0;
      break;
  }
  state.page = 0;
  navigate();
}

function clearAllFilters() {
  state.minPrice = 0;
  state.maxPrice = 0;
  state.minRating = 0;
  state.inStock = false;
  state.seller = "";
  state.discount = 0;
  state.sort = "";
  state.page = 0;
  navigate();
}

function emptyResultsHtml() {
  return `
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
  if (state.minPrice > 0) params.set("minPrice", String(state.minPrice));
  if (state.maxPrice > 0) params.set("maxPrice", String(state.maxPrice));
  if (state.minRating > 0) params.set("minRating", String(state.minRating));
  if (state.inStock) params.set("inStock", "1");
  if (state.seller) params.set("seller", state.seller);
  if (state.discount > 0) params.set("discount", String(state.discount));

  const search = params.toString();
  window.location.assign(pageUrl("pages/products.html") + (search ? `?${search}` : ""));
}
