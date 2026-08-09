/* ============================================================
   HEAD INJECTOR
   Idempotent helpers that insert PWA and SEO meta blocks into
   HTML <head>. Both blocks are guarded by marker comments, so
   re-running never duplicates them.

   CLI:
     node scripts/inject-head.mjs           # add PWA meta to source HTML
     node scripts/inject-head.mjs --seo     # add SEO meta (SITE_URL required)

   scripts/build.mjs also applies the SEO block to dist/ when the
   SITE_URL environment variable is configured at build time.
   ============================================================ */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PWA_MARKER = "<!-- PWA-META -->";
export const SEO_MARKER = "<!-- SEO-META -->";

export const PWA_BLOCK = `    <!-- PWA-META -->
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#2f6fed" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="TradeSphere" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=ts-2" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="TradeSphere" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />`;

export function injectPwaHead(html) {
  if (html.includes(PWA_MARKER)) return html;
  return html.replace("</head>", `${PWA_BLOCK}\n  </head>`);
}

export function seoBlockFor(pagePath, siteUrl) {
  const base = siteUrl.replace(/\/+$/, "");
  const url = pagePath === "index.html" ? `${base}/` : `${base}/${pagePath}`;
  return `    <!-- SEO-META -->
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="TradeSphere - Shop Smart, Live Better" />
    <meta property="og:description" content="A modern e-commerce marketplace connecting buyers and trusted sellers." />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="TradeSphere" />`;
}

export function injectSeoHead(html, pagePath, siteUrl) {
  if (html.includes(SEO_MARKER)) return html;
  return html.replace("</head>", `${seoBlockFor(pagePath, siteUrl)}\n  </head>`);
}

/* ---- CLI runner ------------------------------------------ */
import { resolve } from "node:path";

const SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const withSeo = process.argv.includes("--seo");
  const siteUrl = (process.env.SITE_URL || "").trim();
  if (withSeo && !siteUrl) {
    console.error("SITE_URL is required for --seo.");
    process.exit(1);
  }

  const root = join(SELF, "..", "..");
  const skipDirs = new Set([".git", "dist", "tests", "scripts", "node_modules"]);
  const changed = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!skipDirs.has(entry)) walk(full);
        continue;
      }
      if (!entry.endsWith(".html")) continue;
      let html = readFileSync(full, "utf8");
      const before = html;
      html = injectPwaHead(html);
      if (withSeo) {
        const pagePath = relative(root, full).split(sep).join("/");
        html = injectSeoHead(html, pagePath, siteUrl);
      }
      if (html !== before) {
        writeFileSync(full, html);
        changed.push(relative(root, full).split(sep).join("/"));
      }
    }
  }
  walk(root);
  console.log(
    changed.length
      ? `Updated ${changed.length} file(s):\n  ${changed.join("\n  ")}`
      : "No changes needed."
  );
}
