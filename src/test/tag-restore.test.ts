import { describe, it, expect } from "vitest";
import {
  restoreLineBreaks,
  restoreTagsAndLineBreaks,
  normalizeLineBreakRepresentations,
  scanTranslationsForRestore,
  buildRestoreUpdates,
  smartReorderTags,
  buildSmartReorderUpdates,
  stripHallucinatedTagBrackets,
} from "@/lib/tag-restore";

describe("normalizeLineBreakRepresentations", () => {
  it("converts <br>, <br/>, <br /> to real newlines", () => {
    expect(normalizeLineBreakRepresentations("a<br>b<br/>c<br />d")).toBe("a\nb\nc\nd");
    expect(normalizeLineBreakRepresentations("a<BR>b")).toBe("a\nb");
  });
  it("converts literal backslash-n to real newline", () => {
    expect(normalizeLineBreakRepresentations("a\\nb\\nc")).toBe("a\nb\nc");
  });
  it("normalizes CRLF and CR to LF", () => {
    expect(normalizeLineBreakRepresentations("a\r\nb\rc")).toBe("a\nb\nc");
  });
  it("leaves real \\n untouched", () => {
    expect(normalizeLineBreakRepresentations("a\nb")).toBe("a\nb");
  });
});

describe("restoreLineBreaks", () => {
  it("returns translation unchanged when both have same line count", () => {
    const original = "Line one\nLine two";
    const translation = "السطر الأول\nالسطر الثاني";
    expect(restoreLineBreaks(original, translation)).toBe(translation);
  });

  it("returns translation unchanged when original has a single line", () => {
    expect(restoreLineBreaks("Hello world", "مرحبا بالعالم")).toBe("مرحبا بالعالم");
  });

  it("splits merged translation back into the expected number of lines", () => {
    const original = "First sentence.\nSecond sentence.";
    const translation = "الجملة الأولى. الجملة الثانية.";
    const out = restoreLineBreaks(original, translation);
    expect(out.split("\n").length).toBe(2);
  });

  it("splits at punctuation when AI dropped newlines", () => {
    const original = "Press A to confirm.\nPress B to cancel.";
    const translation = "اضغط A للتأكيد، اضغط B للإلغاء";
    const out = restoreLineBreaks(original, translation);
    expect(out.split("\n").length).toBe(2);
    expect(out.split("\n")[0]).toMatch(/تأكيد/);
  });

  it("converts <br> and \\n literals even when partially split", () => {
    const original = "A\nB";
    const translation = "أ<br>ب";
    const out = restoreLineBreaks(original, translation);
    expect(out).toBe("أ\nب");
  });

  it("rebuilds partially split translations to match the original line count", () => {
    const original = "A\nB\nC";
    const translation = "أ\nب ج";
    const out = restoreLineBreaks(original, translation);
    expect(out.split("\n").length).toBe(3);
  });

  it("handles 3-line originals merged into one", () => {
    const original = "One.\nTwo.\nThree.";
    const translation = "واحد. اثنان. ثلاثة.";
    const out = restoreLineBreaks(original, translation);
    expect(out.split("\n").length).toBe(3);
  });

  it("preserves PUA tags through the split", () => {
    const original = "Press \uE000.\nDone.";
    const translation = "اضغط \uE000. تم.";
    const out = restoreLineBreaks(original, translation);
    expect(out.split("\n").length).toBe(2);
    expect(out).toContain("\uE000");
  });
});

