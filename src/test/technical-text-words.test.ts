import { describe, it, expect } from "vitest";
import { isTechnicalText } from "@/components/editor/types";

/**
 * Two rules meant for identifiers were eating ordinary interface words.
 *
 *  - the short-code rule flagged anything ≤6 characters that was not
 *    Capitalised, so YES, NO, ON, OFF, EXIT, USE and CANCEL were hidden;
 *  - the hex rule flagged any string built only from a-f and punctuation,
 *    which is how "Bed", "Feb." and "Face" — real words — became "technical".
 *
 * Measured over the 21,995 English strings in the Platinum decomp, the two
 * together flagged 1,213 rows; requiring a digit brings that to 223, and every
 * one of those is a separator, a symbol, a floor label or a sequence id.
 *
 * A rule that catches nothing is as bad as one that catches everything, so the
 * second half of this file pins down what must still be caught.
 */
describe("isTechnicalText — ordinary words are not identifiers", () => {
  const plat = "platinum/menu_entries";

  it.each(["YES", "NO", "ON", "OFF", "EXIT", "USE", "GIVE", "CANCEL", "CHECK", "MAIL", "MONEY", "No"])(
    "treats %s as translatable text", (word) => {
      expect(isTechnicalText(word, plat)).toBe(false);
    });

  it.each(["Bed", "Feb.", "Dec.", "Face", "Dead", "Cab"])(
    "does not mistake %s for a hex identifier", (word) => {
      // every letter is a valid hex digit, which is the whole trap
      expect(/^[0-9A-Fa-f\-\._:\/]+$/.test(word)).toBe(true);
      expect(isTechnicalText(word, plat)).toBe(false);
    });

  it("still hides genuine short codes", () => {
    for (const code of ["zY1", "yY1", "xA3", "a1b2c3", "1F", "B2F", "D-01", "PV001", "FANFA1"]) {
      expect(isTechnicalText(code, plat), code).toBe(true);
    }
  });

  it("still hides rows with no letters at all", () => {
    for (const junk of [" -", "---", "/", "???", "...", "--:--", ":", "1", "0"]) {
      expect(isTechnicalText(junk, plat), junk).toBe(true);
    }
  });

  it("still hides paths and camel/snake identifiers", () => {
    expect(isTechnicalText("path/to/file", plat)).toBe(true);
    expect(isTechnicalText("getItemName", plat)).toBe(true);
    expect(isTechnicalText("item_name", plat)).toBe(true);
  });

  it("leaves other games' dedicated rules alone", () => {
    const gta = "gtaiv/american.gxt";
    expect(isTechnicalText("~MOUSE_WHEEL~", gta)).toBe(true);
    expect(isTechnicalText("FCJ_ACT_DARTS_LEAVE_LOST", gta)).toBe(true);
  });
});
