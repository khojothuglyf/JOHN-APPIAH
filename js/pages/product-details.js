/* ============================================================
   PRODUCT DETAILS PAGE SCRIPT
   Loads a single product, renders its info, handles the quantity
   stepper + "Add to cart" (local cart for now) and shows related
   products from the same category.
   ============================================================ */

import { $, escapeHtml, getQueryParam, pageUrl } from "../utils/dom.js";
import { formatCurrency, discountPercent } from "../utils/format.js";
import { getProduct, getProducts } from "../services/productService.js";
import { addItem } from "../services/cartService.js";
import { showToast } from "../components/toast.js";
import { productCardTemplate } from "../components/cards.js";

const RELATED_LIMIT = 4;
const LOW_STOCK_THRESHOLD = 5;

const ICON_STAR = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

const state = {
  product: null,
  stock: Infinity,
};

document.addEventListener("DOMContentLoaded", () => {
  const id = getQueryParam("id");
  if (!id) {
    window.location.assign(pageUrl("pages/products.html"));
    return;
  }

  initQuantityStepper();
  initAddToCart();

  loadProduct(id);
});

async function loadProduct(id) {
  try {
    const product = await getProduct(id);
    state.product = product;
    state.stock = Number.isFinite(Number(product.stock))
      ? Number(product.stock)
      : Infinity;
    renderProduct(product);
    loadRelated(product);
  } catch (error) {
    console.error("Failed to load product:", error);
    renderError();
  }
}

function renderProduct(product) {
  const image = $("[data-product-image]");
  const skeleton = $("[data-gallery-skeleton]");
  if (image) {
    image.src = product.imageUrl || pageUrl("images/placeholder.svg");
    image.alt = product.name || "Product image";
    image.hidden = false;
  }
  if (skeleton) skeleton.remove();

  const price = Number(product.price) || 0;
  const oldPrice = Number(product.oldPrice);
  const discount = discountPercent(price, oldPrice);

  setText("[data-product-title]", product.name);
  setText("[data-product-category]", product.category?.name || "");
  setText("[data-product-description]", product.description);
  setText("[data-product-sku]", product.sku || "-");
  setText("[data-product-price]", formatCurrency(price));

  const rating = Number(product.rating);
  const reviews = Number(product.reviewsCount);
  const ratingEl = $("[data-product-rating]");
  if (ratingEl) {
    if (rating > 0 || reviews > 0) {
      ratingEl.innerHTML = `${ICON_STAR}<span>${rating > 0 ? rating.toFixed(1) : "New"}</span>${reviews > 0 ? `<span>· ${reviews} reviews</span>` : ""}`;
    } else {
      ratingEl.hidden = true;
    }
  }

  const oldPriceEl = $("[data-product-old-price]");
  if (oldPriceEl) {
    oldPriceEl.hidden = !(oldPrice > price && price > 0);
    oldPriceEl.textContent = formatCurrency(oldPrice);
  }

  const saveEl = $("[data-product-save]");
  if (saveEl) {
    saveEl.hidden = discount <= 0;
    saveEl.textContent = `Save ${discount}%`;
  }

  const badge = $("[data-product-badge]");
  if (badge) {
    badge.hidden = discount <= 0;
    badge.textContent = `-${discount}%`;
  }

  renderStock();

  const categoryLink = $("[data-product-category-link]");
  if (categoryLink && product.category?.id) {
    categoryLink.href = pageUrl(`pages/products.html?categoryId=${encodeURIComponent(product.category.id)}`);
    categoryLink.textContent = product.category.name || "Browse";
  }

  const crumbCategory = $("[data-crumb-category]");
  if (crumbCategory && product.category?.name) {
    crumbCategory.innerHTML = `<a href="products.html">${escapeHtml(product.category.name)}</a>`;
  }
  setText("[data-crumb-name]", product.name);
  document.title = `${product.name || "Product"} | Marketplace`;
}

function renderStock() {
  const stockEl = $("[data-product-stock]");
  if (!stockEl) return;

  if (state.stock === 0) {
    stockEl.className = "product-detail__stock product-detail__stock--out";
    stockEl.textContent = "Out of stock";
  } else if (state.stock <= LOW_STOCK_THRESHOLD) {
    stockEl.className = "product-detail__stock product-detail__stock--low";
    stockEl.textContent = `Only ${state.stock} left in stock`;
  } else {
    stockEl.className = "product-detail__stock product-detail__stock--in-stock";
    stockEl.textContent = "In stock";
  }

  const input = $("[data-qty-input]");
  const addButton = $("[data-add-to-cart]");
  if (input) input.max = String(Math.min(state.stock, 99));
  if (addButton) {
    addButton.disabled = state.stock === 0;
    if (state.stock === 0) addButton.textContent = "Out of stock";
  }
}

function initQuantityStepper() {
  const input = $("[data-qty-input]");
  if (!input) return;

  const setValue = (value) => {
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 99;
    const next = Math.min(Math.max(value, min), max);
    input.value = String(next);
  };

  $("[data-qty-minus]")?.addEventListener("click", () =>
    setValue(Number(input.value) - 1)
  );
  $("[data-qty-plus]")?.addEventListener("click", () =>
    setValue(Number(input.value) + 1)
  );
  input.addEventListener("change", () => setValue(Number(input.value)));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
}

function initAddToCart() {
  $("[data-add-to-cart]")?.addEventListener("click", () => {
    const input = $("[data-qty-input]");
    const quantity = Math.max(1, Number(input?.value) || 1);

    if (state.stock > 0 && quantity > state.stock) {
      showToast({
        title: "Not enough stock",
        message: `Only ${state.stock} available right now.`,
        type: "warning",
      });
      return;
    }

    addItem(state.product, quantity);
    showToast({
      title: "Added to cart",
      message: `${quantity} × ${state.product?.name || "item"}`,
      type: "success",
    });
  });
}

async function loadRelated(product) {
  const container = $("[data-related-products]");
  const section = $("[data-related-section]");
  if (!container || !section) return;

  const categoryId = product.category?.id;
  if (!categoryId) return;

  try {
    const data = await getProducts({
      categoryId,
      page: 0,
      size: RELATED_LIMIT + 1,
    });
    const related = (Array.isArray(data) ? data : data.content ?? []).filter(
      (item) => item.id !== product.id
    );

    if (related.length === 0) return;

    container.innerHTML = related.slice(0, RELATED_LIMIT).map(productCardTemplate).join("");
    section.hidden = false;
  } catch (error) {
    console.error("Failed to load related products:", error);
  }
}

function renderError() {
  const container = $("[data-product-detail]");
  if (container) {
    container.innerHTML = `
      <div class="page-placeholder" style="grid-column: 1 / -1">
        <span class="page-placeholder__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        </span>
        <h2 class="page-placeholder__title">Product not found</h2>
        <p class="page-placeholder__text">
          It may have been removed or the link may be broken.
        </p>
        <a class="btn btn--primary" href="products.html">Browse products</a>
      </div>
    `;
  }
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value || "";
}
