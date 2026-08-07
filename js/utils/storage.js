/* ============================================================
   STORAGE UTILITY
   Safe JSON wrappers around localStorage / sessionStorage.
   ============================================================ */

function createStore(backend) {
  return {
    get(key, fallback = null) {
      try {
        const raw = backend.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      backend.setItem(key, JSON.stringify(value));
    },

    remove(key) {
      backend.removeItem(key);
    },

    clear() {
      backend.clear();
    },
  };
}

/** Persistent storage (survives browser restarts). */
export const storage = createStore(window.localStorage);

/** Session-scoped storage (cleared when the tab closes). */
export const sessionStorage = createStore(window.sessionStorage);
