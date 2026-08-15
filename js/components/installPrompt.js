/* ============================================================
   INSTALL PROMPT (PWA)
   Captures the browser's beforeinstallprompt event and shows a
   dismissible install banner. On iOS Safari - where no such event
   exists - a one-time "Add to Home Screen" hint is shown instead.
   Never shows when the app is already running standalone.
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";

let deferredPrompt = null;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator.standalone === true);

const isIos = () =>
  !window.MSStream &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function initInstallPrompt() {
  if (isStandalone()) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showBanner(false);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideBanner();
  });

  if (isIos() && !storage.get(STORAGE_KEYS.installHint)) {
    storage.set(STORAGE_KEYS.installHint, true);
    showBanner(true);
  }
}

function showBanner(ios) {
  if (document.querySelector("[data-install-banner]")) return;

  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.setAttribute("data-install-banner", "");
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Install the TradeWide app");

  const title = document.createElement("p");
  title.className = "install-banner__title";
  title.textContent = ios ? "Install TradeWide" : "Get the TradeWide app";

  const text = document.createElement("p");
  text.className = "install-banner__text";
  text.textContent = ios
    ? 'Tap the Share button, then choose "Add to Home Screen".'
    : "Install it for a faster, app-like experience. Works offline too.";

  const actions = document.createElement("div");
  actions.className = "install-banner__actions";

  const primary = document.createElement("button");
  primary.className = "btn btn--primary btn--sm";
  primary.type = "button";
  primary.textContent = ios ? "Got it" : "Install";
  primary.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
    hideBanner();
  });

  const later = document.createElement("button");
  later.className = "btn btn--ghost btn--sm";
  later.type = "button";
  later.textContent = "Not now";
  later.addEventListener("click", hideBanner);

  actions.append(primary, later);
  banner.append(title, text, actions);
  document.body.appendChild(banner);
}

function hideBanner() {
  document.querySelector("[data-install-banner]")?.remove();
}