describe("restoreTagsAndLineBreaks (composite)", () => {
  it("restores both missing PUA markers and missing line breaks", () => {
    const original = "Press \uE000 to confirm.\nPress \uE001 to cancel.";
    const translation = "اضغط للتأكيد. اضغط للإلغاء.";
    const out = restoreTagsAndLineBreaks(original, translation);
    expect(out).toContain("\uE000");
    expect(out).toContain("\uE001");
    expect(out.split("\n").length).toBe(2);
  });

  it("leaves clean translations untouched", () => {
    const original = "Hello world";
    const translation = "مرحبا بالعالم";
    expect(restoreTagsAndLineBreaks(original, translation)).toBe(translation);
  });

  it("handles empty translation safely", () => {
    expect(restoreTagsAndLineBreaks("Hello \uE000", "")).toBe("");
  });

  it("normalizes <br> and literal \\n before restoring tags", () => {
    const original = "A\nB \uE000";
    const translation = "أ<br>ب";
    const out = restoreTagsAndLineBreaks(original, translation);
    expect(out.split("\n").length).toBe(2);
    expect(out).toContain("\uE000");
  });

  it("does not double-insert tags that are already present", () => {
    const original = "Hello \uE000 world \uE001";
    const translation = "مرحبا \uE000 عالم \uE001";
    const out = restoreTagsAndLineBreaks(original, translation);
    const e000Count = (out.match(/\uE000/g) || []).length;
    const e001Count = (out.match(/\uE001/g) || []).length;
    expect(e000Count).toBe(1);
    expect(e001Count).toBe(1);
  });
});

describe("stripHallucinatedTagBrackets", () => {
  it("removes [Color:Red] hallucinated by AI next to a PUA marker", () => {
    // مطابق تماماً لسيناريو الصورة الأولى: AI أضاف [Color:Red][Icon:Heart] قبل PUA.
    const input = "[Color:Red][Icon:Heart]\uE000\uE001*تنهيدة* أظن أن الانتظار لا طائل منه.";
    const out = stripHallucinatedTagBrackets(input);
    expect(out).toBe("\uE000\uE001*تنهيدة* أظن أن الانتظار لا طائل منه.");
  });

  it("removes multiple consecutive hallucinated brackets", () => {
    const input = "[Color:Red][Icon:Heart][Sound:bell]النص العربي";
    expect(stripHallucinatedTagBrackets(input)).toBe("النص العربي");
  });

  it("removes single-word ASCII tags like [NPC_Name] or [Heart]", () => {
    expect(stripHallucinatedTagBrackets("[NPC_Name] قال مرحبا")).toBe(" قال مرحبا");
    expect(stripHallucinatedTagBrackets("احذر من [Heart] هنا")).toBe("احذر من  هنا");
  });

  it("removes [Wait:1.0] and similar timing tags", () => {
    expect(stripHallucinatedTagBrackets("نص [Wait:1.0] آخر")).toBe("نص  آخر");
  });

  it("preserves TAG_N placeholders verbatim", () => {
    const input = "TAG_0 مرحبا TAG_1 وداعا";
    expect(stripHallucinatedTagBrackets(input)).toBe(input);
  });

  it("preserves bracketed Arabic content like [ملاحظة]", () => {
    const input = "[ملاحظة] هذا نصّ مهمّ";
    expect(stripHallucinatedTagBrackets(input)).toBe(input);
  });

  it("preserves mixed Arabic+English bracketed content (Arabic dominant)", () => {
    const input = "[ملاحظة 1]";
    expect(stripHallucinatedTagBrackets(input)).toBe(input);
  });

  it("does not touch PUA markers outside brackets", () => {
    const input = "\uE000\uE001 نصّ عاديّ \uE002";
    expect(stripHallucinatedTagBrackets(input)).toBe(input);
  });

  it("returns empty/undefined safely", () => {
    expect(stripHallucinatedTagBrackets("")).toBe("");
  });

  it("doesn't strip brackets containing digits-only (e.g. [0], [12])", () => {
    // الأرقام البحتة غير مطابقة لنمط الوسم لأنّ النمط يبدأ بحرف.
    expect(stripHallucinatedTagBrackets("[0] الأول")).toBe("[0] الأول");
    expect(stripHallucinatedTagBrackets("[42] العنصر")).toBe("[42] العنصر");
  });

  it("works inside restoreTagsAndLineBreaks pipeline (end-to-end)", () => {
    // مطابق تماماً للصورة الأولى: الأصل فيه وسوم PUA، AI أعاد ترجمة مع [Color:Red][Icon:Heart]
    // إضافيّة، يجب أن تختفي الأقواس قبل وضع وسوم PUA في مواقعها النسبيّة.
    const original = "\uE000\uE001*sigh* I guess waiting for anything is useless.";
    const aiOutput = "[Color:Red][Icon:Heart]*تنهيدة* أظن أن الانتظار لا طائل منه.";
    const out = restoreTagsAndLineBreaks(original, aiOutput);
    expect(out).not.toMatch(/\[Color:Red\]/);
    expect(out).not.toMatch(/\[Icon:Heart\]/);
    expect(out).toContain("\uE000");
    expect(out).toContain("\uE001");
    expect(out).toContain("*تنهيدة*");
  });

  it("works for screenshot-2 pattern: PUA at start with mangled brackets", () => {
    const original = "\uE000You put the baby leviathan fossil...";
    const aiOutput = "اللقد أعدت تجميع... [Color:Red][Icon:Heart] رائع جدا!";
    const out = restoreTagsAndLineBreaks(original, aiOutput);
    expect(out).not.toMatch(/\[Color:Red\]/);
    expect(out).not.toMatch(/\[Icon:Heart\]/);
    expect(out).toContain("\uE000");
    expect(out).toContain("رائع جدا!");
  });
});

