/* ============================================================
   SCROLL REVEAL
   Toggles `.is-visible` on `[data-reveal]` elements as they
   scroll into view (see css/base/animations.css). Falls back to
   showing everything immediately when IntersectionObserver is
   unavailable or the user prefers reduced motion.
   ============================================================ */

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

let observer = null;

function getObserver() {
  if (observer) return observer;

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
  }
  return observer;
}

function applyDelay(element) {
  const raw = element.getAttribute("data-reveal-delay");
  const delay = Number.parseInt(raw, 10);
  if (Number.isFinite(delay) && delay > 0) {
    element.style.transitionDelay = `${delay}ms`;
  }
}

function revealAll(root) {
  root.querySelectorAll("[data-reveal]").forEach((element) => {
    if (REDUCED_MOTION) {
      element.classList.add("is-visible");
      return;
    }

    applyDelay(element);
    const obs = getObserver();
    if (obs) {
      obs.observe(element);
    } else {
      element.classList.add("is-visible");
    }
  });
}

/**
 * Scan the whole document once. Safe to call multiple times
 * (already-revealed elements are left untouched).
 */
export function initReveal() {
  revealAll(document);
}

/**
 * Scan a subtree for newly rendered `[data-reveal]` elements
 * (e.g. after a grid is populated from an API response).
 */
export function observeReveal(root) {
  revealAll(root);
}
