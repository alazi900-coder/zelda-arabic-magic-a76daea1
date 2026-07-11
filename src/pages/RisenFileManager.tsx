import { useState, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, Folder, FileIcon,
  ChevronDown, ChevronRight, X, Eye, Gauge, Zap, TrendingDown, Percent, Settings2,
  Save, PackageCheck, RotateCcw, Search, ArrowUpDown, Wrench, Layers3, FileDown, ClipboardList, Hash, Info,
} from "lucide-react";
import {
  parseImagesPakHeader, parseImagesPakFileInfoTree, flattenPakTree,
  type RisenPakHeader, type RisenPakNode,
} from "@/lib/risen-images-pak";
import {
  collectSelectedFiles, totalSelectionSize, allTopLevelPaths,
  filterTreeByQuery, sortTree, allFolderPaths, type TreeSortBy, type TreeSortDir,
} from "@/lib/risen-archive-selection";
import {
  findTpleFloatProperties, applyTpleFloatEdits, findTpleBoolProperties, applyTpleBoolEdits,
  findTpleIntProperties, applyTpleIntEdits,
  spliceFileIntoArchive, spliceMultipleFilesIntoArchive, buildTpleBatchIndex, TPLE_PROPERTY_INFO,
  type TpleFloatProperty, type TpleBoolProperty, type TpleIntProperty, type TpleBatchOccurrence, type ArchiveReplacement,
} from "@/lib/risen-tple";

const ACCENT = "#4a7c3f";
/** Above this, zip generation can take a while and use a lot of memory — warn before proceeding. */
const LARGE_SELECTION_BYTES = 300 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Never reuses the original filename for a downloaded/rebuilt file — avoids
 * accidentally overwriting the user's original if saved to the same folder.
 * Uses an ASCII-only suffix: Chromium silently drops the whole filename
 * (falling back to a generic, extension-less "download") when the
 * `download` attribute contains Arabic text — confirmed via real-browser
 * testing, not just a style choice. */
function withModifiedSuffix(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  return dotIdx > 0 ? `${filename.slice(0, dotIdx)}-modified${filename.slice(dotIdx)}` : `${filename}-modified`;
}

/** float32 values round-trip through JS numbers with binary-representation
 * noise (e.g. 1.6 becomes 1.600000023841858) — round for display only, the
 * actual stored/edited value is untouched. */
function formatFloatDisplay(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

/** Picks a representative icon per property based on its (self-descriptive) name. */
function iconForProperty(name: string) {
  if (/deccel|decel/i.test(name)) return TrendingDown;
  if (/accel/i.test(name)) return Zap;
  if (/speed/i.test(name)) return Gauge;
  if (/modifier/i.test(name)) return Percent;
  return Settings2;
}

interface TreeRowProps {
  node: RisenPakNode;
  path: string;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selected: Set<string>;
  toggleSelected: (path: string) => void;
  onOpenFile: (path: string, offset: number, size: number) => void;
  onDownloadFile: (path: string, offset: number, size: number) => void;
}

const TreeRow: React.FC<TreeRowProps> = ({ node, path, depth, expanded, toggleExpanded, selected, toggleSelected, onOpenFile, onDownloadFile }) => {
  const isFolder = node.type === "folder";
  const isExpanded = expanded.has(path);
  const isChecked = selected.has(path);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-muted/50 text-sm"
        style={{ paddingInlineStart: `${depth * 1.25 + 0.25}rem` }}
      >
        {isFolder ? (
          <button onClick={() => toggleExpanded(path)} className="shrink-0 text-muted-foreground">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleSelected(path)}
          className="shrink-0"
        />
        {isFolder ? <Folder className="w-4 h-4 shrink-0 text-muted-foreground" /> : <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span className="truncate flex-1">{node.name}</span>
        {node.type === "file" && (
          <>
            <span className="text-xs text-muted-foreground shrink-0">{formatBytes(node.size)}</span>
            <button
              onClick={() => onDownloadFile(path, node.offset, node.size)}
              className="shrink-0 text-xs p-1 rounded border border-border/50 hover:border-primary/50 hover:text-primary"
              title="تنزيل هذا الملف مباشرة"
            >
              <FileDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => onOpenFile(path, node.offset, node.size)}
              className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-border/50 hover:border-primary/50 hover:text-primary flex items-center gap-1"
              title="فتح ومعاينة/تعديل"
            >
              <Eye className="w-3 h-3" /> فتح
            </button>
          </>
        )}
      </div>
      {isFolder && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selected={selected}
              toggleSelected={toggleSelected}
              onOpenFile={onOpenFile}
              onDownloadFile={onDownloadFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** Small round icon-button shown at the start of every property row — opens
 * the info modal explaining what the property does and how to edit it. */
const PropertyIconButton: React.FC<{ Icon: typeof Info; onInfoClick: () => void }> = ({ Icon, onInfoClick }) => (
  <button
    onClick={onInfoClick}
    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
    style={{ backgroundColor: `${ACCENT}1a` }}
    title="معلومات عن هذه الخاصية"
  >
    <Icon className="w-4 h-4" style={{ color: ACCENT }} />
  </button>
);

interface PropertyRowProps {
  prop: TpleFloatProperty;
  currentValue: number;
  onChange: (valueOffset: number, newValue: number) => void;
  onInfoClick: () => void;
}

const PropertyRow: React.FC<PropertyRowProps> = ({ prop, currentValue, onChange, onInfoClick }) => {
  const info = TPLE_PROPERTY_INFO[prop.name];
  const Icon = iconForProperty(prop.name);
  const [text, setText] = useState(formatFloatDisplay(currentValue));

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-background">
      <PropertyIconButton Icon={Icon} onInfoClick={onInfoClick} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">{info?.label ?? prop.name}</div>
        <div className="text-xs text-muted-foreground">
          {info?.description ?? "خاصية رقمية اكتُشفت تلقائياً — غير موثّق معناها بدقة، عدّل بحذر."}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{prop.name}</div>
      </div>
      <input
        type="number"
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(prop.valueOffset, v);
        }}
        className="w-28 shrink-0 px-2 py-1.5 text-sm rounded border border-border bg-background text-center"
      />
    </div>
  );
};

interface BoolPropertyRowProps {
  prop: TpleBoolProperty;
  currentValue: boolean;
  onChange: (valueOffset: number, newValue: boolean) => void;
  onInfoClick: () => void;
}

const BoolPropertyRow: React.FC<BoolPropertyRowProps> = ({ prop, currentValue, onChange, onInfoClick }) => {
  const info = TPLE_PROPERTY_INFO[prop.name];

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-background">
      <PropertyIconButton Icon={Wrench} onInfoClick={onInfoClick} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">{info?.label ?? prop.name}</div>
        <div className="text-xs text-muted-foreground">
          {info?.description ?? "خاصية نعم/لا اكتُشفت تلقائياً — غير موثّق معناها بدقة، عدّل بحذر."}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{prop.name}</div>
      </div>
      <button
        onClick={() => onChange(prop.valueOffset, !currentValue)}
        className={`shrink-0 w-16 px-2 py-1.5 text-sm rounded border font-display font-bold transition-colors ${
          currentValue ? "border-primary bg-primary/10" : "border-border/50 bg-background"
        }`}
      >
        {currentValue ? "نعم" : "لا"}
      </button>
    </div>
  );
};

interface IntPropertyRowProps {
  prop: TpleIntProperty;
  currentValue: number;
  onChange: (valueOffset: number, newValue: number, size: number) => void;
  onInfoClick: () => void;
}

const IntPropertyRow: React.FC<IntPropertyRowProps> = ({ prop, currentValue, onChange, onInfoClick }) => {
  const info = TPLE_PROPERTY_INFO[prop.name];
  const [text, setText] = useState(String(currentValue));

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-background">
      <PropertyIconButton Icon={Hash} onInfoClick={onInfoClick} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">{info?.label ?? prop.name}</div>
        <div className="text-xs text-muted-foreground">
          {info?.description ?? `عدد صحيح (${prop.typeName}) اكتُشف تلقائياً — غير موثّق معناها بدقة، عدّل بحذر.`}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{prop.name}</div>
      </div>
      <input
        type="number"
        step="1"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseInt(e.target.value, 10);
          if (!Number.isNaN(v)) onChange(prop.valueOffset, v, prop.size);
        }}
        className="w-28 shrink-0 px-2 py-1.5 text-sm rounded border border-border bg-background text-center"
      />
    </div>
  );
};

