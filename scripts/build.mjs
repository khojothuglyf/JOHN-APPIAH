/* ============================================================
   PRODUCTION BUILD (Netlify)
   - Resolves the Supabase URL + anon key from the SUPABASE_URL /
     SUPABASE_ANON_KEY env vars (API_BASE_URL is kept for legacy
     REST compatibility and defaults to the Supabase origin).
   - Resolves the Spring Boot backend origin from BACKEND_API_URL
     (public, never a secret); when unset the backend-dependent
     services keep their local fallbacks.
   - Copies the static site into dist/ (excluding tests/, scripts/,
     .git, node_modules, ...).
   - Generates dist/js/api-config.js so the app talks to the
     configured Supabase + backend at runtime.
   Zero runtime dependencies.
   ============================================================ */

import {
  cpSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { injectSeoHead } from "./inject-head.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");

const API_BASE_URL = (process.env.API_BASE_URL || "").trim();
const BACKEND_API_URL = (process.env.BACKEND_API_URL || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const SITE_URL = (process.env.SITE_URL || "").trim();
const onNetlify = process.env.NETLIFY === "true" || Boolean(process.env.CONTEXT);

/* Local-development defaults (match the committed js/api-config.js). */
const DEV_SUPABASE_URL = "https://fqvbmbnxhnnronbbpklx.supabase.co";
const DEV_SUPABASE_KEY = "sb_publishable_qLsFlkxGrrRjmJIHjVxSDg_ovqZOEGu";

if (onNetlify && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.error(
    "Build failed: SUPABASE_URL and SUPABASE_ANON_KEY are required for Netlify builds."
  );
  console.error(
    "Set them in Site settings > Environment variables (or `netlify env:set <name> <value>`)."
  );
  process.exit(1);
}

const resolvedSupabaseUrl = SUPABASE_URL || DEV_SUPABASE_URL;
const resolvedAnonKey = SUPABASE_ANON_KEY || DEV_SUPABASE_KEY;
const resolvedApiBase = API_BASE_URL || resolvedSupabaseUrl;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "SUPABASE_URL / SUPABASE_ANON_KEY not set; using the local-development fallbacks."
  );
}

const EXCLUDES = new Set([
  ".git",
  "node_modules",
  "dist",
  "tests",
  "scripts",
  "supabase",
  ".gitignore",
  ".env",
  ".env.example",
  "netlify.toml",
]);

