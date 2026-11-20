import AxeBuilder from "@axe-core/playwright";
import { expect, test, type ElementHandle, type Page } from "@playwright/test";
import { ROUTES } from "./routes";

// WCAG 2.0 → 2.2, levels A and AA (RGAA 4.1.2 is built on WCAG 2.1 AA), plus axe's best
// practices (landmarks, heading order, page h1, skip link…), which map to RGAA 9 and 12.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const MAX_TAB_STOPS = 50;
// Focus indicator (WCAG 1.4.11, RGAA 10.7): the pixels that change when the element takes focus
// must contrast at least 3:1 with what was there before, over at least 1 CSS px. WCAG 2.4.13
// (AAA) would ask for 2 px.
const FOCUS_CONTRAST = 3;
const FOCUS_THICKNESS = 1;
// Outlines and rings are drawn outside the element: read this many CSS px around it.
const FOCUS_MARGIN = 8;
// A page may still replace its <main> or its h1 once loaded (data read on the client, as in an
// offline-first app). Within this budget, a script-focused target that changed while measured is
// measured again.
const SCRIPT_FOCUS_TIMEOUT = 10_000;
// Tagged so CI can run these specs in a separate, non-blocking job (kit var a11yGate=advisory).
const A11Y = { tag: "@a11y" };

type Box = { x: number; y: number; width: number; height: number };
type Radius = { x: number; y: number };
type Corners = { topLeft: Radius; topRight: Radius; bottomRight: Radius; bottomLeft: Radius };

async function wcagViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.map((n) => n.target.join(" ")),
  }));
}

// Freeze transitions so focus styles are read in their final state.
async function open(page: Page, route: string) {
  await page.goto(route);
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
}

// The element's box plus FOCUS_MARGIN, cut to the viewport; null when nothing of it is on screen.
function around(box: Box, viewport: { width: number; height: number }): Box | null {
  const x = Math.max(0, Math.floor(box.x - FOCUS_MARGIN));
  const y = Math.max(0, Math.floor(box.y - FOCUS_MARGIN));
  const right = Math.min(viewport.width, Math.ceil(box.x + box.width + FOCUS_MARGIN));
  const bottom = Math.min(viewport.height, Math.ceil(box.y + box.height + FOCUS_MARGIN));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

async function shot(page: Page, clip: Box) {
  const png = await page.screenshot({ clip, animations: "disabled", scale: "css" });
  return png.toString("base64");
}

// Runs in the page. Compares the focused and unfocused screenshots pixel by pixel, the way WCAG
// measures a focus indicator: outline, ring (box-shadow, even translucent), border, background or
// pseudo-element, as drawn over the real background. Returns the thickest band of pixels that
// change at `contrast` or more, read on scanlines across each side of the element, and the
// strongest change anywhere (for the report).
async function measureFocus(arg: {
  focused: string;
  blurred: string;
  el: Box;
  radii: Corners;
  contrast: number;
}) {
  const decode = async (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
      colorSpaceConversion: "none",
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d canvas");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const [focused, blurred] = await Promise.all([decode(arg.focused), decode(arg.blurred)]);
  const { width, height } = focused;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (d: Uint8ClampedArray, i: number) =>
    0.2126 * channel(d[i]!) + 0.7152 * channel(d[i + 1]!) + 0.0722 * channel(d[i + 2]!);
  const ratio = new Float32Array(width * height);
  let strongest = 1;
  for (let p = 0; p < ratio.length; p++) {
    const a = luminance(focused.data, p * 4);
    const b = luminance(blurred.data, p * 4);
    ratio[p] = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    strongest = Math.max(strongest, ratio[p]!);
  }
  // Longest run of contrasted pixels from (x, y), dx/dy at a time, `steps` pixels long.
  const run = (x: number, y: number, dx: number, dy: number, steps: number) => {
    let best = 0;
    let current = 0;
    for (let s = 0; s < steps; s++, x += dx, y += dy) {
      current = ratio[y * width + x]! >= arg.contrast ? current + 1 : 0;
      best = Math.max(best, current);
    }
    return best;
  };
  const median = (values: number[]) => values.sort((a, b) => a - b)[1]!;
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.round(v)));
  const cx = clamp(arg.el.x + arg.el.width / 2, width);
  const cy = clamp(arg.el.y + arg.el.height / 2, height);
  // Scanlines cross each side on its straight part, between the rounded corners: on a curve,
  // anti-aliasing spreads a 1 px border over fainter pixels. A fully rounded side shrinks to its
  // middle, where the curve is flat.
  const along = (from: number, start: number, end: number, max: number) =>
    [0.25, 0.5, 0.75].map((f) => clamp(from + start + Math.max(0, end - start) * f, max));
  const { topLeft, topRight, bottomRight, bottomLeft } = arg.radii;
  const { x: left, y: top, width: w, height: h } = arg.el;
  const topColumns = along(left, topLeft.x, w - topRight.x, width);
  const bottomColumns = along(left, bottomLeft.x, w - bottomRight.x, width);
  const leftRows = along(top, topLeft.y, h - bottomLeft.y, height);
  const rightRows = along(top, topRight.y, h - bottomRight.y, height);
  // Each side is scanned from the edge of the screenshot to the element's centre.
  const sides = [
    median(topColumns.map((x) => run(x, 0, 0, 1, cy + 1))),
    median(bottomColumns.map((x) => run(x, height - 1, 0, -1, height - cy))),
    median(leftRows.map((y) => run(0, y, 1, 0, cx + 1))),
    median(rightRows.map((y) => run(width - 1, y, -1, 0, width - cx))),
  ];
  return { thickness: Math.max(...sides), strongest: Math.round(strongest * 100) / 100 };
}

