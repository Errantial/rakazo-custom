import { CreateBotInput } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { botCardCreation, botCreateFields } from "./bot-card-create.js";

const card = {
  spec: "chara_card_v2",
  data: {
    name: "Mira",
    description: "Mira keeps the town's old maps.",
    personality: "Patient and exact.",
    scenario: "A map room after closing.",
    first_mes: "Hello, {{user}}. I am {{char}}.",
    mes_example: "<START>\n{{user}}: Which road?\n{{char}}: The north one.\n<END>",
  },
};

describe("bot creation from a character card", () => {
  it("seeds the profile and opening line from the card", () => {
    const seed = botCardCreation(card, { userName: "Ada Lovelace" });

    expect(seed?.profile.name).toBe("Mira");
    expect(seed?.profile.description).toBe("Mira keeps the town's old maps.");
    expect(seed?.profile.instructions).toContain("## Personality\n\nPatient and exact.");
    expect(seed?.profile.instructions).toContain("## Setting\n\nA map room after closing.");
    expect(seed?.profile.instructions).toContain("Mira: The north one.");
    expect(seed?.greeting).toBe("Hello, Ada Lovelace. I am Mira.");
  });

  it("returns nothing for a card with nothing usable", () => {
    expect(botCardCreation({}, { userName: "Ada" })).toBeUndefined();
    expect(botCardCreation("not a card", { userName: "Ada" })).toBeUndefined();
    expect(botCardCreation({ description: "No name" }, { userName: "Ada" })).toBeUndefined();
  });

  it("keeps the typed name when the card has content but no name", () => {
    const seed = botCardCreation(
      { description: "A nameless stranger." },
      { userName: "Ada", fallbackName: "New Bot" },
    );

    expect(seed?.profile.name).toBe("New Bot");
    expect(seed?.profile.instructions).toBe("## Canon\n\nA nameless stranger.");
  });

  it("creates with the card profile instead of the typed fields", () => {
    const input = CreateBotInput.parse({
      name: "New Bot",
      description: "typed description",
      instructions: "typed instructions",
      characterCard: card,
    });

    const { fields, greeting, skipIntro } = botCreateFields(input, "Ada Lovelace");

    expect(fields.name).toBe("Mira");
    expect(fields.description).toBe("Mira keeps the town's old maps.");
    expect(fields.instructions).toContain("## Canon");
    expect(fields).not.toHaveProperty("characterCard");
    expect(greeting).toBe("Hello, Ada Lovelace. I am Mira.");
    expect(skipIntro).toBe(true);
  });

  it("leaves typed fields alone when the card only authors a name", () => {
    const input = CreateBotInput.parse({
      name: "New Bot",
      description: "typed description",
      instructions: "typed instructions",
      characterCard: { name: "Mira" },
    });

    const { fields, greeting, skipIntro } = botCreateFields(input, "Ada");

    expect(fields.name).toBe("Mira");
    expect(fields.description).toBe("typed description");
    expect(fields.instructions).toBe("typed instructions");
    expect(greeting).toBeUndefined();
    expect(skipIntro).toBe(false);
  });

  it("skips the intro for a greeting-only card and keeps the typed name", () => {
    const input = CreateBotInput.parse({ name: "T", characterCard: { first_mes: "hi" } });

    const { fields, greeting, skipIntro } = botCreateFields(input, "Ada");

    expect(fields.name).toBe("T");
    expect(fields.instructions).toBe("");
    expect(greeting).toBe("hi");
    expect(skipIntro).toBe(true);
  });

  it("falls back to an ordinary bot when the card is unusable", () => {
    const input = CreateBotInput.parse({ name: "New Bot", characterCard: { garbage: true } });

    const { fields, greeting, skipIntro } = botCreateFields(input, "Ada");

    expect(fields).toEqual({
      name: "New Bot",
      description: "",
      instructions: "",
      notifyOnFinish: true,
      computerMode: "team",
    });
    expect(greeting).toBeUndefined();
    expect(skipIntro).toBe(false);
  });

  it("creates an ordinary bot when no card is sent", () => {
    const input = CreateBotInput.parse({ name: "New Bot" });

    const { fields, greeting, skipIntro } = botCreateFields(input, "Ada");

    expect(fields.name).toBe("New Bot");
    expect(fields.instructions).toBe("");
    expect(greeting).toBeUndefined();
    expect(skipIntro).toBe(false);
  });
});
