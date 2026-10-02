import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { a11yViolations } from "@/test/a11y";
import Home from "./page";

describe("Home (accessibilité)", () => {
  it("has no WCAG violation detectable without layout", async () => {
    const { container } = render(<Home />);
    expect(await a11yViolations(container)).toEqual([]);
  });
});
