import { describe, expect, it } from "vitest";
import { categorizeSteinsGateEntry } from "../steinsgate-categories";
import { extractSteinsGateTags, repairSteinsGateTags, validateSteinsGateTags } from "../steinsgate-tags";
import { resolveGameParam } from "@/lib/game-param";

const entry = (file: string, original = "Text") => ({
  msbtFile: `steinsgate/${file}`,
  index: 0,
  label: "0",
  original,
});

describe("Steins;Gate PSP support", () => {
  it("routes the game to its own AI prompt", () => {
    expect(resolveGameParam("steinsgate/SG00_01.BIN")).toBe("steinsgate");
  });

  it("classifies menus and story dialogue separately", () => {
    expect(categorizeSteinsGateEntry(entry("DMENU.BIN"))).toBe("sg-main-menu");
    expect(categorizeSteinsGateEntry(entry("SG02_11.BIN"))).toBe("sg-dialogue");
  });

  it("recognizes and validates engine commands in order", () => {
    expect(extractSteinsGateTags("Hello%CF8FF8world%K%P")).toEqual(["%CF8FF8", "%K", "%P"]);
    expect(validateSteinsGateTags("Hello%K%P", "مرحبا%K%P").valid).toBe(true);
    expect(validateSteinsGateTags("Hello%K%P", "مرحبا%P%K").valid).toBe(false);
  });

  it("restores an unambiguous command suffix", () => {
    expect(repairSteinsGateTags("Hello%K%P", "مرحبا")).toEqual({ text: "مرحبا%K%P", changed: true });
  });
});