// Runs in the page: how the report names the element.
function label(el: HTMLElement) {
  const name =
    el.getAttribute("aria-label") ||
    (el as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
    el.textContent?.trim().slice(0, 40) ||
    el.tagName;
  return `${el.tagName}:${name}`;
}

// Runs in the page: the element's box and its corner radii as drawn (CSS scales them down together
// when they overlap, as with rounded-full).
function geometry(el: HTMLElement) {
  const { x, y, width, height } = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const corner = (name: string) => {
    const [rx = 0, ry = rx] = style
      .getPropertyValue(`border-${name}-radius`)
      .split(" ")
      .map(parseFloat);
    return { x: rx, y: ry };
  };
  const topLeft = corner("top-left");
  const topRight = corner("top-right");
  const bottomRight = corner("bottom-right");
  const bottomLeft = corner("bottom-left");
  const fit = (size: number, sum: number) => (sum > 0 ? size / sum : 1);
  const scale = Math.min(
    1,
    fit(width, topLeft.x + topRight.x),
    fit(width, bottomLeft.x + bottomRight.x),
    fit(height, topLeft.y + bottomLeft.y),
    fit(height, topRight.y + bottomRight.y),
  );
  const scaled = (r: Radius) => ({ x: r.x * scale, y: r.y * scale });
  return {
    box: { x, y, width, height },
    radii: {
      topLeft: scaled(topLeft),
      topRight: scaled(topRight),
      bottomRight: scaled(bottomRight),
      bottomLeft: scaled(bottomLeft),
    },
  };
}

// Indicator of the focused element: screenshots it focused then blurred, and compares them
// (measureFocus). Leaves it focused. Null when nothing of it is on screen.
async function focusIndicator(page: Page, element: ElementHandle<HTMLElement>) {
  const { box, radii } = await element.evaluate(geometry);
  const clip = around(box, page.viewportSize() ?? { width: 1280, height: 720 });
  if (!clip) return null;
  const focused = await shot(page, clip);
  await element.evaluate((el) => el.blur());
  const blurred = await shot(page, clip);
  // Refocusing keeps the keyboard modality: :focus-visible still applies and Tab goes on.
  await element.evaluate((el) => el.focus());
  const el = { ...box, x: box.x - clip.x, y: box.y - clip.y };
  return page.evaluate(measureFocus, { focused, blurred, el, radii, contrast: FOCUS_CONTRAST });
}

// A target that only a script focuses (tabindex="-1": heading after an in-page link or an action,
// status message) is never a tab stop. The page's h1 when it is one, otherwise a probe at the top
// of <main> that only the global focus ring styles.
function scriptTarget(page: Page) {
  return page.evaluateHandle(() => {
    const heading = document.querySelector<HTMLElement>('h1[tabindex="-1"]');
    if (heading) return heading;
    // The probe of a previous attempt, when the page kept it.
    document.querySelector("[data-claude-kit-probe]")?.remove();
    const probe = document.createElement("p");
    probe.dataset.claudeKitProbe = "";
    probe.tabIndex = -1;
    probe.textContent = "claude-kit focus probe";
    probe.style.width = "max-content";
    (document.querySelector("main") ?? document.body).prepend(probe);
    return probe;
  });
}

// Runs in the page: what must not change while the target is measured. Null once the page has
// removed it (React unmounting the <main> it was in).
function targetState(el: HTMLElement) {
  if (!el.isConnected) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  return JSON.stringify([el.textContent, x, y, width, height]);
}

// Focuses the script target and measures its indicator. When the page replaced the target, its
// text or its place in the meantime, the screenshots show another element, or none: the attempt
// does not count and starts over.
async function scriptFocus(page: Page) {
  const deadline = Date.now() + SCRIPT_FOCUS_TIMEOUT;
  for (let attempt = 1; ; attempt++) {
    const target = await scriptTarget(page);
    await target.evaluate((el) => el.focus());
    const before = await target.evaluate(targetState);
    const id = await target.evaluate(label);
    const visible = await target.evaluate((el) => el.matches(":focus-visible"));
    const indicator = await focusIndicator(page, target);
    if (before !== null && (await target.evaluate(targetState)) === before) {
      return { id, visible, indicator };
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `script-focused target ${id}: replaced or changed by the page while measured, ${attempt} attempt(s) in ${SCRIPT_FOCUS_TIMEOUT} ms`,
      );
    }
  }
}

