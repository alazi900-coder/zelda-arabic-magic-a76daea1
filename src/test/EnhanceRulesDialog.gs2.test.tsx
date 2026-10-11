import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EnhanceRulesDialog } from "@/components/editor/EnhanceRulesDialog";
import { getProfileBuiltinRules, loadCustomRules, loadEnabledRules } from "@/lib/enhance-rules";

describe("Golden Sun II enhancement rules dialog", () => {
  beforeEach(() => localStorage.clear());

  it("adds a custom detection rule and preserves its enabled toggle after first save", () => {
    const onSaved = vi.fn();
    const { unmount } = render(
      <EnhanceRulesDialog open onOpenChange={vi.fn()} onSaved={onSaved} profile="goldensun2" />,
    );
    expect(screen.getByText(/Golden Sun: The Lost Age/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /إضافة قاعدة جديدة/ }));
    fireEvent.change(screen.getByPlaceholderText("مثل: حماية كلمات معيّنة"), {
      target: { value: "قواعد الحوارات الخاصة" },
    });
    fireEvent.change(screen.getByPlaceholderText(/مثل: 🚫/), {
      target: { value: "افحص ضمائر الشخصيات واحفظ أسماءها" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إضافة" }));
    expect(screen.getByText("قواعد الحوارات الخاصة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    const custom = loadCustomRules("goldensun2");
    expect(custom).toHaveLength(1);
    expect(loadEnabledRules("goldensun2").has(custom[0].id)).toBe(true);
    expect(onSaved).toHaveBeenCalledOnce();
    unmount();

    render(<EnhanceRulesDialog open onOpenChange={vi.fn()} profile="goldensun2" />);
    expect(screen.getByText("قواعد الحوارات الخاصة")).toBeInTheDocument();
  });

  it("switches off a GS2-only rule without affecting the others", () => {
    render(<EnhanceRulesDialog open onOpenChange={vi.fn()} profile="goldensun2" />);
    const rule = screen.getByText("Golden Sun II — طول الحوارات");
    const row = rule.closest("div.p-2\\.5");
    const toggle = row?.querySelector('[role="switch"]');
    expect(toggle).not.toBeNull();
    expect(toggle).toHaveAttribute("data-state", "checked");
    fireEvent.click(toggle!);
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    expect(loadEnabledRules("goldensun2").has("detect_gs2_line_fit")).toBe(false);
    expect(loadEnabledRules("goldensun2").has("detect_gs2_names_terms")).toBe(true);
    expect(getProfileBuiltinRules("goldensun").some(r => r.id === "detect_gs2_line_fit")).toBe(false);
  });
});
