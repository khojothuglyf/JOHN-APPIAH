/* ============================================================
   TOAST COMPONENT
   Transient notifications ("Added to cart", errors, ...).
   Creates the container on demand and auto-dismisses.
   ============================================================ */

const TYPES = ["success", "error", "warning", "info"];
const DEFAULT_DURATION = 3500;

const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>',
};

function getContainer() {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a transient toast.
 * @param {object} options { title, message, type, duration }
 */
export function showToast({ title, message, type = "info", duration } = {}) {
  const container = getContainer();
  const kind = TYPES.includes(type) ? type : "info";
  const timeout = Number(duration) > 0 ? Number(duration) : DEFAULT_DURATION;

  const toast = document.createElement("div");
  toast.className = `toast toast--${kind}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="toast__icon">${ICONS[kind]}</span>
    <div class="toast__content">
      ${title ? `<p class="toast__title"></p>` : ""}
      ${message ? `<p class="toast__message"></p>` : ""}
    </div>
    <button class="toast__close" type="button" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;

  const titleEl = toast.querySelector(".toast__title");
  const messageEl = toast.querySelector(".toast__message");
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  const dismiss = () => {
    toast.classList.remove("toast--visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  };

  toast.querySelector(".toast__close")?.addEventListener("click", dismiss);
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--visible"));

  const timer = setTimeout(dismiss, timeout);
  toast.addEventListener("mouseenter", () => clearTimeout(timer), { once: true });
  toast.addEventListener("mouseleave", () => {
    clearTimeout(timer);
    setTimeout(dismiss, timeout);
  }, { once: true });
}
