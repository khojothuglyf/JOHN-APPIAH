/* ============================================================
   CARD TEMPLATES
   Reusable HTML-string builders for product and category cards.
   Shared by the homepage (Phase 3) and the catalog (Phase 4).
   ============================================================ */

import { escapeHtml, pageUrl } from "../utils/dom.js";
import { formatCurrency, discountPercent } from "../utils/format.js";
import { wishlistButtonTemplate } from "./wishlistButton.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const ICON_STAR = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

/** Icon pool cycled across categories when no image is available. */
const CATEGORY_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="9" x="5" y="3" rx="2"/><path d="M9 21h6M12 12v6"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h4a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1zM14 19h4a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z"/><path d="M6 5V3M6 13v2M13 6h-2M17 6h2M13 18h-2M17 18h2M3 6h1M19 6h2"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
];

const ICON_PACKAGE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;

/** Build a product card HTML string. Resilient to missing fields. */
export function productCardTemplate(product = {}) {
  const id = product.id ?? "";
  const name = product.name || "Untitled product";
  const price = Number(product.price);
  const oldPrice = Number(product.oldPrice);
  const discount = discountPercent(price, oldPrice);

  const href = pageUrl(`pages/product-details.html?id=${encodeURIComponent(id)}`);
  const imgSrc = product.imageUrl || IMAGE_FALLBACK;

  const rating = Number(product.rating);
  const reviews = Number(product.reviewsCount);
  const ratingHtml =
    rating > 0 || reviews > 0
      ? `<span class="product-card__rating">${ICON_STAR}${rating.toFixed(1)}
         ${reviews > 0 ? `(${reviews})` : ""}</span>`
      : "";

  const badgeHtml =
    discount > 0
      ? `<span class="badge badge--danger product-card__badge">-${discount}%</span>`
      : "";

  const oldPriceHtml =
    oldPrice > price && price > 0
      ? `<span class="product-card__old-price">${formatCurrency(oldPrice)}</span>`
      : "";

  return `
    <article class="product-card">
      <div class="product-card__media">
        <a class="product-card__media-link" href="${href}" tabindex="-1" aria-hidden="true" focusable="false">
          <img src="${escapeHtml(imgSrc)}" alt="" loading="lazy" decoding="async"
            onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'" />
        </a>
        ${badgeHtml}
        ${wishlistButtonTemplate(product)}
      </div>
      <div class="product-card__body">
        <h3 class="product-card__title">
          <a class="product-card__title-link" href="${href}">${escapeHtml(name)}</a>
        </h3>
        ${ratingHtml}
        <div class="product-card__price-row">
          <span class="product-card__price">${formatCurrency(price)}</span>
          ${oldPriceHtml}
        </div>
      </div>
    </article>
  `;
}

/** Build a category card HTML string linking to the catalog. */
export function categoryCardTemplate(category = {}, index = 0) {
  const id = category.id ?? "";
  const name = category.name || "Category";
  const count = Number(category.productCount);

  const href = pageUrl(
    `pages/products.html${id ? `?categoryId=${encodeURIComponent(id)}` : ""}`
  );
  const icon =
    (CATEGORY_ICONS.length && CATEGORY_ICONS[index % CATEGORY_ICONS.length]) ||
    ICON_PACKAGE;

  const countHtml = Number.isFinite(count)
    ? `<span class="category-card__count">${count} product${count === 1 ? "" : "s"}</span>`
    : `<span class="category-card__count">${escapeHtml(
        category.description || "Browse products"
      )}</span>`;

  return `
    <a class="category-card" href="${href}">
      <span class="category-card__icon">${icon}</span>
      <span>
        <span class="category-card__label">${escapeHtml(name)}</span>
        ${countHtml}
      </span>
    </a>
  `;
}
