import { describe, it, expect } from "vitest";
import { categorizeBdatTable, categorizeByFilename, isMainMenuText } from "@/components/editor/types";

describe("categorizeBdatTable - table name prefixes", () => {
  it("classifies MNU_ShopList as shop menu", () => {
    expect(categorizeBdatTable("MNU_ShopList[0].Msg_Name")).toBe("bdat-menu-shop");
  });
  it("classifies BTL_Arts as skill (arts are skills)", () => {
    expect(categorizeBdatTable("BTL_Arts[5].Name")).toBe("bdat-skill");
  });
  it("classifies QST_ tables as quest", () => {
    expect(categorizeBdatTable("QST_List[10].Title")).toBe("bdat-quest");
  });
  it("classifies FLD_MapInfo as field", () => {
    expect(categorizeBdatTable("FLD_MapInfo[2].Name")).toBe("bdat-field");
  });
  it("classifies ITM_Weapon as weapon", () => {
    expect(categorizeBdatTable("ITM_Weapon[3].Name")).toBe("bdat-weapon");
  });
  it("classifies msg_mnu_option as title-menu", () => {
    expect(categorizeBdatTable("msg_mnu_option[0].caption")).toBe("bdat-title-menu");
  });
  it("classifies EVT_ as story", () => {
    expect(categorizeBdatTable("EVT_Scene[1].Text")).toBe("bdat-story");
  });
  it("classifies DLC_ as dlc", () => {
    expect(categorizeBdatTable("DLC_Quest[0].Name")).toBe("bdat-dlc");
  });
});

describe("categorizeBdatTable - script_msg cinematic & talk subcategories", () => {
  it("classifies vs* tables as cutscene", () => {
    expect(categorizeBdatTable("vs01070100_ms[0].name")).toBe("bdat-cutscene");
    expect(categorizeBdatTable("vs02110100_ms[3].text")).toBe("bdat-cutscene");
  });
  it("classifies addkizunatalk* as Heart-to-Heart", () => {
    expect(categorizeBdatTable("addkizunatalk001_ms[0].name")).toBe("bdat-kizuna-talk");
    expect(categorizeBdatTable("addkizunatalk012_ms[5].text")).toBe("bdat-kizuna-talk");
  });
  it("classifies qst<digits>_ms as quest dialogue", () => {
    expect(categorizeBdatTable("qst001301_ms[0].name")).toBe("bdat-quest-dialogue");
    expect(categorizeBdatTable("qst020602_ms[3].text")).toBe("bdat-quest-dialogue");
  });
  it("preserves QST_ list classification (not dialogue)", () => {
    expect(categorizeBdatTable("QST_List[0].Title")).toBe("bdat-quest");
  });
  it("classifies addnpctalk* as NPC talk", () => {
    expect(categorizeBdatTable("addnpctalk001_ms[0].text")).toBe("bdat-npc-talk");
  });
  it("classifies addcamptalk* as camp talk", () => {
    expect(categorizeBdatTable("addcamptalk001_ms[0].text")).toBe("bdat-camp-talk");
  });
});

describe("categorizeBdatTable - column name fallback (smart classification)", () => {
  it("classifies unknown table with Window column as menu", () => {
    expect(categorizeBdatTable("UnknownTable[0].WindowTitle")).toBe("bdat-menu");
  });
  it("classifies hex-hash table with task column as quest", () => {
    expect(categorizeBdatTable("0xABCD1234[3].TaskUI")).toBe("bdat-quest");
  });
  it("classifies unknown table with landmark column as field", () => {
    expect(categorizeBdatTable("SomeTable[1].LandmarkName")).toBe("bdat-field");
  });
  it("classifies unknown table with weapon column as weapon", () => {
    expect(categorizeBdatTable("SomeTable[5].WeaponType")).toBe("bdat-weapon");
  });
  it("classifies unknown table with voice column as settings", () => {
    expect(categorizeBdatTable("SomeTable[0].VoiceVolume")).toBe("bdat-settings");
  });
  it("classifies unknown table with BtnCaption as menu", () => {
    expect(categorizeBdatTable("RandomHash[2].BtnCaption")).toBe("bdat-menu");
  });
});

