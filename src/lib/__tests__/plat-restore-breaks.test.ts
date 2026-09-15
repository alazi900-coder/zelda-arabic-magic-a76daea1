import { describe, it, expect } from "vitest";
import { restoreBreaks, onlyBreaksChanged, breakSequence } from "@/lib/nds/plat-restore-breaks";

describe("restoring lost pauses", () => {
  it("cuts the translation after the sentence the English cuts after", () => {
    const en = "One. Two.▼\nThree.";
    const ar = "واحد. اثنان.\nثلاثة.";
    expect(restoreBreaks(en, ar)).toBe("واحد. اثنان.▼\nثلاثة.");
  });

  it("keeps each pause its own kind", () => {
    expect(restoreBreaks("A.▽\nB.", "أ.\nب.")).toBe("أ.▽\nب.");
  });

  it("handles more than one pause", () => {
    expect(restoreBreaks("A.▼\nB.▼\nC.", "أ.\nب.\nج.")).toBe("أ.▼\nب.▼\nج.");
  });

  it("gives a trailing pause no newline after it", () => {
    expect(restoreBreaks("A.▼", "أ.")).toBe("أ.▼");
  });

  it("re-cuts a partly damaged message from scratch", () => {
    expect(restoreBreaks("A.▼\nB.▼\nC.", "أ.▼\nب. ج.")).toBe("أ.▼\nب.▼\nج.");
  });

  it("puts back a closing pause even when the Arabic has no sentence to count", () => {
    // The commonest shape in the game (5,046 of them) and the one the sentence
    // rule alone could never answer: nothing follows the pause to align to.
    expect(restoreBreaks("Get out of here!▼", "ﺍﺧﺮﺝ ﻣﻦ ﻫﻨﺎ!")).toBe("ﺍﺧﺮﺝ ﻣﻦ ﻫﻨﺎ!▼");
  });

  it("replaces the newline a flattened closing pause left behind", () => {
    expect(restoreBreaks("Bye.▼", "ﻭﺩﺍﻋﺎ.\n")).toBe("ﻭﺩﺍﻋﺎ.▼");
  });

  it("places an inner pause and the closing one together", () => {
    expect(restoreBreaks("A. B.▼\nC.▼", "أ. ب.\nج.\n")).toBe("أ. ب.▼\nج.▼");
  });

  it("abstains when the Arabic has too few sentences to place them", () => {
    expect(restoreBreaks("A.▼\nB.▼\nC.", "جملة واحدة فقط")).toBeNull();
  });

  it("abstains when the original has no pause at all", () => {
    expect(restoreBreaks("A.\nB.", "أ.\nب.")).toBeNull();
  });

  it("never invents or drops a word", () => {
    const got = restoreBreaks("One. Two.▼\nThree.", "واحد. اثنان.\nثلاثة.")!;
    expect(onlyBreaksChanged("واحد. اثنان.\nثلاثة.", got)).toBe(true);
  });

  it("catches a candidate that changed a word", () => {
    expect(onlyBreaksChanged("أ. ب.", "أ. ج.")).toBe(false);
  });

  it("reads back the sequence of pauses a message asks for", () => {
    expect(breakSequence("A▼B▽C▼")).toBe("▼▽▼");
  });
});
