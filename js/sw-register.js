/* ============================================================
   SERVICE WORKER REGISTRATION
   Loaded from js/app.js. Registers the service worker after the
   window has fully loaded so it never blocks first paint.
   - updateViaCache: "none" keeps the service-worker file itself
     fresh on every page load.
   - Checks for updates on load and whenever the tab regains focus
     (auto-updates, no user interaction required).
   - Best-effort: any failure is swallowed - the app keeps working.
   ============================================================ */

const SW_URL = "/service-worker.js";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    return;
  }

  navigator.serviceWorker
    .register(SW_URL, { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      registration.update().catch(() => {});
      window.addEventListener("focus", () => {
        registration.update().catch(() => {});
      });
    })
    .catch((error) => {
      console.warn("[SW] registration failed:", error);
    });
}
