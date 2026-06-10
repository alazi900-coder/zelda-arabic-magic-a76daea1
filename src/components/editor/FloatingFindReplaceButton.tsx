import { useEffect, useRef, useState, useCallback } from "react";
import { Search } from "lucide-react";

/**
 * Small draggable circular FAB that opens the global Find & Replace panel.
 * Position is persisted in localStorage. Drag vs click is disambiguated by
 * a small movement threshold so accidental clicks while dragging are avoided.
 */
const STORAGE_KEY = "find-replace-fab-pos";
const SIZE = 48;
const DRAG_THRESHOLD = 5;

interface Pos { x: number; y: number; }

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.x === "number" && typeof p.y === "number") return p;
    }
  } catch {}
  // Default: bottom-left
  return { x: 16, y: Math.max(80, window.innerHeight - 80) };
}

function clampPos(p: Pos): Pos {
  const maxX = Math.max(0, window.innerWidth - SIZE);
  const maxY = Math.max(0, window.innerHeight - SIZE);
  return { x: Math.min(Math.max(0, p.x), maxX), y: Math.min(Math.max(0, p.y), maxY) };
}

export function FloatingFindReplaceButton({ onClick }: { onClick: () => void }) {
  const [pos, setPos] = useState<Pos>(() => clampPos(loadPos()));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean; pointerId: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    btnRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: pos.x, origY: pos.y,
      moved: false, pointerId: e.pointerId,
    };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos(clampPos({ x: d.origX + dx, y: d.origY + dy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    btnRef.current?.releasePointerCapture(e.pointerId);
    if (d.moved) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
    } else {
      onClick();
    }
    dragRef.current = null;
  }, [pos, onClick]);

  return (
    <button
      ref={btnRef}
      aria-label="بحث واستبدال شامل"
      title="بحث واستبدال شامل (اسحب لتحريك)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        touchAction: "none",
        zIndex: 99,
      }}
      className="rounded-full shadow-xl bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center border-2 border-background/40 hover:scale-105 active:scale-95 transition-transform cursor-grab active:cursor-grabbing"
    >
      <Search className="h-5 w-5" />
    </button>
  );
}

export default FloatingFindReplaceButton;