function copyTree(src, dest) {
  for (const entry of readdirSync(src)) {
    if (EXCLUDES.has(entry)) continue;
    const from = join(src, entry);
    const to = join(dest, entry);
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
copyTree(root, distDir);

const generatedConfig = `/* ============================================================
   GENERATED FILE - DO NOT EDIT.
   Created by scripts/build.mjs at deploy time from the
   SUPABASE_URL / SUPABASE_ANON_KEY / BACKEND_API_URL environment
   variables. The committed copy in js/ is the local development
   fallback.
   ============================================================ */

export const API_BASE_URL = ${JSON.stringify(resolvedApiBase)};

export const BACKEND_API_URL = ${JSON.stringify(BACKEND_API_URL)};

export const SUPABASE_URL = ${JSON.stringify(resolvedSupabaseUrl)};

export const SUPABASE_ANON_KEY = ${JSON.stringify(resolvedAnonKey)};
`;

writeFileSync(join(distDir, "js", "api-config.js"), generatedConfig);

generateSiteFiles(SITE_URL);
applySeo(SITE_URL);
regenerateServiceWorker();

console.log(`Build complete: dist/ ready for Netlify publish.`);
console.log(`Supabase URL: ${resolvedSupabaseUrl}`);
console.log(
  `Supabase anon key: ${SUPABASE_ANON_KEY ? "configured" : "local fallback"}`
);
console.log(
  `Backend API URL: ${BACKEND_API_URL || "unset (backend services keep local fallbacks)"}`
);

/* ------------------------------------------------------------
   robots.txt + sitemap.xml. sitemap needs SITE_URL (site domain).
   ------------------------------------------------------------ */
function generateSiteFiles(siteUrl) {
  const base = siteUrl ? siteUrl.replace(/\/+$/, "") : "";
  const robots = [
    "User-agent: *",
    "Allow: /",
    ...(base ? [`Sitemap: ${base}/sitemap.xml`] : []),
    "",
  ].join("\n");
  writeFileSync(join(distDir, "robots.txt"), robots);

  if (!base) {
    console.log("SEO: SITE_URL not set; sitemap.xml skipped (robots.txt still written).");
    return;
  }

  const pages = [];
  function walkPages(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkPages(full);
      else if (entry.endsWith(".html")) {
        const rel = relative(distDir, full).split(sep).join("/");
        if (
          rel !== "pages/offline.html" &&
          rel !== "pages/404.html" &&
          !rel.startsWith("components/")
        ) {
          pages.push(rel);
        }
      }
    }
  }
  walkPages(distDir);
  pages.sort();

  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .map((p) => {
      const loc = p === "index.html" ? `${base}/` : `${base}/${p}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  writeFileSync(join(distDir, "sitemap.xml"), xml);
  console.log(`SEO: sitemap.xml with ${pages.length} URLs`);
}

/* ------------------------------------------------------------
   Canonical + Open Graph meta injected into every dist HTML page
   when SITE_URL is configured.
   ------------------------------------------------------------ */
function applySeo(siteUrl) {
  if (!siteUrl) {
    console.log("SEO: SITE_URL not set; skipping canonical/og injection.");
    return;
  }
  const htmlFiles = [];
  function walkSeo(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkSeo(full);
      else if (entry.endsWith(".html")) htmlFiles.push(full);
    }
  }
  walkSeo(distDir);

  let count = 0;
  for (const file of htmlFiles) {
    const pagePath = relative(distDir, file).split(sep).join("/");
    const html = readFileSync(file, "utf8");
    const updated = injectSeoHead(html, pagePath, siteUrl);
    if (updated !== html) {
      writeFileSync(file, updated);
      count++;
    }
  }
  console.log(`SEO: injected canonical/og into ${count} pages (site ${siteUrl})`);
}

/* ------------------------------------------------------------
   Regenerate dist/service-worker.js with the exact list of files
   in the built tree (precache) and the resolved API origin, so
   prod caches match the real site and API requests are never
   cached.
   ------------------------------------------------------------ */
function regenerateServiceWorker() {
  const swPath = join(distDir, "service-worker.js");
  const swSource = readFileSync(swPath, "utf8");

  const distFiles = [];
  function walkDist(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walkDist(full);
      } else {
        const rel = "/" + relative(distDir, full).split(sep).join("/");
        if (rel !== "/service-worker.js") distFiles.push(rel);
      }
    }
  }
  walkDist(distDir);
  distFiles.sort();

  const precacheBlock = `/*__PRECACHE_BEGIN__*/
const PRECACHE_URLS = [
${distFiles.map((url) => `  ${JSON.stringify(url)}`).join(",\n")}
];
/*__PRECACHE_END__*/`;

  let apiOrigin;
  try {
    apiOrigin = new URL(BACKEND_API_URL || resolvedApiBase).origin;
  } catch {
    apiOrigin = BACKEND_API_URL || resolvedApiBase;
  }

  const swOut = swSource
    .replace(
      /\/\*__PRECACHE_BEGIN__\*\/[\s\S]*?\/\*__PRECACHE_END__\*\//,
      precacheBlock
    )
    .replace(
      /const API_ORIGIN = "[^"]*";/,
      `const API_ORIGIN = ${JSON.stringify(apiOrigin)};`
    );

  writeFileSync(swPath, swOut);
  console.log(
    `Service worker: ${distFiles.length} assets precached, API origin ${apiOrigin}`
  );
}
