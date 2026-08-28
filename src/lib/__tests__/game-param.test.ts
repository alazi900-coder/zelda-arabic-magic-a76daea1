import { resolveGameParam } from "@/lib/game-param";

describe("resolveGameParam", () => {
  it("keeps Pokémon Essentials tables separate from Pokémon GBA", () => {
    expect(resolveGameParam("pokemon-xp/section-24")).toBe("pokemon-xp");
    expect(resolveGameParam("pkm_rom")).toBe("pokemon");
  });
});
