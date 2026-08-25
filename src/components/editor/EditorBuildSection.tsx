import React, { useEffect, useRef, useState } from "react";
/** STYLE: بناء Kingdom Hearts يبقى مختصراً؛ يخرج BBS0–BBS3 كاملة أو ISO محلياً من الجلسة الموثوقة فقط. */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, AlertTriangle, Loader2, Sparkles, RotateCcw, BarChart3, ShieldCheck, FileDown, Download, ListChecks } from "lucide-react";
import { processArabicText, hasArabicChars, hasArabicPresentationForms } from "@/lib/arabic-processing";
import { buildRisenOutputFromState } from "@/lib/risen-extractor";
import { buildRisen3OutputFromState, RISEN3_MSBT_SUFFIX } from "@/lib/risen3-extractor";
import { buildGameMakerFromState, GM_BUFFER_KEY } from "@/lib/gamemaker/gm-editor-bridge";
import { buildMother3Rom, MOTHER3_BUFFER_KEY, type M3SkippedItem } from "@/lib/mother3/m3-editor-bridge";
import { buildDsPak, DS_BUFFER_KEY } from "@/lib/dragonsword/ds-editor-bridge";
import { buildMetroidPrimePak, METROID_PRIME_BUFFER_KEY } from "@/lib/metroid-prime/mp-editor-bridge";
import { buildWolfIpa, WOLF_BUFFER_KEY, WOLF_FONTS_KEY } from "@/lib/wolfrpg/wolf-editor-bridge";
import { buildPkmRom, PKM_BUFFER_KEY, PKM_GAME_KEY } from "@/lib/pokemon/pkm-editor-bridge";
import { buildKHBbsBbsReplacements, hasKHBbsBbsSources } from "@/lib/khbbs-editor-bridge";
import { buildKHBbsDatOutput, hasKHBbsBbsWorkspace } from "@/lib/khbbs-bbs-workspace";
import { injectKHBbsArchivesIntoIso } from "@/lib/khbbs-iso";
import { buildLumenTaleBundle, LUMENTALE_BUFFER_KEY, LUMENTALE_META_KEY, type LumenTaleBundleMeta } from "@/lib/lumentale/lumentale-editor-bridge";
import { buildGtaIvAmericanOutput, GTAIV_BUFFER_KEY } from "@/lib/gtaiv/gtaiv-editor-bridge";
import type { PkmGame } from "@/lib/pokemon/pkm-codec";
import type { EmeraldRtlScope } from "@/lib/gba/emerald-rtl";
import { idbGet } from "@/lib/idb-storage";
import type { useEditorState } from "@/hooks/useEditorState";
import type { KHBBSUnsupportedCharacter } from "@/lib/khbbs-ctd";
import type { GtaIvUnsupportedCharacter } from "@/lib/gtaiv/gxt-format";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "arabicNumerals" | "setArabicNumerals"
  | "mirrorPunctuation" | "setMirrorPunctuation"
  | "handleApplyArabicProcessing" | "applyingArabic"
  | "handleUndoArabicProcessing"
  | "building" | "handleCheckIntegrity" | "handlePreBuild" | "forceSave"
>;

interface EditorBuildSectionProps {
  editor: EditorSubset;
  isRisen?: boolean;
  isMother3?: boolean;
  isMetroidPrime?: boolean;
  isWolfenstein?: boolean;
  isPokemon?: boolean;
  isGameMaker?: boolean;
  isDragonSword?: boolean;
  isKingdomHearts?: boolean;
  isLumenTale?: boolean;
  isGtaIv?: boolean;
  khbbsUnsupportedCount?: number;
  khbbsUnsupportedCharacters?: KHBBSUnsupportedCharacter[];
  khbbsUnsupportedFilterActive?: boolean;
  onFilterKHBBSUnsupported?: () => void;
  gtaIvUnsupportedCount?: number;
  gtaIvUnsupportedCharacters?: GtaIvUnsupportedCharacter[];
  gtaIvUnsupportedFilterActive?: boolean;
  onFilterGtaIvUnsupported?: () => void;
  unprocessedArabicCount: number;
  showBuildSection: boolean;
  setShowBuildSection: (v: boolean) => void;
  setShowArabicProcessConfirm: (v: boolean) => void;
  setShowDiagnostic: (v: boolean) => void;
}

