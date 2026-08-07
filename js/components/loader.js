/* ============================================================
   COMPONENT LOADER
   Mounts the shared header/footer on every page.
   Pages declare `<div data-component="navbar"></div>` and
   `<div data-component="footer"></div>` in their markup.
   ============================================================ */

import { mountNavbar } from "./navbar.js";
import { mountFooter } from "./footer.js";
import { mountBackToTop } from "./backToTop.js";

/**
 * Load and initialise all shared components found on the page.
 * Safe to call more than once (components are idempotent).
 */
export async function mountComponents() {
  const tasks = [];

  document.querySelectorAll('[data-component="navbar"]').forEach((root) => {
    tasks.push(mountNavbar(root));
  });

  document.querySelectorAll('[data-component="footer"]').forEach((root) => {
    tasks.push(mountFooter(root));
  });

  mountBackToTop();

  await Promise.all(tasks);
}
