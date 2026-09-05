import { describe, expect, it } from "vitest";
import { resolveGameParam } from "./game-param";

describe("resolveGameParam", () => {
  it("identifies GTA IV editor identities without changing the default game", () => {
    expect(resolveGameParam("gtaiv/MAIN")).toBe("gtaiv");
    expect(resolveGameParam("gtaiv/WEBPAGE")).toBe("gtaiv");
    expect(resolveGameParam("ordinary_file")).toBe("xenoblade");
  });

  it("identifies Pokémon Platinum without falling back to Xenoblade", () => {
    expect(resolveGameParam("platinum/main_menu_alerts")).toBe("platinum");
    expect(resolveGameParam("platinum/rowan_intro")).toBe("platinum");
  });
});
