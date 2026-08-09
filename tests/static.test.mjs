/* ============================================================
   PHASE 13 - STATIC INTEGRITY CHECKS
   Run: node tests/static.test.mjs

   Verifies without a browser:
   1. checkRefs    - every href/src in every HTML file resolves
                     to a real file when served from the project
                     root (components are treated as root-relative
                     because rewriteRelativeUrls prefixes them at
                     runtime).
   2. checkImports - every ES module import in js/ resolves.
   3. checkShell   - every page has navbar + footer placeholders,
                     the app bootstrap script and (for interactive
                     pages) its page script.
   4. checkCss     - every class used in static HTML exists in the
                     CSS, so layout styles are never orphaned.
   ============================================================ */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

const allFiles = [];
const IGNORED_DIRS = new Set(["dist", "node_modules"]);
function walk(dir, base = dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith(".")) continue;
    if (IGNORED_DIRS.has(entry) && isDir(full)) continue;
    if (isDir(full)) walk(full, base);
    else allFiles.push(full);
  }
}
walk(ROOT);

const htmlFiles = allFiles.filter((f) => f.endsWith(".html"));
const jsFiles = allFiles.filter((f) => f.endsWith(".js"));

let failures = 0;
const check = (cond, label) => {
  if (cond) console.log(`  ok: ${label}`);
  else {
    failures++;
    console.error(`FAIL: ${label}`);
  }
};

const isExternal = (ref) =>
  /^(https?:|mailto:|tel:|\/\/|\/|#|data:|javascript:)/.test(ref);

const clean = (ref) => ref.split(/[?#]/)[0];

/* ---- 1. Reference integrity ---------------------------------- */

console.log("\n[1] Reference integrity");
for (const file of htmlFiles) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const inComponents = rel.startsWith("components/");
  const inPages = rel.startsWith("pages/");
  const html = readFileSync(file, "utf8");

  const refs = [
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/(?:srcset)="([^"]+)"/g)]
      .flatMap((m) => m[1].split(","))
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean),
  ];

  for (const raw of refs) {
    if (isExternal(raw)) continue;
    const ref = clean(raw);
    if (!ref) continue;

    let resolved;
    if (inComponents) {
      /* Injected partial: links are rewritten to be root-relative. */
      resolved = join(ROOT, ref);
    } else {
      resolved = resolve(dirname(file), ref);
    }

    if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
      failures++;
      console.error(`FAIL: broken reference ${rel} -> ${raw}`);
    }
  }
}
check(true, "all HTML references resolve");

/* Component references must always point at root-level targets
   (index.html, pages/*, images/*, css/*, js/*). */
const ALLOWED_COMPONENT_TARGETS = [
  /^index\.html$/,
  /^pages\/[^/]+\.html$/,
  /^images\//,
  /^css\//,
  /^js\//,
  /^assets\//,
];
for (const file of htmlFiles.filter((f) => relative(ROOT, f).startsWith("components"))) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = clean(m[1]);
    if (!ref || isExternal(ref) || /^\.\.\//.test(ref)) continue;
    if (!ALLOWED_COMPONENT_TARGETS.some((re) => re.test(ref))) {
      failures++;
      console.error(`FAIL: component target outside root layout: ${rel} -> ${m[1]}`);
    }
  }
}
check(true, "component partials only reference root-relative targets");

/* ---- 2. Module import integrity ------------------------------ */

console.log("\n[2] ES module imports");
for (const file of jsFiles) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const code = readFileSync(file, "utf8");
  const imports = [
    ...[...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
    ...[...code.matchAll(/import\s+"([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const imp of imports) {
    if (/^(https?:|\/)/.test(imp)) continue;
    if (!/^\./.test(imp)) continue; /* bare specifier - external tooling */
    const resolved = resolve(dirname(file), imp);
    if (!existsSync(resolved)) {
      failures++;
      console.error(`FAIL: broken import ${rel} -> ${imp}`);
    }
  }
}
check(true, "all js imports resolve");

/* ---- 3. Page shell consistency ------------------------------- */

console.log("\n[3] Page shell");
const interactivePages = new Set(
  jsFiles
    .filter((f) => f.includes(`${sep}pages${sep}`) && f.endsWith(".js"))
    .map((f) => relative(ROOT, f).replace(/\\/g, "/").replace(/^js\/pages\//, "").replace(/\.js$/, ""))
);

for (const file of htmlFiles) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel.startsWith("components/")) continue; /* partials, not pages */
  const isIndex = rel === "index.html";
  const html = readFileSync(file, "utf8");

  check(
    html.includes('data-component="navbar"'),
    `${rel}: navbar placeholder`
  );
  check(
    html.includes('data-component="footer"'),
    `${rel}: footer placeholder`
  );

  const expectsAppScript = isIndex ? 'src="js/app.js"' : 'src="../js/app.js"';
  check(
    html.includes(expectsAppScript),
    `${rel}: app bootstrap script`
  );

  const name = rel.replace(/\.html$/, "");
  if (interactivePages.has(name)) {
    const pageScript = isIndex ? `js/pages/${name}.js` : `../js/pages/${name}.js`;
    check(
      html.includes(`src="${pageScript}"`),
      `${rel}: page script ${pageScript}`
    );
  }
}

/* ---- 4. CSS class coverage ----------------------------------- */

console.log("\n[4] CSS class coverage (static HTML)");
const cssText = allFiles
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const definedClasses = new Set(
  [...cssText.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1])
);

const usedClasses = new Set();
for (const file of htmlFiles.filter((f) => !relative(ROOT, f).startsWith("components"))) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/(?:class|data-icon)="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      usedClasses.add(cls);
    }
  }
}

/* Utility/state classes handled by JS or animation keyframes are
   allowed to be absent from a static CSS rule. */
const KNOWN_DYNAMIC = new Set([
  "is-active",
  "is-pop",
  "drawer--open",
  "dropdown--open",
  "site-header--scrolled",
  "animate-fade-in-up",
  "animate-scale-in",
  "animate-delay-1",
  "animate-delay-2",
  "animate-delay-3",
  "animate-delay-4",
  "hidden",
]);

let missingCss = 0;
for (const cls of [...usedClasses].sort()) {
  if (definedClasses.has(cls) || KNOWN_DYNAMIC.has(cls)) continue;
  if (/^u-/.test(cls) && cssText.includes(".u-")) continue;
  missingCss++;
  console.error(`  note: no static rule for ".${cls}"`);
}
check(missingCss === 0, `all ${usedClasses.size} HTML classes have CSS rules (${missingCss} uncovered)`);

console.log(
  failures === 0
    ? `\nSTATIC CHECKS PASSED (${htmlFiles.length} html, ${jsFiles.length} js)`
    : `\nSTATIC CHECKS FAILED: ${failures}`
);
process.exit(failures === 0 ? 0 : 1);
