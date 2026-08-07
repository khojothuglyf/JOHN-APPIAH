/* ============================================================
   FOOTER COMPONENT
   Loads components/footer.html and fills in the current year.
   ============================================================ */

import { pageUrl, rewriteRelativeUrls } from "../utils/dom.js";

const PARTIAL_URL = "components/footer.html";

export async function mountFooter(root) {
  try {
    const response = await fetch(pageUrl(PARTIAL_URL));
    if (!response.ok) {
      throw new Error(`Failed to load footer (${response.status})`);
    }
    root.innerHTML = await response.text();
    rewriteRelativeUrls(root);

    const year = root.querySelector("[data-year]");
    if (year) year.textContent = String(new Date().getFullYear());
  } catch (error) {
    console.error(error);
    root.innerHTML = "";
  }
}