describe("scanTranslationsForRestore — auto vs review classification", () => {
  const entries = [
    { msbtFile: "F1.msbt", index: 0, label: "a", original: "Press \uE000 to start.\nGo." },
    { msbtFile: "F1.msbt", index: 1, label: "b", original: "Hello \uE001" },
    { msbtFile: "F2.msbt", index: 0, label: "c", original: "Clean" },
  ];

  it("flags entries that lose tags or line breaks as auto-fixable", () => {
    const translations = {
      "F1.msbt:0": "اضغط للبدء. اذهب.",
      "F1.msbt:1": "مرحبا",
      "F2.msbt:0": "نظيف",
    };
    const report = scanTranslationsForRestore(entries, translations);
    expect(report.scanned).toBe(3);
    expect(report.autoFixable).toBe(2);
    expect(report.needsReview).toBe(0);
    expect(report.byFile["F1.msbt"]).toBe(2);
    expect(report.byFile["F2.msbt"]).toBeUndefined();
    expect(report.autoExamples.length).toBeGreaterThan(0);
    expect(report.fixable).toBe(2);
  });

  it("returns zero for already-clean translations", () => {
    const translations = {
      "F1.msbt:0": "اضغط \uE000 للبدء.\nاذهب.",
      "F1.msbt:1": "مرحبا \uE001",
      "F2.msbt:0": "نظيف",
    };
    const report = scanTranslationsForRestore(entries, translations);
    expect(report.autoFixable).toBe(0);
    expect(report.needsReview).toBe(0);
  });

  it("skips empty translations", () => {
    const translations = { "F1.msbt:0": "", "F1.msbt:1": "   " };
    const report = scanTranslationsForRestore(entries, translations);
    expect(report.scanned).toBe(0);
    expect(report.autoFixable).toBe(0);
    expect(report.needsReview).toBe(0);
  });

  it("flags partial line-count mismatches as auto-fixable", () => {
    // الأصل 3 أسطر، الترجمة 2 أسطر → تُعاد فواصل الأسطر تلقائياً حسب وزن أسطر الأصل.
    const e = [{ msbtFile: "F.msbt", index: 0, label: "x", original: "A\nB\nC" }];
    const t = { "F.msbt:0": "أ\nب ج" };
    const report = scanTranslationsForRestore(e, t);
    expect(report.autoFixable).toBe(1);
    expect(report.needsReview).toBe(0);
    expect(report.autoExamples[0].reasons.missingLineBreaksPartial).toBeGreaterThan(0);
    expect(report.autoExamples[0].reasons.missingLineBreaksAuto).toBe(0);
  });

  it("flags tag-identity mismatches as auto-fixable even when counts match", () => {
    // نفس عدد الرموز ولكنّ القيم مختلفة → تُعاد الرموز من الأصل تلقائياً.
    const e = [{ msbtFile: "F.msbt", index: 0, label: "x", original: "Press \uE001 \uE002" }];
    const t = { "F.msbt:0": "اضغط \uE034 \uE002" };
    const report = scanTranslationsForRestore(e, t);
    expect(report.autoFixable).toBe(1);
    expect(report.needsReview).toBe(0);
    expect(report.autoExamples[0].reasons.changedTagPositions).toBeGreaterThan(0);
  });

  it("flags extra tags (added by AI) as auto-fixable", () => {
    const e = [{ msbtFile: "F.msbt", index: 0, label: "x", original: "Hello" }];
    const t = { "F.msbt:0": "مرحبا \uE001" };
    const report = scanTranslationsForRestore(e, t);
    expect(report.autoFixable).toBe(1);
    expect(report.autoExamples[0].reasons.extraTags).toBe(1);
  });

  it("matches user-reported Simmerstone Springs case: partial line mismatch is detected", () => {
    // اقتباس مباشر من بلاغ المستخدم.
    const original =
      "Don't tell me you've never heard of\nSimmerstone Springs!\n\nWhat? Really?\n\n\nEh...I mean...if I'm bein' honest, I guess \nI don't really know that much about\nthe place either.";
    const translation =
      "لا تقل لي إنك لم تسمع عن ينابيع\nسيمرستون من قبل!\n ماذا؟\n حقاً؟\n أوه.\n..\n أعني...بصراحة،\nأظن أنني لا أعرف الكثير عن المكان أيضاً.";
    const e = [{ msbtFile: "Talk.msbt", index: 0, label: "Simmerstone", original }];
    const t = { "Talk.msbt:0": translation };
    const report = scanTranslationsForRestore(e, t);
    // الأصل فيه أسطر فارغة (فواصل فقرة) لا توجد في الترجمة → يجب الكشف عنها وإصلاحها.
    expect(report.needsReview + report.autoFixable).toBeGreaterThan(0);
    expect(report.autoFixable).toBe(1);
    expect(report.needsReview).toBe(0);
  });
});

