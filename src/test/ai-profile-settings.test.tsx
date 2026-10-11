import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEditorSettings } from "@/hooks/useEditorSettings";

describe("editor translation prompt profiles", () => {
  beforeEach(() => localStorage.clear());

  it("keeps legacy Xenoblade prompts intact while switching Golden Sun versions", async () => {
    localStorage.setItem("customPromptInstructions", "أوامر Xenoblade القديمة");
    localStorage.setItem("categoryPromptTemplates", '{"dialogue":"Xenoblade dialogue"}');

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.customPromptInstructions).toBe("أوامر Xenoblade القديمة");

    act(() => result.current.setActiveAiGameProfile("goldensun2"));
    await waitFor(() => expect(result.current.customPromptInstructions).toBe(""));
    act(() => result.current.setCustomPromptInstructions("أسلوب الجزء الثاني"));
    act(() => result.current.setCategoryPromptTemplate("dialogue", "حوارات Felix"));
    expect(result.current.customPromptInstructions).toBe("أسلوب الجزء الثاني");

    act(() => result.current.setActiveAiGameProfile("goldensun"));
    await waitFor(() => expect(result.current.customPromptInstructions).toBe(""));
    act(() => result.current.setCustomPromptInstructions("أسلوب الجزء الأول"));
    expect(result.current.categoryPromptTemplates.dialogue).toBeUndefined();

    act(() => result.current.setActiveAiGameProfile("goldensun2"));
    await waitFor(() => expect(result.current.customPromptInstructions).toBe("أسلوب الجزء الثاني"));
    expect(result.current.categoryPromptTemplates.dialogue).toBe("حوارات Felix");

    act(() => result.current.setActiveAiGameProfile("xenoblade"));
    await waitFor(() => expect(result.current.customPromptInstructions).toBe("أوامر Xenoblade القديمة"));
    expect(result.current.categoryPromptTemplates.dialogue).toBe("Xenoblade dialogue");
    expect(localStorage.getItem("customPromptInstructions")).toBe("أوامر Xenoblade القديمة");
  });
});