describe("categorizeBdatTable - Stage 3: filename fallback", () => {
  it("classifies hex-hash entries using field.bdat filename", () => {
    expect(categorizeBdatTable("<0x8b7d949b>[0].<0x0000001a>", "field.bdat")).toBe("bdat-field");
  });
  it("classifies hex-hash entries using dlc.bdat filename", () => {
    expect(categorizeBdatTable("<0x18d9e310>[0].<0x00000006>", "dlc.bdat")).toBe("bdat-dlc");
  });
  it("classifies hex-hash entries using battle.bdat filename", () => {
    expect(categorizeBdatTable("<0xDEADBEEF>[0].<0xFACEFEED>", "battle.bdat")).toBe("bdat-battle");
  });
  it("classifies hex-hash entries using quest.bdat filename", () => {
    expect(categorizeBdatTable("<0xABC>[0].<0xDEF>", "quest.bdat")).toBe("bdat-quest");
  });
  it("classifies hex-hash entries using system.bdat filename", () => {
    expect(categorizeBdatTable("<0x50219162>[0].<0x00000009>", "system.bdat")).toBe("bdat-system");
  });
  it("returns other for unknown filename with hex hashes", () => {
    expect(categorizeBdatTable("<0xDEADBEEF>[0].<0xFACEFEED>", "zzz.bdat")).toBe("other");
  });
  it("returns other for truly unknown entries without filename", () => {
    expect(categorizeBdatTable("0xDEADBEEF[0].0xFACEFEED")).toBe("other");
  });
  it("returns other for unrecognizable labels", () => {
    expect(categorizeBdatTable("Unknown[0].SomeRandomCol")).toBe("other");
  });
});

describe("categorizeBdatTable - Stage 4: content-based detection", () => {
  it("classifies 'New Game' text as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "New Game")).toBe("bdat-title-menu");
  });
  it("classifies 'Continue' text as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "Continue")).toBe("bdat-title-menu");
  });
  it("classifies 'Settings' text as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "Settings")).toBe("bdat-title-menu");
  });
  it("classifies 'Options' text as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "Options")).toBe("bdat-title-menu");
  });
  it("classifies 'Quit' as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "Quit")).toBe("bdat-title-menu");
  });
  it("classifies 'Load Game' as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "Load Game")).toBe("bdat-title-menu");
  });
  it("does NOT classify long text with 'continue' as title-menu", () => {
    expect(categorizeBdatTable("Unknown[0].SomeCol", undefined, "Please continue walking down the path to find the treasure")).toBe("other");
  });
  it("table-name classification takes priority over content", () => {
    expect(categorizeBdatTable("BTL_Arts[0].Name", undefined, "New Game")).toBe("bdat-skill");
  });
});

describe("isMainMenuText", () => {
  it("matches exact title-screen strings", () => {
    expect(isMainMenuText("New Game")).toBe(true);
    expect(isMainMenuText("Continue")).toBe(true);
    expect(isMainMenuText("Options")).toBe(true);
    expect(isMainMenuText("Quit")).toBe(true);
    expect(isMainMenuText("Title Screen")).toBe(true);
  });
  it("matches short phrases with keywords", () => {
    expect(isMainMenuText("Save Data")).toBe(true);
    expect(isMainMenuText("Load Save")).toBe(true);
  });
  it("rejects long sentences", () => {
    expect(isMainMenuText("You can continue your journey by talking to the elder")).toBe(false);
  });
  it("rejects unrelated short text", () => {
    expect(isMainMenuText("Hello")).toBe(false);
    expect(isMainMenuText("Attack")).toBe(false);
  });
});
