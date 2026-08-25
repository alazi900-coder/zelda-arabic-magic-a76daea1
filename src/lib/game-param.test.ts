import { describe, expect, it } from "vitest";
import { resolveGameParam } from "./game-param";

describe("resolveGameParam", () => {
  it("identifies GTA IV editor identities without changing the default game", () => {
    expect(resolveGameParam("gtaiv/MAIN")).toBe("gtaiv");
    expect(resolveGameParam("gtaiv/WEBPAGE")).toBe("gtaiv");
    expect(resolveGameParam("ordinary_file")).toBe("xenoblade");
  });
});