describe("buildRestoreUpdates", () => {
  it("returns updates only for entries that actually change", () => {
    const entries = [
      { msbtFile: "F1.msbt", index: 0, original: "Press \uE000.\nGo." },
      { msbtFile: "F1.msbt", index: 1, original: "Clean" },
    ];
    const translations = {
      "F1.msbt:0": "اضغط. اذهب.",
      "F1.msbt:1": "نظيف",
    };
    const { updates, previous } = buildRestoreUpdates(entries, translations);
    expect(Object.keys(updates)).toEqual(["F1.msbt:0"]);
    expect(Object.keys(previous)).toEqual(["F1.msbt:0"]);
    expect(updates["F1.msbt:0"]).toContain("\uE000");
    expect(updates["F1.msbt:0"].split("\n").length).toBe(2);
  });

  it("auto-modifies partial line-count mismatches", () => {
    const entries = [{ msbtFile: "F.msbt", index: 0, original: "A\nB\nC" }];
    const translations = { "F.msbt:0": "أ\nب ج" };
    const { updates } = buildRestoreUpdates(entries, translations);
    expect(Object.keys(updates)).toEqual(["F.msbt:0"]);
    expect(updates["F.msbt:0"].split("\n").length).toBe(3);
  });
});

describe("smartReorderTags", () => {
  it("reorders tags to match the original sequence when counts match but values/order differ", () => {
    const original = "Press \uE001 then \uE002 to confirm.";
    const translation = "اضغط \uE002 ثمّ \uE001 للتأكيد.";
    const out = smartReorderTags(original, translation);
    // النتيجة يجب أن تطابق ترتيب الأصل: E001 ثم E002.
    const idx1 = out.indexOf("\uE001");
    const idx2 = out.indexOf("\uE002");
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(-1);
    expect(idx1).toBeLessThan(idx2);
  });

  it("replaces wrong tag values with the originals when count matches", () => {
    const original = "Hello \uE001 world \uE002";
    const translation = "مرحبا \uE034 عالم \uE002";
    const out = smartReorderTags(original, translation);
    expect(out).toContain("\uE001");
    expect(out).toContain("\uE002");
    expect(out).not.toContain("\uE034");
  });

  it("restores original tags even when tag count differs", () => {
    const original = "Press \uE001 then \uE002";
    const translation = "اضغط \uE001"; // رمز واحد فقط
    const out = smartReorderTags(original, translation);
    expect(out).toContain("\uE001");
    expect(out).toContain("\uE002");
  });

  it("keeps clean translations unchanged when tags already match original relative positions", () => {
    const original = "Hello \uE001 world \uE002";
    const translation = "مرحبا \uE001 عالم \uE002";
    expect(smartReorderTags(original, translation)).toBe(translation);
  });

  it("detects and fixes tags with correct sequence but wrong position", () => {
    const original = "Hello \uE001 world";
    const translation = "\uE001مرحبا عالم";
    const report = scanTranslationsForRestore([{ msbtFile: "F.msbt", index: 0, label: "x", original }], { "F.msbt:0": translation });
    expect(report.autoFixable).toBe(1);
    expect(report.issueTotals.misplacedTags).toBeGreaterThan(0);
    expect(report.autoExamples[0].after).toBe("مرحبا\uE001 عالم");
  });

  it("returns translation unchanged when there are no tags", () => {
    expect(smartReorderTags("Hello world", "مرحبا بالعالم")).toBe("مرحبا بالعالم");
  });

  it("does NOT modify line breaks", () => {
    const original = "Press \uE001\nthen \uE002";
    const translation = "اضغط \uE002 ثمّ \uE001"; // سطر واحد بدل سطرين
    const out = smartReorderTags(original, translation);
    // ترتيب الرموز يجب أن يتطابق، لكنّ الأسطر تبقى كما هي.
    expect(out.split("\n").length).toBe(1);
    expect(out.indexOf("\uE001")).toBeLessThan(out.indexOf("\uE002"));
  });

  it("handles empty inputs safely", () => {
    expect(smartReorderTags("", "abc")).toBe("abc");
    expect(smartReorderTags("abc", "")).toBe("");
  });
});