interface PropertyInfoModalProps {
  name: string;
  kind: "float" | "bool" | "int";
  typeName?: string;
  onClose: () => void;
}

/** Explains what a property does and how to edit/apply it. Closes via the X
 * button or a click on the dark backdrop — both work identically with touch
 * (phone) and mouse (PC), no platform-specific handling needed. */
const PropertyInfoModal: React.FC<PropertyInfoModalProps> = ({ name, kind, typeName, onClose }) => {
  const info = TPLE_PROPERTY_INFO[name];
  const isMovement = (info?.category ?? "other") === "movement";
  const fallbackDescription =
    kind === "bool"
      ? "خاصية نعم/لا اكتُشفت تلقائياً — غير موثّق معناها بدقة، عدّل بحذر."
      : kind === "int"
      ? `عدد صحيح (${typeName}) اكتُشف تلقائياً — غير موثّق معناها بدقة، عدّل بحذر.`
      : "خاصية رقمية اكتُشفت تلقائياً — غير موثّق معناها بدقة، عدّل بحذر.";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg max-w-md w-full p-4 space-y-3 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display font-bold text-lg">{info?.label ?? name}</div>
            <div className="text-xs text-muted-foreground font-mono">{name}</div>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded border border-border/50 hover:border-primary/50" title="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-sm">{info?.description ?? fallbackDescription}</div>

        <div className="text-sm space-y-1 border-t border-border/50 pt-3">
          <div className="font-display font-bold text-xs text-muted-foreground">كيف تُعدّل؟</div>
          <div>{kind === "bool" ? "اضغط الزر (نعم/لا) بجانب الخاصية لتبديل القيمة." : "اكتب رقماً جديداً في الحقل بجانب الخاصية."}</div>
        </div>

        <div className="text-sm space-y-1 border-t border-border/50 pt-3">
          <div className="font-display font-bold text-xs text-muted-foreground">كيف يُطبَّق التعديل؟</div>
          <div>
            اضغط "تنزيل الملف المعدَّل فقط" لحفظ هذا الملف وحده، أو "بناء وتنزيل الأرشيف كاملاً" لدمج كل التعديلات
            داخل الأرشيف الأصلي بنفس مكانه بالضبط.
          </div>
        </div>

        {isMovement && (
          <div className="text-sm space-y-1 border-t border-amber-500/30 pt-3">
            <div className="font-display font-bold text-xs text-amber-600">ملاحظة</div>
            <div>
              بعض خصائص السرعة تُطبَّق فقط في حالة حركة معيّنة (مشي بطيء/جري/تسلل) حسب قوة تحريك العصا التناظرية. إن لم
              تلاحظ تغييراً واضحاً، جرّب تعديل عدة خصائص سرعة معاً — مثل: ForwardSpeedMax، FastModifier، SlowModifier،
              SneakModifier — عبر "تعديل جماعي عبر الأرشيف".
            </div>
          </div>
        )}

        {kind === "int" && (
          <div className="text-sm space-y-1 border-t border-amber-500/30 pt-3">
            <div className="font-display font-bold text-xs text-amber-600">تحذير</div>
            <div>
              أغلب الأعداد الصحيحة المكتشَفة قيمتها صفر وتبدو حالة تشغيل داخلية (كتقدّم مهمة أو مؤقّت) وليست إعداداً
              ثابتاً — عدّل بحذر شديد.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface PendingChange {
  fileLabel: string;
  propertyName: string;
  oldValue: string;
  newValue: string;
}

/** Compact "what will actually change" list, shown before any build/download
 * action — lets the user review every edit at a glance. */
const PendingChangesSummary: React.FC<{ changes: PendingChange[] }> = ({ changes }) => {
  if (changes.length === 0) return null;
  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="font-display font-bold mb-1.5 flex items-center gap-1.5">
        <ClipboardList className="w-4 h-4" /> التغييرات المعلَّقة ({changes.length})
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {changes.map((c, i) => (
          <div key={i} className="text-xs flex items-center gap-1.5 flex-wrap">
            {c.fileLabel && <span className="text-muted-foreground font-mono">{c.fileLabel}:</span>}
            <span className="font-display">{c.propertyName}</span>
            <span className="text-muted-foreground">{c.oldValue} ← {c.newValue}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface BatchOccurrenceRowProps {
  occurrence: TpleBatchOccurrence;
  currentValue: number | boolean;
  onChangeFloat: (path: string, valueOffset: number, newValue: number) => void;
  onChangeBool: (path: string, valueOffset: number, newValue: boolean) => void;
  onChangeInt: (path: string, valueOffset: number, newValue: number, size: number) => void;
}

const BatchOccurrenceRow: React.FC<BatchOccurrenceRowProps> = ({ occurrence, currentValue, onChangeFloat, onChangeBool, onChangeInt }) => {
  const [text, setText] = useState(occurrence.kind === "float" ? formatFloatDisplay(currentValue as number) : String(currentValue));
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-background">
      <div className="flex-1 min-w-0 text-xs font-mono text-muted-foreground truncate" title={occurrence.path}>
        {occurrence.path}
      </div>
      {occurrence.kind === "float" ? (
        <input
          type="number"
          step="any"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChangeFloat(occurrence.path, occurrence.valueOffset, v);
          }}
          className="w-28 shrink-0 px-2 py-1.5 text-sm rounded border border-border bg-background text-center"
        />
      ) : occurrence.kind === "int" ? (
        <input
          type="number"
          step="1"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v)) onChangeInt(occurrence.path, occurrence.valueOffset, v, occurrence.size ?? 4);
          }}
          className="w-28 shrink-0 px-2 py-1.5 text-sm rounded border border-border bg-background text-center"
        />
      ) : (
        <button
          onClick={() => onChangeBool(occurrence.path, occurrence.valueOffset, !currentValue)}
          className={`shrink-0 w-16 px-2 py-1.5 text-sm rounded border font-display font-bold transition-colors ${
            currentValue ? "border-primary bg-primary/10" : "border-border/50 bg-background"
          }`}
        >
          {currentValue ? "نعم" : "لا"}
        </button>
      )}
    </div>
  );
};

