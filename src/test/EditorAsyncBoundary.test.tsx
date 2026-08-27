import { lazy } from "react";
import { act, render, screen } from "@testing-library/react";
import EditorAsyncBoundary from "@/components/editor/EditorAsyncBoundary";

describe("EditorAsyncBoundary", () => {
  it("يعرض حالة انتظار صغيرة ثم الأداة بعد اكتمال تحميلها", async () => {
    let resolvePanel: ((value: { default: React.ComponentType }) => void) | undefined;
    const pendingPanel = new Promise<{ default: React.ComponentType }>((resolve) => {
      resolvePanel = resolve;
    });
    const DeferredPanel = lazy(() => pendingPanel);

    render(
      <EditorAsyncBoundary label="أداة اختبار">
        <DeferredPanel />
      </EditorAsyncBoundary>,
    );

    expect(screen.getByRole("status", { name: "جارٍ تحميل أداة اختبار" })).toBeInTheDocument();

    await act(async () => {
      resolvePanel?.({ default: () => <p>الأداة جاهزة</p> });
    });

    expect(await screen.findByText("الأداة جاهزة")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "جارٍ تحميل أداة اختبار" })).not.toBeInTheDocument();
  });
});