const EditorBuildSection: React.FC<EditorBuildSectionProps> = ({
  editor,
  isRisen = false,
  isMother3 = false,
  isMetroidPrime = false,
  isWolfenstein = false,
  isPokemon = false,
  isGameMaker = false,
  isDragonSword = false,
  isKingdomHearts = false,
  isLumenTale = false,
  isGtaIv = false,
  khbbsUnsupportedCount = 0,
  khbbsUnsupportedCharacters = [],
  khbbsUnsupportedFilterActive = false,
  onFilterKHBBSUnsupported,
  gtaIvUnsupportedCount = 0,
  gtaIvUnsupportedCharacters = [],
  gtaIvUnsupportedFilterActive = false,
  onFilterGtaIvUnsupported,
  unprocessedArabicCount,
  showBuildSection,
  setShowBuildSection,
  setShowArabicProcessConfirm,
  setShowDiagnostic,
}) => {
  const [risenBuilding, setRisenBuilding] = useState(false);
  const [m3Building, setM3Building] = useState(false);
  const [mpBuilding, setMpBuilding] = useState(false);
  const [wolfBuilding, setWolfBuilding] = useState(false);
  const [pkmBuilding, setPkmBuilding] = useState(false);
  const [gmBuilding, setGmBuilding] = useState(false);
  const [dsBuilding, setDsBuilding] = useState(false);
  const [khbbsBuilding, setKHBbsBuilding] = useState(false);
  const [khbbsIsoBuilding, setKHBbsIsoBuilding] = useState(false);
  const [lumenTaleBuilding, setLumenTaleBuilding] = useState(false);
  const [gtaIvBuilding, setGtaIvBuilding] = useState(false);
  const khbbsIsoInputRef = useRef<HTMLInputElement>(null);
  const [pkmRtl, setPkmRtl] = useState<EmeraldRtlScope | "off">("off");
  const [pkmKeyboard, setPkmKeyboard] = useState(false);
  const [pkmGame, setPkmGame] = useState<PkmGame | undefined>(undefined);

  // Which of the two Gen 3 games is open, so the right-to-left option only
  // shows for the one whose engine this tool knows how to patch.
  useEffect(() => {
    if (!isPokemon) return;
    void idbGet<PkmGame>(PKM_GAME_KEY).then(setPkmGame);
  }, [isPokemon]);
  const [shapeArabic, setShapeArabic] = useState(true);
  const [m3ForceBuild, setM3ForceBuild] = useState(false);
  const [m3SkippedItems, setM3SkippedItems] = useState<M3SkippedItem[] | null>(null);
  const [showSkippedDialog, setShowSkippedDialog] = useState(false);

  const handleMother3Build = async () => {
    setM3Building(true);
    try {
      const buf = await idbGet<ArrayBuffer>(MOTHER3_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على ملف الـ ROM — أعد فتحه من صفحة Mother 3");
      const result = buildMother3Rom(new Uint8Array(buf), editor.state?.translations || {}, { force: m3ForceBuild });
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        const list = result.overflows
          .slice(0, 6)
          .map((o) => `${o.bank === -1 ? "جدول نصوص" : `بنك ${o.bank}`}${o.overflowBy ? ` (+${o.overflowBy}ب)` : ""}`)
          .join("، ");
        toast({ title: "تجاوز مساحة البنك", description: `${result.error}: ${list}`, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.rom as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mother3_ar.gba";
      a.click();
      URL.revokeObjectURL(url);
      const skipNote = result.skippedForOverflow ? ` | ⚠️ ${result.skippedForOverflow} بنك/جدول تم تخطيه لتجاوزه المساحة (تم الإبقاء على الأصل)` : "";
      const encNote = result.skippedForEncoding ? ` | ℹ️ ${result.skippedForEncoding} سطر/عنصر تم الإبقاء على نصه الأصلي بسبب حرف غير مدعوم (لم يُحذف أي حرف من الترجمة)` : "";
      const details = result.skippedDetails ?? [];
      setM3SkippedItems(details.length > 0 ? details : null);
      if (details.length > 0) setShowSkippedDialog(true);
      toast({
        title: m3ForceBuild ? "✅ تم بناء ROM معرّب (وضع البناء القسري)" : "✅ تم بناء ROM معرّب",
        description: `${result.translatedLines} سطر مترجم | ${result.changedBanks} بنك معدّل${skipNote}${encNote}`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setM3Building(false);
    }
  };

  const handleMetroidPrimeBuild = async () => {
    setMpBuilding(true);
    try {
      const buf = await idbGet<ArrayBuffer>(METROID_PRIME_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على ملف .pak — أعد فتحه من صفحة نصوص Metroid Prime");
      const result = await buildMetroidPrimePak(new Uint8Array(buf), editor.state?.translations || {});
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        toast({ title: "خطأ في البناء", description: result.error, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.pak as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "MetroidPrime_ar.pak";
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "✅ تم بناء ملف .pak معرّب",
        description: `${result.translatedLines} نص مترجم | ${result.changedAssets} ملف نصوص معدّل`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setMpBuilding(false);
    }
  };

  const handleWolfensteinBuild = async () => {
    setWolfBuilding(true);
    try {
      const buf = await idbGet<ArrayBuffer>(WOLF_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على ملف .ipa — أعد فتحه من صفحة نصوص Wolfenstein RPG");
      // The Arabic font is what makes the bytes readable; without it the game
      // draws the translation with its original Latin glyphs, so a build with
      // no font is worth saying out loud rather than silently shipping.
      const storedFonts = await idbGet<Record<string, ArrayBuffer>>(WOLF_FONTS_KEY);
      const fonts = storedFonts
        ? Object.fromEntries(Object.entries(storedFonts).map(([n, b]) => [n, new Uint8Array(b)]))
        : undefined;
      const result = await buildWolfIpa(new Uint8Array(buf), editor.state?.translations || {}, fonts);
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        toast({ title: "خطأ في البناء", description: result.error, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.ipa as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "WolfensteinRPG_ar.ipa";
      a.click();
      URL.revokeObjectURL(url);
      const usage = result.bankUsage
        .map((b) => `الملف ${b.bank}: ${b.bytes} من ${b.limit} بايت`)
        .join(" | ");
      toast({
        title: "✅ تم بناء ملف .ipa معرّب",
        description:
          `${result.translatedLines} نص مترجم | ${usage}` +
          (result.fontsIncluded > 0 ? ` | ${result.fontsIncluded} خطوط عربية` : " | ⚠️ بلا خط عربي — ابنه من أداة الخط") +
          (result.unmapped.length > 0 ? ` | حروف بلا خانة: ${result.unmapped.join(" ")}` : ""),
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setWolfBuilding(false);
    }
  };

  const handlePokemonBuild = async () => {
    setPkmBuilding(true);
    try {
      const buf = await idbGet<ArrayBuffer>(PKM_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على الروم — أعد فتحه من صفحة نصوص Pokémon");
      // The game the translator chose when the ROM was opened, not a guess at
      // its header: the two games write the same letter into different codes.
      const game = await idbGet<PkmGame>(PKM_GAME_KEY);
      const result = buildPkmRom(new Uint8Array(buf), editor.state?.translations || {}, {
        relocate: true,
        game,
        rtl: pkmRtl === "off" ? undefined : pkmRtl,
        keyboard: pkmKeyboard && pkmRtl === "all",
      });
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        toast({ title: "خطأ في البناء", description: result.error, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.rom as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = game === "emerald" ? "Emerald_ar.gba" : "RubyDestiny_ar.gba";
      a.click();
      URL.revokeObjectURL(url);
      // Lines that did not fit are named rather than trimmed: every line is
      // written where it was found, so a silent truncation would cut a
      // sentence in half inside the game with nothing to show for it.
      const over = result.tooLong.length;
      // A line whose `{FD:01}` went missing is refused, not written: the name
      // would simply be absent in game and nothing on screen would say why.
      const broken = result.brokenTags.length;
      toast({
        title: over + broken > 0 ? "⚠️ تم البناء مع أسطر مرفوضة" : "✅ تم بناء روم معرّب",
        description:
          `${result.translatedLines} سطر مترجم` +
          (result.fontApplied ? " | كُتب الخط العربي" : " | الخط العربي موجود مسبقاً") +
          (result.rtlApplied === "all"
            ? " | كل النصوص تُرسم من اليمين"
            : result.rtlApplied === "dialogue"
              ? " | الحوار يُرسم من اليمين"
              : "") +
          (result.keyboardApplied ? " | لوحة إدخال الاسم عربية والأحرف تتّصل" : "") +
          (result.relocated > 0 ? ` | ${result.relocated} سطراً نُقل إلى مساحة فارغة وأُعيد توجيه اللعبة إليه` : "") +
          (over > 0 ? ` | ${over} سطراً أطول من مكانه ولا مؤشّر له — اختصرها` : "") +
          (broken > 0 ? ` | ${broken} سطراً فُقدت منه قيمة تضعها اللعبة ({FD:xx}) — أصلحها بالفحص العميق` : "") +
          (result.unmapped.length > 0 ? ` | حروف بلا خانة: ${result.unmapped.join(" ")}` : ""),
        variant: over + broken > 0 ? "destructive" : undefined,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPkmBuilding(false);
    }
  };

  const handleDragonSwordBuild = async () => {
    setDsBuilding(true);
    try {
      const buf = await idbGet<ArrayBuffer>(DS_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على الحاوية — أعد فتحها من صفحة DragonSword");
      const result = buildDsPak(new Uint8Array(buf), editor.state?.translations || {});
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        toast({ title: "خطأ في البناء", description: result.error, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.pak as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "DragonSword_AR.pak";
      a.click();
      URL.revokeObjectURL(url);
      // A refused line kept its original text: the tokens it lost are values
      // the game substitutes, and writing it anyway breaks the sentence in a
      // way nobody sees until they play that far.
      const refused = result.brokenTags.length;
      toast({
        title: refused > 0 ? "⚠️ تم البناء مع أسطر مرفوضة" : "✅ تم بناء حاوية معرّبة",
        description:
          `${result.translatedLines} سطر مترجم` +
          (refused > 0 ? ` | ${refused} سطراً فقد رمزاً تقنياً أو غيّر ترتيبه — أُبقي بلغته الأصلية` : ""),
        variant: refused > 0 ? "destructive" : undefined,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDsBuilding(false);
    }
  };

  const buildKingdomHeartsOutput = async () => {
    // Save first so the latest row edit is included even if the autosave timer
    // has not fired yet; CTD itself applies the project's Arabic handling.
    await editor.forceSave();
    if (!await hasKHBbsBbsSources()) {
      throw new Error("هذه جلسة CTD منفصلة ولا تعرف مواضعها داخل BBS. عد إلى مدير Kingdom Hearts، اختر BBS0.DAT إلى BBS3.DAT، ثم افتح CTD منه قبل البناء.");
    }
    if (!hasKHBbsBbsWorkspace()) {
      throw new Error("ملفات BBS0–BBS3 لم تعد مفتوحة في هذه الجلسة. عد إلى مدير Kingdom Hearts وافتح الملفات الأربعة من جديد؛ لن تنزّل الأداة CTD منفصلة بدلاً منها.");
    }
    const result = await buildKHBbsBbsReplacements(editor.state?.translations || {});
    const output = await buildKHBbsDatOutput(result.replacements);
    return { result, output };
  };

  const handleKingdomHeartsBuild = async () => {
    setKHBbsBuilding(true);
    try {
      const { result, output } = await buildKingdomHeartsOutput();
      const { toast } = await import("@/hooks/use-toast");
      const url = URL.createObjectURL(output.archive);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "kingdom-hearts-bbs0-bbs3-ar.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      const archives = output.changedArchives.map((index) => `BBS${index}.DAT`).join("، ");
      toast({
        title: output.warnings.length ? "⚠️ تم بناء BBS0–BBS3 للتجربة" : "✅ تم بناء BBS0–BBS3 كاملة",
        description: output.warnings.length
          ? output.warnings[0]
          : `${result.translatedLines} نص مترجم | ${output.changedResources} مورد معدّل داخل ${archives} | BBS2 وBBS3 نُسختا كما هما داخل ZIP`,
        variant: output.warnings.length ? "destructive" : undefined,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في بناء ملفات CTD", description: (err as Error).message, variant: "destructive" });
    } finally {
      setKHBbsBuilding(false);
    }
  };

  const handleKingdomHeartsIsoBuild = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const sourceIso = event.target.files?.[0];
    event.target.value = "";
    if (!sourceIso) return;
    setKHBbsIsoBuilding(true);
    try {
      const { result, output } = await buildKingdomHeartsOutput();
      const isoOutput = await injectKHBbsArchivesIntoIso(sourceIso, output.archives);
      const url = URL.createObjectURL(isoOutput.iso);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sourceIso.name.replace(/\.iso$/i, "")}_ar.iso`;
      anchor.click();
      URL.revokeObjectURL(url);
      const { toast } = await import("@/hooks/use-toast");
      toast({
        title: output.warnings.length ? "⚠️ تم بناء ISO للتجربة" : "✅ تم بناء ISO معرّب",
        description: output.warnings.length
          ? output.warnings[0]
          : `${result.translatedLines} نص مترجم | استُبدلت ${isoOutput.replaced.join("، ")} داخل ISO محلياً`,
        variant: output.warnings.length ? "destructive" : undefined,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في بناء ISO", description: (err as Error).message, variant: "destructive" });
    } finally {
      setKHBbsIsoBuilding(false);
    }
  };

  const handleGameMakerBuild = async () => {
    setGmBuilding(true);
    try {
      const buf = await idbGet<ArrayBuffer>(GM_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على ملف GameMaker — أعد فتحه من صفحة GameMaker");
      const result = await buildGameMakerFromState(editor.state?.translations || {}, editor.state?.entries);
      const blob = new Blob([result.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      const { toast } = await import("@/hooks/use-toast");
      const delta = result.buffer.byteLength - result.originalSize;
      const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
      toast({
        title: "✅ تم بناء ملف GameMaker معرّب",
        description: `${result.translatedCount} ترجمة | حجم ${result.buffer.byteLength.toLocaleString()} بايت (${deltaStr})`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGmBuilding(false);
    }
  };

  const handleRisenBuild = async () => {
    setRisenBuilding(true);
    try {
      const isRisen3 = (editor.state?.entries?.[0]?.msbtFile || "").endsWith(RISEN3_MSBT_SUFFIX);
      const result = isRisen3
        ? await buildRisen3OutputFromState(editor.state?.translations || {}, editor.state?.entries, { shapeArabic })
        : await buildRisenOutputFromState(editor.state?.translations || {}, editor.state?.entries, { shapeArabic });
      const blob = new Blob([result.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      const { toast } = await import("@/hooks/use-toast");
      toast({
        title: "✅ تم البناء",
        description: `${result.translatedCount} ترجمة | ${result.buffer.byteLength.toLocaleString()} بايت${result.tagRepairCount > 0 ? ` | ⚠️ ${result.tagRepairCount} وسم Risen أُلحق تلقائياً — راجعها` : ""}`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRisenBuilding(false);
    }
  };

  const handleLumenTaleBuild = async () => {
    setLumenTaleBuilding(true);
    try {
      // Persist the focused input before reading the translation map, exactly as
      // other game builders do, so a just-edited LumenTale row is not skipped.
      await editor.forceSave();
      const [source, meta] = await Promise.all([
        idbGet<ArrayBuffer>(LUMENTALE_BUFFER_KEY),
        idbGet<LumenTaleBundleMeta>(LUMENTALE_META_KEY),
      ]);
      if (!source || !meta) throw new Error("لم يُعثر على الحزمة أو خريطة هوية LumenTale. عد إلى صفحة LumenTale وافتح الحزمة من جديد.");

      const result = await buildLumenTaleBundle(source, meta, editor.state?.entries || [], editor.state?.translations || {});
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        toast({ title: "أُوقف بناء LumenTale للحماية", description: result.error, variant: "destructive" });
        return;
      }

      const blob = new Blob([result.bundle as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({
        title: "✅ تم بناء حزمة LumenTale معرّبة",
        description: `${result.translatedLines} سطر مترجم داخل ${result.changedTables} جدول؛ احتُفظت الهوية والرموز التقنية قبل الكتابة.`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في بناء حزمة LumenTale", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLumenTaleBuilding(false);
    }
  };

  const handleGtaIvBuild = async () => {
    setGtaIvBuilding(true);
    try {
      const source = await idbGet<ArrayBuffer>(GTAIV_BUFFER_KEY);
      if (!source) throw new Error("لم يُعثر على american.gxt المصدر. أعد فتحه من قسم GTA IV أولاً.");
      if (!editor.state) throw new Error("لا توجد جلسة ترجمة مفتوحة لبناء american.gxt.");
      const result = buildGtaIvAmericanOutput(source, editor.state.entries, editor.state.translations || {});
      const blob = new Blob([result.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      const { toast } = await import("@/hooks/use-toast");
      toast({
        title: "تم بناء american.gxt",
        description: `${result.translatedLines} سطر مترجم. تم التحقق من الجداول وCRC والرموز التقنية قبل التنزيل.`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في بناء american.gxt", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGtaIvBuilding(false);
    }
  };

  return (
  <Collapsible open={showBuildSection} onOpenChange={setShowBuildSection}>
    <div className="flex items-center justify-between mb-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 font-display font-bold text-sm">
          {showBuildSection ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          ⚙️ المعالجة والبناء
          {!showBuildSection && <span className="text-xs text-muted-foreground font-body">(اضغط لإظهار)</span>}
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent>
      <Card className="mb-4 border-border">
        <CardContent className="p-4">
          <h3 className="font-display font-bold mb-3 text-sm">⚙️ خيارات البناء</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
              <input type="checkbox" checked={editor.arabicNumerals} onChange={(e) => editor.setArabicNumerals(e.target.checked)} className="rounded border-border" />
              تحويل الأرقام إلى هندية (٠١٢٣٤٥٦٧٨٩)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
              <input type="checkbox" checked={editor.mirrorPunctuation} onChange={(e) => editor.setMirrorPunctuation(e.target.checked)} className="rounded border-border" />
              عكس علامات الترقيم (؟ ، ؛)
            </label>
            {isRisen && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
                <input type="checkbox" checked={shapeArabic} onChange={(e) => setShapeArabic(e.target.checked)} disabled={risenBuilding} className="rounded border-border" />
                تحويل النص العربي لأشكال العرض (مطلوب للعبة)
              </label>
            )}
            {isPokemon && pkmGame === "emerald" && (
              <div className="space-y-1">
                <span className="text-sm font-body">الرصف من اليمين إلى اليسار (Emerald)</span>
                {([
                  ["off", "معطّل — يُعكس النصّ وقت البناء كما كان"],
                  ["dialogue", "صندوق الحوار فقط — مُجرَّب، والقوائم لا تتغيّر"],
                  ["all", "كل النوافذ — القوائم أيضاً، والحقيبة وشاشات المعركة لم تُجرَّب"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer text-sm font-body">
                    <input
                      type="radio"
                      name="pkm-rtl"
                      checked={pkmRtl === value}
                      onChange={() => setPkmRtl(value)}
                      disabled={pkmBuilding}
                      className="border-border"
                    />
                    {label}
                  </label>
                ))}
                {/* The name is stored in the order it was typed, so it only
                    reads correctly where the screen is laid out from that
                    order — which "all" does and "dialogue" does not. */}
                <label
                  className="flex items-center gap-2 cursor-pointer text-sm font-body pt-1"
                  title={pkmRtl === "all" ? undefined : "يحتاج «كل النوافذ»"}
                >
                  <input
                    type="checkbox"
                    checked={pkmKeyboard && pkmRtl === "all"}
                    onChange={(e) => setPkmKeyboard(e.target.checked)}
                    disabled={pkmBuilding || pkmRtl !== "all"}
                    className="rounded border-border"
                  />
                  لوحة إدخال الاسم بالعربية، والأحرف تتّصل داخل اللعبة
                </label>
              </div>
            )}
            {isMother3 && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body" title="يتجاهل الأحرف غير المدعومة (يحذفها بدل الفشل) ويحتفظ بالإنجليزية للبنوك التي تجاوزت مساحتها بدلاً من إيقاف البناء">
                <input type="checkbox" checked={m3ForceBuild} onChange={(e) => setM3ForceBuild(e.target.checked)} disabled={m3Building} className="rounded border-border" />
                🛠️ البناء القسري (تجاهل تحذيرات الأحرف والبنوك الممتلئة)
              </label>
            )}
            {isMother3 && m3SkippedItems && m3SkippedItems.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowSkippedDialog(true)}
                className="font-body gap-1 shrink-0"
                title="عرض قائمة العناصر التي تم الإبقاء عليها في آخر بناء قسري"
              >
                <ListChecks className="w-4 h-4" />
                ملخص الإبقاء ({m3SkippedItems.length})
              </Button>
            )}
            {isKingdomHearts && (
              <div className="basis-full flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={khbbsUnsupportedFilterActive ? "secondary" : "outline"}
                  onClick={onFilterKHBBSUnsupported}
                  disabled={!khbbsUnsupportedFilterActive && khbbsUnsupportedCount === 0}
                  className="font-body gap-1 shrink-0"
                  title={khbbsUnsupportedFilterActive
                    ? "يلغي فلتر CTD ويعيد عرض كل النصوص في المحرر"
                    : khbbsUnsupportedCount > 0
                      ? "يعرض في المحرر النصوص التي تحتوي رموز CTD غير مدعومة فقط"
                      : "لا توجد رموز CTD غير مدعومة في الترجمات الحالية"}
                >
                  <AlertTriangle className="w-4 h-4" />
                  {khbbsUnsupportedFilterActive
                    ? "إظهار كل النصوص"
                    : `عرض رموز CTD غير المدعومة (${khbbsUnsupportedCount})`}
                </Button>
                {khbbsUnsupportedCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400" aria-live="polite">
                    <span>الرموز:</span>
                    {khbbsUnsupportedCharacters.map((item) => (
                      <span key={item.unicode} className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-foreground" dir="ltr">
                        «{item.character}» {item.unicode}{item.count > 1 ? ` ×${item.count}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isGtaIv && (
              <div className="basis-full flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={gtaIvUnsupportedFilterActive ? "secondary" : "outline"}
                  onClick={onFilterGtaIvUnsupported}
                  disabled={!gtaIvUnsupportedFilterActive && gtaIvUnsupportedCount === 0}
                  className="font-body gap-1 shrink-0"
                  title={gtaIvUnsupportedFilterActive
                    ? "يلغي فلتر GTA IV ويعيد عرض كل النصوص في المحرر"
                    : gtaIvUnsupportedCount > 0
                      ? "يعرض النصوص التي تحتوي محارف غير موجودة في خط GTA IV English المعدل فقط"
                      : "لا توجد محارف غير مدعومة في الترجمات الحالية"}
                >
                  <AlertTriangle className="w-4 h-4" />
                  {gtaIvUnsupportedFilterActive
                    ? "إظهار كل النصوص"
                    : `عرض محارف GTA IV غير المدعومة (${gtaIvUnsupportedCount})`}
                </Button>
                {gtaIvUnsupportedCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400" aria-live="polite">
                    <span>المحارف:</span>
                    {gtaIvUnsupportedCharacters.map((item) => (
                      <span key={item.unicode} className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-foreground" dir="ltr">
                        «{item.character}» {item.unicode}{item.count > 1 ? ` ×${item.count}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Force-build summary dialog — lists every line/entry whose translation
          was kept as ORIGINAL, with its file, index and reason. */}
      <Dialog open={showSkippedDialog} onOpenChange={setShowSkippedDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-display">
              🛠️ ملخص البناء القسري — العناصر المُبقاة على الأصل
            </DialogTitle>
            <DialogDescription className="font-body">
              {m3SkippedItems && m3SkippedItems.length > 0
                ? `${m3SkippedItems.length} عنصر لم تُطبَّق ترجمته وأُبقي النص الأصلي بدلاً منها. لم يُحذف أي حرف من الترجمة — يمكنك تعديل النصوص أدناه وإعادة البناء.`
                : "لا توجد عناصر مُبقاة في آخر بناء."}
            </DialogDescription>
          </DialogHeader>
          {m3SkippedItems && m3SkippedItems.length > 0 && (
            <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs font-body">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-display font-bold">النوع</th>
                    <th className="px-3 py-2 font-display font-bold">الملف</th>
                    <th className="px-3 py-2 font-display font-bold">الفهرس</th>
                    <th className="px-3 py-2 font-display font-bold">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {m3SkippedItems.map((it, i) => {
                    const kindLabel = it.kind === "encoding"
                      ? "حرف غير مدعوم"
                      : it.kind === "length"
                      ? "أطول من الحد"
                      : "تجاوز المساحة";
                    const kindColor = it.kind === "encoding"
                      ? "text-amber-500"
                      : it.kind === "length"
                      ? "text-orange-500"
                      : "text-destructive";
                    return (
                      <tr key={i} className="border-t border-border/60 align-top">
                        <td className={`px-3 py-2 font-bold whitespace-nowrap ${kindColor}`}>{kindLabel}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{it.file}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{it.index >= 0 ? it.index : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{it.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter className="gap-2">
            {m3SkippedItems && m3SkippedItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="font-body"
                onClick={() => {
                  const lines = ["kind\tfile\tindex\treason"];
                  for (const it of m3SkippedItems) {
                    lines.push(`${it.kind}\t${it.file}\t${it.index}\t${it.reason.replace(/\s+/g, " ")}`);
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `mother3-force-build-skipped-${Date.now()}.tsv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 ml-1" /> تصدير TSV
              </Button>
            )}
            <Button size="sm" onClick={() => setShowSkippedDialog(false)} className="font-body">إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Arabic Unprocessed Warning Banner — meaningless for Risen: its Arabic
          is expected to stay unshaped in the editor by design (shapeArabicForRisen
          runs only at build time), so the warning itself would be wrong, not
          just its "معالجة الآن" button (which is the same Xenoblade-only
          processing already disabled above). */}
      {/* Wolfenstein shapes and reverses at build time (wolf-charmap), so
          running the editor's Arabic processing first reverses every line
          twice — measured: "متابعة" came out byte-for-byte backwards. Risen
          and Mother 3 shape at build for the same reason. */}
      {!isRisen && !isMother3 && !isWolfenstein && !isPokemon && !isKingdomHearts && !isLumenTale && !isGtaIv && unprocessedArabicCount > 0 && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-lg border border-secondary/40 bg-secondary/8">
          <AlertTriangle className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-secondary">
              ⚠️ {unprocessedArabicCount} نص عربي لم يُعالَج بعد
            </p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">
              هذه النصوص تحتوي عربية غير مُشكَّلة (بدون Reshaping). سيتم معالجتها تلقائياً عند البناء، أو اضغط الزر أدناه للمعاينة أولاً.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={editor.handleApplyArabicProcessing}
            disabled={editor.applyingArabic}
            className="shrink-0 text-xs font-body border-secondary/40 text-secondary hover:border-secondary/60"
          >
            {editor.applyingArabic ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Sparkles className="w-3 h-3 ml-1" />}
            معالجة الآن
          </Button>
        </div>
      )}

      {/* Arabic Processing + Build Buttons */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6">
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setShowArabicProcessConfirm(true)}
          disabled={editor.applyingArabic || isRisen || isMother3 || isWolfenstein || isPokemon || isKingdomHearts || isLumenTale || isGtaIv}
          className="flex-1 min-w-[200px] font-display font-bold"
          title={isGtaIv ? "GTA IV يشكل العربية ويرمزها إلى خانات الخط عند البناء؛ لا تطبق المعالجة العامة هنا." : isRisen ? "نصوص Risen تُشكَّل تلقائياً عند البناء — هذه المعالجة خاصة بـ Xenoblade وستُفسد النص" : undefined}
        >
          {editor.applyingArabic ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />} تطبيق المعالجة العربية ✨
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleUndoArabicProcessing} disabled={editor.applyingArabic || isGtaIv} className="font-body gap-1 shrink-0" title={isGtaIv ? "GTA IV لا يطبق المعالجة العامة على حالة المحرر." : "التراجع عن المعالجة العربية"}>
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">تراجع</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const st = editor.state;
            if (!st) return;
            const processed: Record<string, string> = {};
            for (const [key, value] of Object.entries(st.translations || {})) {
              if (!value?.trim()) continue;
              processed[key] = hasArabicPresentationForms(value) || !hasArabicChars(value)
                ? value
                : processArabicText(value, { arabicNumerals: editor.arabicNumerals, mirrorPunct: editor.mirrorPunctuation });
            }
            const blob = new Blob([JSON.stringify(processed, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `translations-processed-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            import("@/hooks/use-toast").then(({ toast }) =>
              toast({ title: "✅ تم التصدير", description: `${Object.keys(processed).length} ترجمة بعد المعالجة العربية` })
            );
          }}
          disabled={editor.applyingArabic || isGtaIv}
          className="font-body gap-1 shrink-0"
          title="تصدير الترجمات بعد تطبيق المعالجة العربية"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">تصدير معالج</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowDiagnostic(true)} disabled={editor.building} className="font-body gap-1 shrink-0" title="تشخيص ما قبل البناء">
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">تشخيص</span>
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleCheckIntegrity} disabled={editor.building} className="font-body gap-1 shrink-0" title="التحقق من سلامة الترجمة">
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">سلامة</span>
        </Button>
        {isGtaIv ? (
          <Button size="lg" onClick={handleGtaIvBuild} disabled={gtaIvBuilding} className="flex-1 min-w-[200px] font-display font-bold" title="يشكّل العربية عند البناء ثم يتحقق من بنية GXT والرموز التقنية قبل التنزيل">
            {gtaIvBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء american.gxt معرّب وتنزيله
          </Button>
        ) : isMother3 ? (
          <Button size="lg" onClick={handleMother3Build} disabled={m3Building} className="flex-1 min-w-[200px] font-display font-bold">
            {m3Building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ROM معرّب وتنزيله
          </Button>
        ) : isMetroidPrime ? (
          <Button size="lg" onClick={handleMetroidPrimeBuild} disabled={mpBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {mpBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف .pak معرّب وتنزيله
          </Button>
        ) : isPokemon ? (
          <Button size="lg" onClick={handlePokemonBuild} disabled={pkmBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {pkmBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء روم معرّب وتنزيله
          </Button>
        ) : isWolfenstein ? (
          <Button size="lg" onClick={handleWolfensteinBuild} disabled={wolfBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {wolfBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف .ipa معرّب وتنزيله
          </Button>
        ) : isRisen ? (
          <Button size="lg" onClick={handleRisenBuild} disabled={risenBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {risenBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف Risen وتنزيله
          </Button>
        ) : isDragonSword ? (
          <Button size="lg" onClick={handleDragonSwordBuild} disabled={dsBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {dsBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء حاوية DragonSword معرّبة
          </Button>
        ) : isKingdomHearts ? (
          <>
            <input ref={khbbsIsoInputRef} type="file" accept=".iso,application/x-iso9660-image" className="hidden" onChange={(event) => void handleKingdomHeartsIsoBuild(event)} />
            <Button size="lg" onClick={handleKingdomHeartsBuild} disabled={khbbsBuilding || khbbsIsoBuilding} className="flex-1 min-w-[200px] font-display font-bold">
              {khbbsBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء BBS0–BBS3 معرّبة وتنزيلها
            </Button>
            <Button size="lg" variant="outline" onClick={() => khbbsIsoInputRef.current?.click()} disabled={khbbsBuilding || khbbsIsoBuilding} className="flex-1 min-w-[200px] font-display font-bold" title="يستبدل BBS0–BBS3 داخل ISO محلياً؛ لا يرفع ISO">
              {khbbsIsoBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ISO معرّب مباشرة
            </Button>
          </>
        ) : isGameMaker ? (
          <Button size="lg" onClick={handleGameMakerBuild} disabled={gmBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {gmBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف GameMaker معرّب وتنزيله
          </Button>
        ) : isLumenTale ? (
          <Button size="lg" onClick={handleLumenTaleBuild} disabled={lumenTaleBuilding} className="flex-1 min-w-[200px] font-display font-bold" title="يبني نسخة Bundle جديدة محلياً من الحزمة المفتوحة، بعد تحقق المورد وm_Id والرموز التقنية">
            {lumenTaleBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء Bundle LumenTale معرّب وتنزيله
          </Button>
        ) : (
          <Button size="lg" onClick={editor.handlePreBuild} disabled={editor.building} className="flex-1 min-w-[200px] font-display font-bold">
            {editor.building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء الملف النهائي
          </Button>
        )}
      </div>
    </CollapsibleContent>
  </Collapsible>
  );
};

export default EditorBuildSection;
