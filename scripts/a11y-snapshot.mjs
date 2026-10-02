#!/usr/bin/env node
// claude-kit — extracts what a RGAA/WCAG auditor looks at on one page, as JSON, for
// /claude-kit:a11y-audit to judge. Runs with the project's own Playwright + axe (run it from the
// project root; the page must be served, e.g. `pnpm dev`).
//
//   node a11y-snapshot.mjs <url> [--out file.json]

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MAX_TAB_STOPS = 80;

async function importFromProject(name) {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const mod = await import(pathToFileURL(require.resolve(name)).href);
  return mod.default ?? mod;
}

const [url, ...rest] = process.argv.slice(2);
const outIndex = rest.indexOf("--out");
const out = outIndex === -1 ? null : rest[outIndex + 1];
if (!url) {
  console.error("usage : a11y-snapshot.mjs <url> [--out file.json]");
  process.exit(1);
}

let chromium;
let AxeBuilder;
try {
  ({ chromium } = await importFromProject("@playwright/test"));
  const axe = await importFromProject("@axe-core/playwright");
  AxeBuilder = axe.AxeBuilder ?? axe.default ?? axe;
} catch {
  console.error(
    "a11y-snapshot : @playwright/test et @axe-core/playwright doivent être installés dans le " +
      "projet (module playwright du kit), et Chromium via `pnpm exec playwright install chromium`.",
  );
  process.exit(1);
}

const browser = await chromium.launch();
try {
  // @axe-core/playwright requires a page from an explicit context (not browser.newPage()).
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  const summarize = (list) =>
    list.map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      wcag: v.tags.filter((t) => /^wcag\d/.test(t)),
      nodes: v.nodes.slice(0, 10).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 200) })),
    }));
  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const structure = await page.evaluate(() => {
    const text = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const labelOf = (el) => {
      const labelledby = el.getAttribute("aria-labelledby");
      if (labelledby) {
        return labelledby
          .split(/\s+/)
          .map((id) => text(document.getElementById(id) ?? document.createElement("x")))
          .join(" ");
      }
      return el.getAttribute("aria-label") ?? [...(el.labels ?? [])].map(text).join(" ") ?? "";
    };
    const describedBy = (el) =>
      (el.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => text(document.getElementById(id) ?? document.createElement("x")))
        .join(" ");
    return {
      title: document.title,
      lang: document.documentElement.getAttribute("lang"),
      headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")].map((h) => ({
        level: Number(h.getAttribute("aria-level") ?? h.tagName[1]),
        text: text(h),
      })),
      images: [...document.querySelectorAll("img, svg, [role=img], input[type=image]")].map(
        (el) => ({
          tag: el.tagName.toLowerCase(),
          src: el.getAttribute("src"),
          alt: el.getAttribute("alt"),
          role: el.getAttribute("role"),
          ariaLabel: labelOf(el) || null,
          ariaHidden: el.closest("[aria-hidden=true]") !== null,
          inLinkOrButton: el.closest("a,button") !== null,
        }),
      ),
      links: [...document.querySelectorAll("a")].map((a) => ({
        text: text(a),
        accessibleName: labelOf(a) || text(a),
        href: a.getAttribute("href"),
        target: a.getAttribute("target"),
      })),
      buttons: [...document.querySelectorAll("button,[role=button]")].map((b) => ({
        accessibleName: labelOf(b) || text(b),
        type: b.getAttribute("type"),
      })),
      formFields: [...document.querySelectorAll("input,select,textarea")]
        .filter((f) => f.type !== "hidden")
        .map((f) => ({
          tag: f.tagName.toLowerCase(),
          type: f.getAttribute("type"),
          name: f.getAttribute("name"),
          label: labelOf(f),
          placeholder: f.getAttribute("placeholder"),
          required: f.required || f.getAttribute("aria-required") === "true",
          invalid: f.getAttribute("aria-invalid"),
          describedBy: describedBy(f),
          autocomplete: f.getAttribute("autocomplete"),
          inFieldset: f.closest("fieldset") !== null,
        })),
      positiveTabindex: [...document.querySelectorAll("[tabindex]")]
        .filter((el) => Number(el.getAttribute("tabindex")) > 0)
        .map((el) => el.outerHTML.slice(0, 120)),
    };
  });

  const accessibilityTree = await page.locator("body").ariaSnapshot();

  // Keyboard walk: order of focus stops and whether each one shows a visible indicator.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  const tabOrder = [];
  for (let i = 0; i < MAX_TAB_STOPS; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.dataset.a11yVisited) return null;
      el.dataset.a11yVisited = "true";
      const read = () => {
        const s = getComputedStyle(el);
        // An outline with style "none" is invisible whatever its reported width/colour.
        const outline =
          s.outlineStyle === "none" || s.outlineWidth === "0px"
            ? "none"
            : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
        return [outline, s.boxShadow, s.borderColor, s.backgroundColor, s.color,
          s.textDecorationLine].join("|");
      };
      const focused = read();
      el.blur();
      const blurred = read();
      el.focus();
      const r = el.getBoundingClientRect();
      return {
        element: `${el.tagName.toLowerCase()} « ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 50)} »`,
        focusVisible: focused !== blurred,
        size: `${Math.round(r.width)}×${Math.round(r.height)}`,
        onScreen: r.width > 0 && r.height > 0,
      };
    });
    if (!stop) break;
    tabOrder.push(stop);
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(url, { waitUntil: "networkidle" });
  const reflowOverflowPx = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const axeMobile = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "networkidle" });
  const animatedUnderReducedMotion = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.animationName !== "none" && s.animationDuration !== "0s";
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );

  const snapshot = {
    url,
    generatedAt: new Date().toISOString(),
    ...structure,
    axe: {
      violations: summarize(axe.violations),
      incomplete: summarize(axe.incomplete),
      violationsAt320px: summarize(axeMobile.violations),
    },
    reflowOverflowPx,
    animatedUnderReducedMotion,
    tabOrder,
    accessibilityTree,
  };
  const json = JSON.stringify(snapshot, null, 2);
  if (out) {
    fs.writeFileSync(out, json);
    console.log(`a11y-snapshot : écrit dans ${out}`);
  } else console.log(json);
} finally {
  await browser.close();
}
