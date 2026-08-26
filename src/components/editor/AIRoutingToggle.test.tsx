import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AIRoutingToggle from "./AIRoutingToggle";

describe("AIRoutingToggle", () => {
  it("uses automatic routing when the saved mode is missing", () => {
    render(<AIRoutingToggle mode={undefined} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /AI: تلقائي/i })).toBeInTheDocument();
  });
});