const RisenFileManager: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<RisenPakHeader | null>(null);
  const [tree, setTree] = useState<RisenPakNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [treeSizeWarning, setTreeSizeWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  // Property editor (opened either from inside an archive, or as a standalone loose file).
  const [viewingEntry, setViewingEntry] = useState<{ path: string; offset: number; size: number } | null>(null);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [entryBytes, setEntryBytes] = useState<Uint8Array | null>(null);
  const [tpleProps, setTpleProps] = useState<TpleFloatProperty[]>([]);
  const [tpleBoolProps, setTpleBoolProps] = useState<TpleBoolProperty[]>([]);
  const [tpleIntProps, setTpleIntProps] = useState<TpleIntProperty[]>([]);
  const [edits, setEdits] = useState<Map<number, number>>(new Map());
  const [boolEdits, setBoolEdits] = useState<Map<number, boolean>>(new Map());
  const [intEdits, setIntEdits] = useState<Map<number, { value: number; size: number }>>(new Map());
  const [resetToken, setResetToken] = useState(0);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [propSearch, setPropSearch] = useState("");
  const [infoModalProp, setInfoModalProp] = useState<{ name: string; kind: "float" | "bool" | "int"; typeName?: string } | null>(null);

  // Tree browsing (search/sort).
  const [treeSearch, setTreeSearch] = useState("");
  const [treeSortBy, setTreeSortBy] = useState<TreeSortBy>("name");
  const [treeSortDir, setTreeSortDir] = useState<TreeSortDir>("asc");

  // Batch mode: edit one property across every .tple file in the open archive at once.
  const [batchMode, setBatchMode] = useState(false);
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchFileBytes, setBatchFileBytes] = useState<Map<string, Uint8Array>>(new Map());
  const [batchIndex, setBatchIndex] = useState<Map<string, TpleBatchOccurrence[]>>(new Map());
  const [batchPropSearch, setBatchPropSearch] = useState("");
  const [batchSelectedProperty, setBatchSelectedProperty] = useState<string | null>(null);
  const [batchFloatEdits, setBatchFloatEdits] = useState<Map<string, Map<number, number>>>(new Map());
  const [batchBoolEdits, setBatchBoolEdits] = useState<Map<string, Map<number, boolean>>>(new Map());
  const [batchIntEdits, setBatchIntEdits] = useState<Map<string, Map<number, { value: number; size: number }>>>(new Map());
  const [batchResetToken, setBatchResetToken] = useState(0);
  const [batchBuilding, setBatchBuilding] = useState(false);
  const [applyAllText, setApplyAllText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fsaSupported = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const flatFileCount = useMemo(() => flattenPakTree(tree).length, [tree]);
  const displayedTree = useMemo(
    () => sortTree(filterTreeByQuery(tree, treeSearch), treeSortBy, treeSortDir),
    [tree, treeSearch, treeSortBy, treeSortDir]
  );
  const effectiveExpanded = useMemo(() => {
    if (!treeSearch.trim()) return expanded;
    return new Set(allFolderPaths(displayedTree));
  }, [treeSearch, expanded, displayedTree]);

  const closeEntry = useCallback(() => {
    setViewingEntry(null);
    setStandaloneMode(false);
    setEntryBytes(null);
    setTpleProps([]);
    setTpleBoolProps([]);
    setTpleIntProps([]);
    setEdits(new Map());
    setBoolEdits(new Map());
    setIntEdits(new Map());
    setEntryError(null);
    setPropSearch("");
    setInfoModalProp(null);
  }, []);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setBatchError(null);
    setBatchFileBytes(new Map());
    setBatchIndex(new Map());
    setBatchPropSearch("");
    setBatchSelectedProperty(null);
    setBatchFloatEdits(new Map());
    setBatchBoolEdits(new Map());
    setBatchIntEdits(new Map());
    setApplyAllText("");
  }, []);

  const loadArchive = useCallback(async (f: File) => {
    setLoading(true);
    setLoadError(null);
    setTreeSizeWarning(null);
    setSelected(new Set());
    setExpanded(new Set());
    closeEntry();
    exitBatchMode();
    try {
      const headBuf = await f.slice(0, 48).arrayBuffer();
      let hdr: RisenPakHeader;
      try {
        hdr = parseImagesPakHeader(new Uint8Array(headBuf));
      } catch (g3v0Err) {
        // Not a G3V0 archive — try it as a standalone loose file (e.g. a .tple
        // already extracted from an archive) before giving up entirely.
        const wholeBytes = new Uint8Array(await f.arrayBuffer());
        const props = findTpleFloatProperties(wholeBytes);
        const boolProps = findTpleBoolProperties(wholeBytes);
        const intProps = findTpleIntProperties(wholeBytes);
        if (props.length === 0 && boolProps.length === 0 && intProps.length === 0) throw g3v0Err;
        setFile(f);
        setEntryBytes(wholeBytes);
        setTpleProps(props);
        setTpleBoolProps(boolProps);
        setTpleIntProps(intProps);
        setEdits(new Map());
        setBoolEdits(new Map());
        setIntEdits(new Map());
        setViewingEntry({ path: f.name, offset: 0, size: wholeBytes.length });
        setStandaloneMode(true);
        return;
      }

      const tailLen = hdr.totalFileSize - hdr.fileInfoOffset;
      if (tailLen <= 0 || tailLen > 100_000_000) {
        throw new Error("حجم شجرة الملفات غير معقول — قد لا يكون هذا أرشيفاً مدعوماً");
      }
      const tailBuf = await f.slice(hdr.fileInfoOffset, hdr.fileInfoOffset + tailLen).arrayBuffer();
      const { tree: parsedTree, endOffset } = parseImagesPakFileInfoTree(new Uint8Array(tailBuf), hdr);
      if (endOffset !== hdr.totalFileSize) {
        setTreeSizeWarning(
          `تحذير: انتهت قراءة شجرة الملفات عند بايت ${endOffset} بينما حجم الملف ${hdr.totalFileSize} — البنية قد تختلف عن المتوقع، تحقق من النتائج بحذر.`
        );
      }
      setHeader(hdr);
      setTree(parsedTree);
      setFile(f);
      setExpanded(new Set(parsedTree.filter((n) => n.type === "folder").map((n) => n.name)));
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? `${e.message} — هذا العارض يدعم أرشيفات بصيغة G3V0 الهرمية (مثل images.pak أو ملفات .p00/.p01 المشابهة) وملفات .tple منفردة (مستخرَجة مسبقاً)، وليس ملف strings.p00/strings.pak (له بنية مختلفة، استخدم أداة النصوص له).`
          : String(e)
      );
      setFile(null);
      setHeader(null);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [closeEntry, exitBatchMode]);

  const handleOpenFsa = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "أرشيف Risen 1 أو ملف .tple", accept: { "application/octet-stream": [".pak", ".p00", ".p01", ".p02", ".p03", ".p04", ".p05", ".tple"] } }],
      });
      const f = await handle.getFile();
      await loadArchive(f);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // Some embedded/cross-origin preview frames (e.g. Lovable's iframe) block
      // the advanced picker entirely — fall back to the plain file input instead
      // of dead-ending on a raw browser error the user can't act on.
      if (e instanceof Error && e.message.includes("Cross origin sub frames")) {
        fileInputRef.current?.click();
        return;
      }
      if (e instanceof Error) setLoadError(e.message);
    }
  }, [loadArchive]);

  const handlePlainInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void loadArchive(f);
  }, [loadArchive]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (loading) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    void loadArchive(f);
  }, [loading, loadArchive]);

  const handleClose = useCallback(() => {
    setFile(null);
    setHeader(null);
    setTree([]);
    setSelected(new Set());
    setExpanded(new Set());
    setLoadError(null);
    setTreeSizeWarning(null);
    closeEntry();
    exitBatchMode();
  }, [closeEntry, exitBatchMode]);

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const toggleSelected = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(allTopLevelPaths(tree))), [tree]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedFiles = useMemo(() => collectSelectedFiles(tree, selected), [tree, selected]);
  const selectedSize = useMemo(() => totalSelectionSize(selectedFiles), [selectedFiles]);

  const handleDownloadZip = useCallback(async () => {
    if (!file || selectedFiles.length === 0) return;
    if (selectedSize > LARGE_SELECTION_BYTES) {
      const ok = window.confirm(
        `التحديد الحالي ${formatBytes(selectedSize)} عبر ${selectedFiles.length} ملف — قد يستغرق وقتاً طويلاً ويستهلك ذاكرة كبيرة. هل تريد المتابعة؟`
      );
      if (!ok) return;
    }
    setZipping(true);
    setZipProgress({ current: 0, total: selectedFiles.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        const bytes = await file.slice(f.offset, f.offset + f.size).arrayBuffer();
        zip.file(f.path, bytes);
        setZipProgress({ current: i + 1, total: selectedFiles.length });
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const baseName = file.name.replace(/\.[^.]+$/, "");
      // ASCII-only suffix: an Arabic download filename gets silently dropped by
      // Chromium (falls back to a generic, extension-less "download") — confirmed via real-browser testing.
      downloadBlob(blob, `${baseName}-selected-files.zip`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(false);
      setZipProgress(null);
    }
  }, [file, selectedFiles, selectedSize]);

  const openEntry = useCallback(async (path: string, offset: number, size: number) => {
    if (!file) return;
    setEntryLoading(true);
    setEntryError(null);
    setEdits(new Map());
    setBoolEdits(new Map());
    setIntEdits(new Map());
    setPropSearch("");
    setResetToken((t) => t + 1);
    try {
      const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
      const props = findTpleFloatProperties(bytes);
      const boolProps = findTpleBoolProperties(bytes);
      const intProps = findTpleIntProperties(bytes);
      setEntryBytes(bytes);
      setTpleProps(props);
      setTpleBoolProps(boolProps);
      setTpleIntProps(intProps);
      setViewingEntry({ path, offset, size });
      setStandaloneMode(false);
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntryLoading(false);
    }
  }, [file]);

  const updateEditValue = useCallback((valueOffset: number, newValue: number) => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(valueOffset, newValue);
      return next;
    });
  }, []);

  const updateBoolEditValue = useCallback((valueOffset: number, newValue: boolean) => {
    setBoolEdits((prev) => {
      const next = new Map(prev);
      next.set(valueOffset, newValue);
      return next;
    });
  }, []);

  const updateIntEditValue = useCallback((valueOffset: number, newValue: number, size: number) => {
    setIntEdits((prev) => {
      const next = new Map(prev);
      next.set(valueOffset, { value: newValue, size });
      return next;
    });
  }, []);

  const resetEdits = useCallback(() => {
    setEdits(new Map());
    setBoolEdits(new Map());
    setIntEdits(new Map());
    setResetToken((t) => t + 1);
  }, []);

  const patchedEntryBytes = useMemo(() => {
    if (!entryBytes) return null;
    return applyTpleIntEdits(applyTpleBoolEdits(applyTpleFloatEdits(entryBytes, edits), boolEdits), intEdits);
  }, [entryBytes, edits, boolEdits, intEdits]);

  const downloadEditedFileOnly = useCallback(() => {
    if (!patchedEntryBytes || !viewingEntry) return;
    const name = viewingEntry.path.slice(viewingEntry.path.lastIndexOf("/") + 1);
    downloadBlob(new Blob([patchedEntryBytes as BlobPart]), withModifiedSuffix(name));
  }, [patchedEntryBytes, viewingEntry]);

  const buildAndDownloadArchive = useCallback(async () => {
    if (!file || !patchedEntryBytes || !viewingEntry) return;
    setBuilding(true);
    setEntryError(null);
    try {
      const archiveBytes = new Uint8Array(await file.arrayBuffer());
      const rebuilt = spliceFileIntoArchive(archiveBytes, viewingEntry.offset, viewingEntry.size, patchedEntryBytes);
      downloadBlob(new Blob([rebuilt as BlobPart]), withModifiedSuffix(file.name));
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  }, [file, patchedEntryBytes, viewingEntry]);

  const downloadFileDirect = useCallback(async (path: string, offset: number, size: number) => {
    if (!file) return;
    const bytes = await file.slice(offset, offset + size).arrayBuffer();
    const name = path.slice(path.lastIndexOf("/") + 1);
    downloadBlob(new Blob([bytes]), name);
  }, [file]);

  const startBatchScan = useCallback(async () => {
    if (!file) return;
    setBatchScanning(true);
    setBatchError(null);
    try {
      const tpleEntries = flattenPakTree(tree).filter((f) => /\.tple$/i.test(f.path));
      const filesRead: Array<{ path: string; bytes: Uint8Array }> = [];
      const bytesMap = new Map<string, Uint8Array>();
      for (const entry of tpleEntries) {
        const bytes = new Uint8Array(await file.slice(entry.offset, entry.offset + entry.size).arrayBuffer());
        filesRead.push({ path: entry.path, bytes });
        bytesMap.set(entry.path, bytes);
      }
      setBatchFileBytes(bytesMap);
      setBatchIndex(buildTpleBatchIndex(filesRead));
      setBatchFloatEdits(new Map());
      setBatchBoolEdits(new Map());
      setBatchIntEdits(new Map());
      setBatchSelectedProperty(null);
      setBatchMode(true);
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchScanning(false);
    }
  }, [file, tree]);

  const updateBatchFloatValue = useCallback((path: string, valueOffset: number, newValue: number) => {
    setBatchFloatEdits((prev) => {
      const next = new Map(prev);
      const fileMap = new Map(next.get(path));
      fileMap.set(valueOffset, newValue);
      next.set(path, fileMap);
      return next;
    });
  }, []);

  const updateBatchBoolValue = useCallback((path: string, valueOffset: number, newValue: boolean) => {
    setBatchBoolEdits((prev) => {
      const next = new Map(prev);
      const fileMap = new Map(next.get(path));
      fileMap.set(valueOffset, newValue);
      next.set(path, fileMap);
      return next;
    });
  }, []);

  const updateBatchIntValue = useCallback((path: string, valueOffset: number, newValue: number, size: number) => {
    setBatchIntEdits((prev) => {
      const next = new Map(prev);
      const fileMap = new Map(next.get(path));
      fileMap.set(valueOffset, { value: newValue, size });
      next.set(path, fileMap);
      return next;
    });
  }, []);

  const applySameValueToAll = useCallback((occurrences: TpleBatchOccurrence[], value: number | boolean) => {
    for (const occ of occurrences) {
      if (occ.kind === "float" && typeof value === "number") updateBatchFloatValue(occ.path, occ.valueOffset, value);
      else if (occ.kind === "bool" && typeof value === "boolean") updateBatchBoolValue(occ.path, occ.valueOffset, value);
      else if (occ.kind === "int" && typeof value === "number") updateBatchIntValue(occ.path, occ.valueOffset, value, occ.size ?? 4);
    }
  }, [updateBatchFloatValue, updateBatchBoolValue, updateBatchIntValue]);

  const resetBatchEdits = useCallback(() => {
    setBatchFloatEdits(new Map());
    setBatchBoolEdits(new Map());
    setBatchIntEdits(new Map());
    setBatchResetToken((t) => t + 1);
  }, []);

  const batchPendingChanges = useMemo((): PendingChange[] => {
    const changes: PendingChange[] = [];
    for (const [name, occurrences] of batchIndex) {
      for (const occ of occurrences) {
        const shortPath = occ.path.slice(occ.path.lastIndexOf("/") + 1);
        if (occ.kind === "float") {
          const edited = batchFloatEdits.get(occ.path)?.get(occ.valueOffset);
          if (edited !== undefined && edited !== occ.value) {
            changes.push({ fileLabel: shortPath, propertyName: name, oldValue: formatFloatDisplay(occ.value as number), newValue: formatFloatDisplay(edited) });
          }
        } else if (occ.kind === "bool") {
          const edited = batchBoolEdits.get(occ.path)?.get(occ.valueOffset);
          if (edited !== undefined && edited !== occ.value) {
            changes.push({ fileLabel: shortPath, propertyName: name, oldValue: occ.value ? "نعم" : "لا", newValue: edited ? "نعم" : "لا" });
          }
        } else {
          const edited = batchIntEdits.get(occ.path)?.get(occ.valueOffset);
          if (edited !== undefined && edited.value !== occ.value) {
            changes.push({ fileLabel: shortPath, propertyName: name, oldValue: String(occ.value), newValue: String(edited.value) });
          }
        }
      }
    }
    return changes;
  }, [batchIndex, batchFloatEdits, batchBoolEdits, batchIntEdits]);

  const buildAndDownloadBatchArchive = useCallback(async () => {
    if (!file) return;
    setBatchBuilding(true);
    setBatchError(null);
    try {
      const changedPaths = new Set([...batchFloatEdits.keys(), ...batchBoolEdits.keys(), ...batchIntEdits.keys()]);
      const replacements: ArchiveReplacement[] = [];
      for (const path of changedPaths) {
        const original = batchFileBytes.get(path);
        if (!original) continue;
        const floatMap = batchFloatEdits.get(path) ?? new Map();
        const boolMap = batchBoolEdits.get(path) ?? new Map();
        const intMap = batchIntEdits.get(path) ?? new Map();
        const patched = applyTpleIntEdits(applyTpleBoolEdits(applyTpleFloatEdits(original, floatMap), boolMap), intMap);
        const entry = flattenPakTree(tree).find((f) => f.path === path);
        if (!entry) continue;
        replacements.push({ offset: entry.offset, size: entry.size, bytes: patched });
      }
      const archiveBytes = new Uint8Array(await file.arrayBuffer());
      const rebuilt = spliceMultipleFilesIntoArchive(archiveBytes, replacements);
      downloadBlob(new Blob([rebuilt as BlobPart]), withModifiedSuffix(file.name));
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchBuilding(false);
    }
  }, [file, tree, batchFileBytes, batchFloatEdits, batchBoolEdits, batchIntEdits]);

  if (batchMode) {
    const q = batchPropSearch.trim().toLowerCase();
    const propertyNames = Array.from(batchIndex.keys())
      .filter((name) => !q || name.toLowerCase().includes(q) || (TPLE_PROPERTY_INFO[name]?.label ?? "").toLowerCase().includes(q))
      .sort((a, b) => (batchIndex.get(b)?.length ?? 0) - (batchIndex.get(a)?.length ?? 0));
    const selectedOccurrences = batchSelectedProperty ? batchIndex.get(batchSelectedProperty) ?? [] : [];
    const selectedKind = selectedOccurrences[0]?.kind;
    const hasBatchEdits = batchPendingChanges.length > 0;

    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <div className="border-b p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={exitBatchMode}>
              <ArrowLeft className="w-4 h-4 ml-1" /> رجوع للقائمة
            </Button>
            <div className="min-w-0">
              <div className="font-display font-bold truncate">تعديل جماعي عبر الأرشيف</div>
              <div className="text-xs text-muted-foreground">{batchFileBytes.size} ملف .tple تم فحصه — {batchIndex.size} خاصية مختلفة</div>
            </div>
          </div>
        </div>

        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <strong className="block mb-1">⚠️ تجريبي</strong>
            احتفظ بنسخة من الأرشيف الأصلي قبل التعديل، وراجع "التغييرات المعلَّقة" أدناه بعناية قبل البناء.
          </div>
        </div>

        {batchError && (
          <div className="mx-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{batchError}</span>
          </div>
        )}

        <PendingChangesSummary changes={batchPendingChanges} />

        <div className="flex-1 overflow-y-auto p-3 grid md:grid-cols-2 gap-3">
          <div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={batchPropSearch}
                onChange={(e) => setBatchPropSearch(e.target.value)}
                placeholder={`ابحث بين ${batchIndex.size} خاصية...`}
                className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-border bg-background"
              />
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {propertyNames.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  {batchIndex.size === 0 ? "لم يُعثر على أي خصائص في ملفات .tple بالأرشيف." : "لا توجد خصائص مطابقة للبحث."}
                </div>
              ) : (
                propertyNames.map((name) => {
                  const info = TPLE_PROPERTY_INFO[name];
                  const count = batchIndex.get(name)?.length ?? 0;
                  return (
                    <button
                      key={name}
                      onClick={() => { setBatchSelectedProperty(name); setApplyAllText(""); }}
                      className={`w-full text-right p-2 rounded-lg border text-sm flex items-center justify-between gap-2 ${
                        batchSelectedProperty === name ? "border-primary bg-primary/10" : "border-border/50 bg-background hover:border-primary/30"
                      }`}
                    >
                      <span className="truncate">{info?.label ?? name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({count})</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            {!batchSelectedProperty ? (
              <div className="text-sm text-muted-foreground p-4 text-center">اختر خاصية من القائمة لتعديلها عبر كل الملفات.</div>
            ) : (
              <div className="space-y-2">
                <div className="font-display font-bold">{TPLE_PROPERTY_INFO[batchSelectedProperty]?.label ?? batchSelectedProperty}</div>
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-card/30">
                  <span className="text-xs text-muted-foreground shrink-0">قيمة جديدة للجميع:</span>
                  {selectedKind === "bool" ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => applySameValueToAll(selectedOccurrences, true)}>نعم للكل</Button>
                      <Button size="sm" variant="outline" onClick={() => applySameValueToAll(selectedOccurrences, false)}>لا للكل</Button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="number"
                        step={selectedKind === "int" ? "1" : "any"}
                        value={applyAllText}
                        onChange={(e) => setApplyAllText(e.target.value)}
                        className="w-28 px-2 py-1.5 text-sm rounded border border-border bg-background text-center"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const v = selectedKind === "int" ? parseInt(applyAllText, 10) : parseFloat(applyAllText);
                          if (!Number.isNaN(v)) applySameValueToAll(selectedOccurrences, v);
                        }}
                      >
                        تطبيق على الكل
                      </Button>
                    </>
                  )}
                </div>
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                  {selectedOccurrences.map((occ) => (
                    <BatchOccurrenceRow
                      key={`${occ.path}-${occ.valueOffset}-${batchResetToken}`}
                      occurrence={occ}
                      currentValue={
                        occ.kind === "float"
                          ? batchFloatEdits.get(occ.path)?.get(occ.valueOffset) ?? occ.value
                          : occ.kind === "int"
                          ? batchIntEdits.get(occ.path)?.get(occ.valueOffset)?.value ?? occ.value
                          : batchBoolEdits.get(occ.path)?.get(occ.valueOffset) ?? occ.value
                      }
                      onChangeFloat={updateBatchFloatValue}
                      onChangeBool={updateBatchBoolValue}
                      onChangeInt={updateBatchIntValue}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={resetBatchEdits} disabled={!hasBatchEdits}>
            <RotateCcw className="w-4 h-4 ml-1" /> استعادة الكل
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => void buildAndDownloadBatchArchive()}
            disabled={batchBuilding || !hasBatchEdits}
            className="font-display font-bold"
            style={{ backgroundColor: ACCENT, color: "white" }}
          >
            {batchBuilding ? (
              <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> جارٍ البناء...</>
            ) : (
              <><PackageCheck className="w-4 h-4 ml-2" /> بناء وتنزيل الأرشيف كاملاً</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (viewingEntry) {
    const shortName = viewingEntry.path.slice(viewingEntry.path.lastIndexOf("/") + 1);
    const q = propSearch.trim().toLowerCase();
    const matchesSearch = (name: string) => {
      if (!q) return true;
      const label = TPLE_PROPERTY_INFO[name]?.label ?? "";
      return name.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    };
    const movementProps = tpleProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "movement" && matchesSearch(p.name));
    const physicsFloatProps = tpleProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "physics" && matchesSearch(p.name));
    const physicsProps = tpleBoolProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "physics" && matchesSearch(p.name));
    const otherFloatProps = tpleProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "other" && matchesSearch(p.name));
    const otherBoolProps = tpleBoolProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "other" && matchesSearch(p.name));
    const intProps = tpleIntProps.filter((p) => matchesSearch(p.name));
    const totalPropCount = tpleProps.length + tpleBoolProps.length + tpleIntProps.length;
    const hasEdits = edits.size > 0 || boolEdits.size > 0 || intEdits.size > 0;
    const nothingFound = totalPropCount === 0;
    const nothingMatchesSearch = !nothingFound && movementProps.length === 0 && physicsFloatProps.length === 0 && physicsProps.length === 0 && otherFloatProps.length === 0 && otherBoolProps.length === 0 && intProps.length === 0;
    const singlePendingChanges: PendingChange[] = [
      ...tpleProps
        .filter((p) => edits.has(p.valueOffset) && edits.get(p.valueOffset) !== p.value)
        .map((p) => ({ fileLabel: "", propertyName: TPLE_PROPERTY_INFO[p.name]?.label ?? p.name, oldValue: formatFloatDisplay(p.value), newValue: formatFloatDisplay(edits.get(p.valueOffset)!) })),
      ...tpleBoolProps
        .filter((p) => boolEdits.has(p.valueOffset) && boolEdits.get(p.valueOffset) !== p.value)
        .map((p) => ({ fileLabel: "", propertyName: TPLE_PROPERTY_INFO[p.name]?.label ?? p.name, oldValue: p.value ? "نعم" : "لا", newValue: boolEdits.get(p.valueOffset) ? "نعم" : "لا" })),
      ...tpleIntProps
        .filter((p) => intEdits.has(p.valueOffset) && intEdits.get(p.valueOffset)!.value !== p.value)
        .map((p) => ({ fileLabel: "", propertyName: TPLE_PROPERTY_INFO[p.name]?.label ?? p.name, oldValue: String(p.value), newValue: String(intEdits.get(p.valueOffset)!.value) })),
    ];

    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <div className="border-b p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={standaloneMode ? handleClose : closeEntry}>
              <ArrowLeft className="w-4 h-4 ml-1" /> {standaloneMode ? "رجوع" : "رجوع للقائمة"}
            </Button>
            <div className="min-w-0">
              <div className="font-display font-bold truncate">{shortName}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(viewingEntry.size)} — {totalPropCount} خاصية مكتشَفة</div>
            </div>
          </div>
        </div>

        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <strong className="block mb-1">⚠️ تجريبي</strong>
            هذه البنية استُنتجت من تحليل ملف واحد (وليست من توثيق رسمي). احتفظ بنسخة من الملف الأصلي قبل التعديل، وعدّل قيمة واحدة في كل مرة، وجرّبها داخل اللعبة قبل تعديل المزيد.
          </div>
        </div>

        {entryError && (
          <div className="mx-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{entryError}</span>
          </div>
        )}

        <PendingChangesSummary changes={singlePendingChanges} />

        {totalPropCount > 0 && (
          <div className="mx-3 mb-1 relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={propSearch}
              onChange={(e) => setPropSearch(e.target.value)}
              placeholder={`ابحث بين ${totalPropCount} خاصية...`}
              className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-border bg-background"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {nothingFound ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              لم يُعثر على خصائص معروفة قابلة للتعديل في هذا الملف.
            </div>
          ) : nothingMatchesSearch ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              لا توجد خصائص مطابقة للبحث.
            </div>
          ) : (
            <>
              {movementProps.length > 0 && (
                <div>
                  <div className="font-display font-bold mb-2 flex items-center gap-1.5">🏃 سرعة وحركة</div>
                  <div className="space-y-2">
                    {movementProps.map((p) => (
                      <PropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={edits.get(p.valueOffset) ?? p.value}
                        onChange={updateEditValue}
                        onInfoClick={() => setInfoModalProp({ name: p.name, kind: "float" })}
                      />
                    ))}
                  </div>
                </div>
              )}
              {(physicsFloatProps.length > 0 || physicsProps.length > 0) && (
                <div>
                  <div className="font-display font-bold mb-2 flex items-center gap-1.5">⚙️ فيزياء وتصادم</div>
                  <div className="space-y-2">
                    {physicsFloatProps.map((p) => (
                      <PropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={edits.get(p.valueOffset) ?? p.value}
                        onChange={updateEditValue}
                        onInfoClick={() => setInfoModalProp({ name: p.name, kind: "float" })}
                      />
                    ))}
                    {physicsProps.map((p) => (
                      <BoolPropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={boolEdits.get(p.valueOffset) ?? p.value}
                        onChange={updateBoolEditValue}
                        onInfoClick={() => setInfoModalProp({ name: p.name, kind: "bool" })}
                      />
                    ))}
                  </div>
                </div>
              )}
              {(otherFloatProps.length > 0 || otherBoolProps.length > 0) && (
                <div>
                  <div className="font-display font-bold mb-2 flex items-center gap-1.5">🔧 خصائص أخرى (مكتشَفة تلقائياً)</div>
                  <div className="space-y-2">
                    {otherFloatProps.map((p) => (
                      <PropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={edits.get(p.valueOffset) ?? p.value}
                        onChange={updateEditValue}
                        onInfoClick={() => setInfoModalProp({ name: p.name, kind: "float" })}
                      />
                    ))}
                    {otherBoolProps.map((p) => (
                      <BoolPropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={boolEdits.get(p.valueOffset) ?? p.value}
                        onChange={updateBoolEditValue}
                        onInfoClick={() => setInfoModalProp({ name: p.name, kind: "bool" })}
                      />
                    ))}
                  </div>
                </div>
              )}
              {intProps.length > 0 && (
                <div>
                  <div className="font-display font-bold mb-2 flex items-center gap-1.5">🔢 أرقام صحيحة (مكتشَفة تلقائياً)</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    غالب هذه القيم حالة تشغيل داخلية (مثل تقدّم مهمة أو مؤقّت) وليست إعدادات — عدّل بحذر شديد.
                  </div>
                  <div className="space-y-2">
                    {intProps.map((p) => (
                      <IntPropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={intEdits.get(p.valueOffset)?.value ?? p.value}
                        onChange={updateIntEditValue}
                        onInfoClick={() => setInfoModalProp({ name: p.name, kind: "int", typeName: p.typeName })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {totalPropCount > 0 && (
          <div className="p-3 border-t flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={resetEdits} disabled={!hasEdits}>
              <RotateCcw className="w-4 h-4 ml-1" /> استعادة الأصل
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={downloadEditedFileOnly} className="font-display font-bold">
              <Save className="w-4 h-4 ml-2" /> تنزيل الملف المعدَّل فقط
            </Button>
            {!standaloneMode && (
              <Button
                onClick={() => void buildAndDownloadArchive()}
                disabled={building}
                className="font-display font-bold"
                style={{ backgroundColor: ACCENT, color: "white" }}
              >
                {building ? (
                  <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> جارٍ البناء...</>
                ) : (
                  <><PackageCheck className="w-4 h-4 ml-2" /> بناء وتنزيل الأرشيف كاملاً</>
                )}
              </Button>
            )}
          </div>
        )}

        {infoModalProp && (
          <PropertyInfoModal
            name={infoModalProp.name}
            kind={infoModalProp.kind}
            typeName={infoModalProp.typeName}
            onClose={() => setInfoModalProp(null)}
          />
        )}
      </div>
    );
  }

  if (!file || !header) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center px-4 text-center transition-colors ${dragOver ? "bg-primary/5" : ""}`}
        dir="rtl"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Link to="/risen" className="absolute top-4 right-4">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button>
        </Link>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
          <span className="text-3xl">🗂️</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-3">مدير ملفات Risen 1</h1>
        <p className="text-muted-foreground mb-8 max-w-lg font-body">
          افتح أي أرشيف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.pak</code> أو{" "}
          <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.p00</code> / <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.p01</code> وما شابه
          (مثل images.pak أو templates.p00) لتصفح قائمة ملفاته الداخلية، وافتح أي ملف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.tple</code> داخله
          لعرض وتعديل خصائصه الرقمية (كسرعة الحركة) وبناء الأرشيف كاملاً بالتعديل — أو اختر ملفات/مجلدات لتنزيلها كـZIP،
          أو اسحب الملف وأفلته هنا.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة الملف...
          </div>
        ) : (
          <>
            <Button
              size="lg"
              onClick={fsaSupported ? handleOpenFsa : () => fileInputRef.current?.click()}
              className="font-display font-bold text-lg px-10 py-6"
              style={{ backgroundColor: ACCENT, color: "white" }}
            >
              <FolderOpen className="w-5 h-5 ml-2" /> افتح أرشيفاً
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handlePlainInput} />
          </>
        )}

        {loadError && (
          <div className="mt-6 max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2 items-start text-right">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <div className="border-b p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/risen"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button></Link>
          <div className="min-w-0">
            <div className="font-display font-bold truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(header.totalFileSize)} — {flatFileCount} ملف</div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleClose}><X className="w-4 h-4 ml-1" /> إغلاق</Button>
      </div>

      {treeSizeWarning && (
        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{treeSizeWarning}</span>
        </div>
      )}
      {loadError && (
        <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="p-3 flex items-center gap-3 flex-wrap border-b">
        <Button variant="outline" size="sm" onClick={selectAll}>تحديد الكل</Button>
        <Button variant="outline" size="sm" onClick={clearSelection}>إلغاء التحديد</Button>
        <span className="text-sm text-muted-foreground">
          {selected.size === 0 ? "لا يوجد تحديد" : `${selectedFiles.length} ملف محدد — ${formatBytes(selectedSize)}`}
        </span>
        <Button variant="outline" size="sm" onClick={() => void startBatchScan()} disabled={batchScanning}>
          {batchScanning ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Layers3 className="w-4 h-4 ml-1" />}
          تعديل جماعي عبر الأرشيف
        </Button>
        <div className="flex-1" />
        <Button
          onClick={handleDownloadZip}
          disabled={selectedFiles.length === 0 || zipping}
          className="font-display font-bold"
          style={{ backgroundColor: ACCENT, color: "white" }}
        >
          {zipping ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              {zipProgress ? `جارٍ الضغط... ${zipProgress.current}/${zipProgress.total}` : "جارٍ الضغط..."}
            </>
          ) : (
            <>
              <Download className="w-4 h-4 ml-2" /> تنزيل ZIP
            </>
          )}
        </Button>
      </div>

      <div className="px-3 pt-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder={`ابحث بين ${flatFileCount} ملف...`}
            className="w-full pr-9 pl-3 py-1.5 text-sm rounded-lg border border-border bg-background"
          />
        </div>
        <select
          value={treeSortBy}
          onChange={(e) => setTreeSortBy(e.target.value as TreeSortBy)}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="name">ترتيب بالاسم</option>
          <option value="size">ترتيب بالحجم</option>
        </select>
        <button
          onClick={() => setTreeSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
          title={treeSortDir === "asc" ? "تصاعدي" : "تنازلي"}
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>
      </div>

      {entryLoading && (
        <div className="mx-3 mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ فتح الملف...
        </div>
      )}
      {entryError && (
        <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{entryError}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {displayedTree.length === 0 && treeSearch.trim() && (
          <div className="text-sm text-muted-foreground p-4 text-center">لا توجد ملفات مطابقة للبحث.</div>
        )}
        {displayedTree.map((node) => (
          <TreeRow
            key={node.name}
            node={node}
            path={node.name}
            depth={0}
            expanded={effectiveExpanded}
            toggleExpanded={toggleExpanded}
            selected={selected}
            toggleSelected={toggleSelected}
            onOpenFile={(p, o, s) => void openEntry(p, o, s)}
            onDownloadFile={(p, o, s) => void downloadFileDirect(p, o, s)}
          />
        ))}
      </div>
    </div>
  );
};

export default RisenFileManager;
