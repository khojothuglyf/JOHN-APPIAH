/* ============================================================
   APP ENTRY
   Shared bootstrap for every page: mounts header/footer.
   Included as `<script type="module" src="js/app.js">` in all
   HTML documents.
   ============================================================ */

import { mountComponents } from "./components/loader.js";
import { initWishlistButtons } from "./components/wishlistButton.js";
import { initReveal } from "./utils/reveal.js";

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initWishlistButtons();
  mountComponents().catch((error) => {
    console.error("Failed to mount shared components:", error);
  });
});