describe("buildSmartReorderUpdates", () => {
  it("returns updates for entries with reorderable or misplaced tags", () => {
    const entries = [
      { msbtFile: "F.msbt", index: 0, original: "Press \uE001 then \uE002" },
      { msbtFile: "F.msbt", index: 1, original: "Clean text" },
      { msbtFile: "F.msbt", index: 2, original: "Already \uE003 correct \uE004" },
    ];
    const translations = {
      "F.msbt:0": "اضغط \uE002 ثمّ \uE001", // ترتيب معكوس → سيُصلَح
      "F.msbt:1": "نص نظيف",                    // لا رموز → لا تغيير
      "F.msbt:2": "صحيح \uE003 مسبقاً \uE004",   // مطابق → لا تغيير
    };
    const { updates, previous } = buildSmartReorderUpdates(entries, translations);
    expect(Object.keys(updates)).toEqual(["F.msbt:0", "F.msbt:2"]);
    expect(Object.keys(previous)).toEqual(["F.msbt:0", "F.msbt:2"]);
    expect(previous["F.msbt:0"]).toBe(translations["F.msbt:0"]);
    expect(updates["F.msbt:0"].indexOf("\uE001")).toBeLessThan(updates["F.msbt:0"].indexOf("\uE002"));
  });

  it("repairs entries where tag count differs", () => {
    const entries = [
      { msbtFile: "F.msbt", index: 0, original: "Press \uE001 then \uE002" },
    ];
    const translations = {
      "F.msbt:0": "اضغط \uE001", // رمز واحد بدل اثنين
    };
    const { updates } = buildSmartReorderUpdates(entries, translations);
    expect(Object.keys(updates)).toEqual(["F.msbt:0"]);
    expect(updates["F.msbt:0"]).toContain("\uE002");
  });

  it("skips empty translations", () => {
    const entries = [
      { msbtFile: "F.msbt", index: 0, original: "Press \uE001 then \uE002" },
    ];
    const translations = { "F.msbt:0": "" };
    const { updates } = buildSmartReorderUpdates(entries, translations);
    expect(Object.keys(updates).length).toBe(0);
  });
});
