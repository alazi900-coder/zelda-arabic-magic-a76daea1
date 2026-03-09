import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaginationControls from "@/components/editor/PaginationControls";

describe("PaginationControls", () => {
  const setCurrentPage = vi.fn();

  it("renders nothing when totalPages <= 1", () => {
    const { container } = render(
      <PaginationControls currentPage={0} totalPages={1} totalItems={5} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders page info correctly", () => {
    render(
      <PaginationControls currentPage={2} totalPages={5} totalItems={50} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  it("disables previous button on first page", () => {
    render(
      <PaginationControls currentPage={0} totalPages={3} totalItems={30} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons.find(b => b.textContent?.includes("السابق"));
    expect(prevBtn).toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(
      <PaginationControls currentPage={2} totalPages={3} totalItems={30} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    const buttons = screen.getAllByRole("button");
    const nextBtn = buttons.find(b => b.textContent?.includes("التالي"));
    expect(nextBtn).toBeDisabled();
  });

  it("calls setCurrentPage on next click", () => {
    setCurrentPage.mockClear();
    render(
      <PaginationControls currentPage={0} totalPages={3} totalItems={30} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    const nextBtn = screen.getAllByRole("button").find(b => b.textContent?.includes("التالي"));
    fireEvent.click(nextBtn!);
    expect(setCurrentPage).toHaveBeenCalledTimes(1);
    // Verify the updater function increments
    const updater = setCurrentPage.mock.calls[0][0];
    expect(updater(0)).toBe(1);
  });

  it("calls setCurrentPage on previous click", () => {
    setCurrentPage.mockClear();
    render(
      <PaginationControls currentPage={2} totalPages={3} totalItems={30} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    const prevBtn = screen.getAllByRole("button").find(b => b.textContent?.includes("السابق"));
    fireEvent.click(prevBtn!);
    expect(setCurrentPage).toHaveBeenCalledTimes(1);
    const updater = setCurrentPage.mock.calls[0][0];
    expect(updater(2)).toBe(1);
  });

  it("clamps page within bounds", () => {
    setCurrentPage.mockClear();
    render(
      <PaginationControls currentPage={0} totalPages={3} totalItems={30} pageSize={10} setCurrentPage={setCurrentPage} />
    );
    // Click prev on first page (button disabled, but test the updater logic)
    const nextBtn = screen.getAllByRole("button").find(b => b.textContent?.includes("التالي"));
    fireEvent.click(nextBtn!);
    const updater = setCurrentPage.mock.calls[0][0];
    // Should not exceed totalPages - 1
    expect(updater(2)).toBe(2); // min(2, 2) = 2
  });
});
