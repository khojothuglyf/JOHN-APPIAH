/* ============================================================
   BACK TO TOP
   Injects a floating button (styled by css/components/backtotop.css)
   that appears after the user scrolls down and scrolls back to
   the top on click. Skips smooth scrolling for reduced motion.
   ============================================================ */

import { rAFThrottle } from "../utils/dom.js";

const BACK_TO_TOP_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;

const SCROLL_THRESHOLD = 480;

/** Mount the back-to-top button once. Idempotent. */
export function mountBackToTop() {
  if (document.querySelector("[data-back-to-top]")) return;

  const button = document.createElement("button");
  button.className = "back-to-top";
  button.dataset.backToTop = "";
  button.type = "button";
  button.setAttribute("aria-label", "Back to top");
  button.innerHTML = BACK_TO_TOP_SVG;
  document.body.appendChild(button);

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const toggleVisibility = rAFThrottle(() => {
    button.classList.toggle("is-visible", window.scrollY > SCROLL_THRESHOLD);
  });
  toggleVisibility();

  window.addEventListener("scroll", toggleVisibility, { passive: true });

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });
}