for (const route of ROUTES) {
  test.describe(`a11y ${route}`, A11Y, () => {
    test("no WCAG 2.2 AA violation (axe)", async ({ page }) => {
      await open(page, route);
      expect(await wcagViolations(page)).toEqual([]);
    });

    test("reflows at 320 px without horizontal scroll (WCAG 1.4.10, RGAA 10.11)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await wcagViolations(page)).toEqual([]);
    });

    test("has lang, a title and a coherent heading outline (RGAA 8.3, 8.5, 9.1)", async ({
      page,
    }) => {
      await open(page, route);
      await expect(page.locator("html")).toHaveAttribute("lang", /\S/);
      expect((await page.title()).trim()).not.toBe("");
      const levels = await page
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
      expect(
        levels.filter((level) => level === 1),
        "exactly one h1",
      ).toHaveLength(1);
      const skips = levels.filter((level, i) => i > 0 && level > (levels[i - 1] ?? 0) + 1);
      expect(skips, `heading levels skipped in ${levels.join(" > ")}`).toEqual([]);
    });

    test("every keyboard focus stop shows a contrasted indicator (WCAG 2.4.7, 1.4.11, RGAA 10.7)", async ({
      page,
    }) => {
      await open(page, route);
      const faint: string[] = [];
      for (let i = 0; i < MAX_TAB_STOPS; i++) {
        await page.keyboard.press("Tab");
        const element = (
          await page.evaluateHandle(() => document.activeElement as HTMLElement | null)
        ).asElement();
        const visited = await element?.evaluate((el) => {
          if (el === document.body || el.dataset.a11yVisited) return true;
          el.dataset.a11yVisited = "true";
          return false;
        });
        // Focus left the page or came back to a visited element: all covered.
        if (!element || visited) break;
        const id = await element.evaluate(label);
        const indicator = await focusIndicator(page, element);
        if (!indicator) {
          faint.push(`${id}: off screen`);
        } else if (indicator.thickness < FOCUS_THICKNESS) {
          faint.push(
            `${id}: ${indicator.thickness} px at ${FOCUS_CONTRAST}:1 (strongest change ${indicator.strongest}:1)`,
          );
        }
      }
      // Missing (outline-none), too faint (translucent ring), too thin, or hidden under another
      // element (sticky header, WCAG 2.4.11).
      expect(
        faint,
        `focus indicators under ${FOCUS_CONTRAST}:1 over ${FOCUS_THICKNESS} px`,
      ).toEqual([]);
    });

    test("a script-focused target shows a contrasted indicator (WCAG 2.4.7, 1.4.11, RGAA 10.7)", async ({
      page,
    }) => {
      await open(page, route);
      // A keyboard user acts, then a script moves the focus.
      await page.keyboard.press("Tab");
      const { id, visible, indicator } = await scriptFocus(page);
      expect(visible, `${id} matches :focus-visible`).toBe(true);
      const found = indicator
        ? `${indicator.thickness} px at ${FOCUS_CONTRAST}:1 (strongest change ${indicator.strongest}:1)`
        : "off screen";
      // Missing (outline-none), or the browser's default outline left translucent by shadcn
      // (outline-ring/50) when the global focus ring does not cover [tabindex="-1"].
      expect(
        indicator?.thickness ?? 0,
        `script-focused target ${id}: ${found}`,
      ).toBeGreaterThanOrEqual(FOCUS_THICKNESS);
    });
  });
}

test("page titles are unique (RGAA 8.6)", A11Y, async ({ page }) => {
  const titles: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    titles.push(await page.title());
  }
  expect(new Set(titles).size, titles.join(" / ")).toBe(titles.length);
});

// The 404 is a page template too, and the one nobody looks at.
test("404 page has no WCAG 2.2 AA violation (axe)", A11Y, async ({ page }) => {
  const response = await page.goto("/__claude-kit-a11y-not-found");
  expect(response?.status()).toBe(404);
  expect(await wcagViolations(page)).toEqual([]);
});
