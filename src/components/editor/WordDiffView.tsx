import React, { useMemo } from "react";
import { diffWords } from "@/lib/word-diff";

interface WordDiffViewProps {
  oldText: string;
  newText: string;
  /** rtl by default since translations are Arabic */
  dir?: "rtl" | "ltr" | "auto";
  className?: string;
}

/**
 * Renders a word-level colored diff between two strings.
 * - Removed words: red strike-through
 * - Added words: green underline
 * - Unchanged: normal
 */
const WordDiffView: React.FC<WordDiffViewProps> = ({ oldText, newText, dir = "rtl", className }) => {
  const tokens = useMemo(() => diffWords(oldText || "", newText || ""), [oldText, newText]);

  return (
    <p className={className} dir={dir}>
      {tokens.map((t, i) => {
        if (t.op === "equal") return <span key={i}>{t.text}</span>;
        if (t.op === "del") {
          return (
            <span
              key={i}
              className="bg-destructive/15 text-destructive line-through decoration-destructive/60 rounded px-0.5"
            >
              {t.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="bg-primary/15 text-primary border-b-2 border-primary/60 rounded px-0.5"
          >
            {t.text}
          </span>
        );
      })}
    </p>
  );
};

export default WordDiffView;
