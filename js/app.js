/* ============================================================
   APP ENTRY
   Shared bootstrap for every page: mounts header/footer.
   Included as `<script type="module" src="js/app.js">` in all
   HTML documents.
   ============================================================ */

import { mountComponents } from "./components/loader.js";
import { initWishlistButtons } from "./components/wishlistButton.js";
import { initInstallPrompt } from "./components/installPrompt.js";
import { initReveal } from "./utils/reveal.js";
import { syncWishlistFromServer } from "./services/wishlistService.js";
import { syncCartFromServer } from "./services/cartService.js";
import { refreshSession } from "./services/authService.js";
import { registerServiceWorker } from "./sw-register.js";

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initWishlistButtons();
  refreshSession();
  syncWishlistFromServer();
  syncCartFromServer();
  mountComponents().catch((error) => {
    console.error("Failed to mount shared components:", error);
  });
  registerServiceWorker();
  initInstallPrompt();

  // Offline page "Try Again" button.
  document.querySelectorAll("[data-retry]").forEach((button) => {
    button.addEventListener("click", () => window.location.reload());
  });
});
