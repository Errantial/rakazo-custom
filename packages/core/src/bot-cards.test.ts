import { BOT_INSTRUCTIONS_MAX_LENGTH, BOT_NAME_MAX_LENGTH } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import type { BotCardData } from "./bot-cards.js";
import {
  BOT_CARD_GREETING_MAX_LENGTH,
  botCardSeed,
  cardBotProfile,
  characterCardBot,
  expandCardMacros,
  parseCharacterCard,
  readCharacterCardFile,
} from "./bot-cards.js";

const v2Card = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "  Mira  ",
    description: "  Keeper of the north light.\n\nShe keeps every promise.  ",
    personality: "  Wry, patient, slow to warm.  ",
    scenario: "  A stormbound lighthouse on the last night of autumn.  ",
    first_mes: "  You made it through the gale.  ",
    alternate_greetings: ["  Welcome back.  ", "You made it through the gale.", "   "],
    mes_example:
      "<START>\n{{user}}: Is the light working?\n{{char}}: It always is.\n<START>\n{{user}}: Thank you.\n{{char}}: Sleep, then.<END>",
    system_prompt: "  Stay in character.  ",
    post_history_instructions: "  Never write {{user}}'s lines.  ",
    creator_notes: "ignored",
    tags: ["roleplay"],
  },
};

function card(overrides: Partial<BotCardData> = {}): BotCardData {
  return {
    name: "Mira",
    description: "",
    personality: "",
    scenario: "",
    greetings: [],
    exampleMessages: [],
    systemPrompt: "",
    postHistoryInstructions: "",
    ...overrides,
  };
}

function sectionBody(instructions: string, heading: string): string {
  const marker = `## ${heading}\n\n`;
  const start = instructions.indexOf(marker);
  if (start < 0) return "";
  const bodyStart = start + marker.length;
  const next = instructions.indexOf("\n\n## ", bodyStart);
  return instructions.slice(bodyStart, next < 0 ? undefined : next);
}

describe("character card parsing", () => {
  it("reads a V2 envelope from its data payload", () => {
    const parsed = parseCharacterCard(v2Card);
    expect(parsed).toEqual({
      name: "Mira",
      description: "Keeper of the north light.\n\nShe keeps every promise.",
      personality: "Wry, patient, slow to warm.",
      scenario: "A stormbound lighthouse on the last night of autumn.",
      greetings: ["You made it through the gale.", "Welcome back."],
      exampleMessages: [
        "{{user}}: Is the light working?\n{{char}}: It always is.",
        "{{user}}: Thank you.\n{{char}}: Sleep, then.",
      ],
      systemPrompt: "Stay in character.",
      postHistoryInstructions: "Never write {{user}}'s lines.",
    });
  });

  it("reads a flat V1 card", () => {
    const parsed = parseCharacterCard({
      name: "Ivo",
      description: "A cartographer of drowned coasts.",
      first_mes: "The tide took the road again.",
      alternate_greetings: [],
      mes_example: "Ivo: We walk inland.",
      system_prompt: "",
      post_history_instructions: "",
    });
    expect(parsed?.name).toBe("Ivo");
    expect(parsed?.greetings).toEqual(["The tide took the road again."]);
    expect(parsed?.exampleMessages).toEqual(["Ivo: We walk inland."]);
    expect(parsed?.personality).toBe("");
  });

  it("reads a V3 envelope", () => {
    const parsed = parseCharacterCard({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Sable",
        description: "Runs the night market.",
        personality: "Brisk.",
        scenario: "Closing hour.",
        first_mes: "Everything is half price now.",
        alternate_greetings: ["You are late."],
        mes_example: '<START>"Deal?"<END>',
        system_prompt: "Keep it terse.",
        post_history_instructions: "Offer no discounts.",
      },
    });
    expect(parsed?.name).toBe("Sable");
    expect(parsed?.greetings).toEqual(["Everything is half price now.", "You are late."]);
    expect(parsed?.exampleMessages).toEqual(['"Deal?"']);
    expect(parsed?.systemPrompt).toBe("Keep it terse.");
  });

  it("returns undefined when nothing usable exists", () => {
    expect(parseCharacterCard(undefined)).toBeUndefined();
    expect(parseCharacterCard(null)).toBeUndefined();
    expect(parseCharacterCard("a card")).toBeUndefined();
    expect(parseCharacterCard([])).toBeUndefined();
    expect(parseCharacterCard({})).toBeUndefined();
    expect(parseCharacterCard({ spec: "chara_card_v2" })).toBeUndefined();
    expect(parseCharacterCard({ spec: "chara_card_v2", data: {} })).toBeUndefined();
    expect(parseCharacterCard({ name: 42, description: ["not", "text"] })).toBeUndefined();
  });

  it("keeps content even when the name is missing", () => {
    const parsed = parseCharacterCard({ description: "  A nameless stranger.  " });
    expect(parsed?.name).toBe("");
    expect(parsed?.description).toBe("A nameless stranger.");
  });

  it("splits example exchanges on <START> and drops <END> markers", () => {
    const parsed = parseCharacterCard({
      name: "Mira",
      mes_example: "  <START>  one  <START>two<END>  <START>   ",
    });
    expect(parsed?.exampleMessages).toEqual(["one", "two"]);
  });

  it("ignores non-string greeting entries", () => {
    const parsed = parseCharacterCard({
      name: "Mira",
      alternate_greetings: ["Hi", 7, null, { text: "no" }],
    });
    expect(parsed?.greetings).toEqual(["Hi"]);
  });

  it("treats text before the first <START> as an example", () => {
    const parsed = parseCharacterCard({
      name: "Mira",
      mes_example: "Mira: Come in.<START>A: Hello?",
    });
    expect(parsed?.exampleMessages).toEqual(["Mira: Come in.", "A: Hello?"]);
  });

  it("clamps every greeting before deduplicating", () => {
    const long = "g".repeat(BOT_CARD_GREETING_MAX_LENGTH + 50);
    const sameFirst = `${"g".repeat(BOT_CARD_GREETING_MAX_LENGTH)}different ending`;
    const parsed = parseCharacterCard({
      name: "Mira",
      first_mes: long,
      alternate_greetings: [sameFirst, "short one", long],
    });
    expect(parsed?.greetings).toEqual(["g".repeat(BOT_CARD_GREETING_MAX_LENGTH), "short one"]);
  });
});

describe("character card files", () => {
  const utf8 = (text: string) => new TextEncoder().encode(text);
  const base64 = (text: string) => btoa(String.fromCharCode(...utf8(text)));

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(utf8(type), 4);
    out.set(data, 8);
    return out;
  }

  function png(...chunks: Uint8Array[]): Uint8Array {
    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", new Uint8Array(13)),
      ...chunks,
      chunk("IEND", new Uint8Array()),
    ];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  const text = (keyword: string, value: string) => chunk("tEXt", utf8(`${keyword}\0${value}`));

  it("reads card JSON, with or without a byte-order mark", () => {
    expect(readCharacterCardFile(utf8('{"name":"Mira"}'))).toEqual({ name: "Mira" });
    expect(readCharacterCardFile(utf8('﻿{"name":"Mira"}'))).toEqual({ name: "Mira" });
  });

  it("reads the base64 card from a PNG chara chunk", () => {
    const file = png(text("chara", base64('{"name":"Mïra ✦"}')));
    expect(readCharacterCardFile(file)).toEqual({ name: "Mïra ✦" });
  });

  it("prefers the V3 chunk when a PNG carries both", () => {
    const file = png(
      text("chara", base64('{"name":"Old"}')),
      text("ccv3", base64('{"name":"New"}')),
    );
    expect(readCharacterCardFile(file)).toEqual({ name: "New" });
  });

  it("reads an uncompressed iTXt chunk and skips a compressed one", () => {
    const itxt = (flag: number) =>
      chunk(
        "iTXt",
        new Uint8Array([...utf8("chara"), 0, flag, 0, 0, 0, ...utf8(base64('{"name":"Mira"}'))]),
      );
    expect(readCharacterCardFile(png(itxt(0)))).toEqual({ name: "Mira" });
    expect(readCharacterCardFile(png(itxt(1)))).toBeUndefined();
  });

  it("reads nothing from a PNG without a card, a truncated PNG, or other bytes", () => {
    const withCard = png(text("chara", base64('{"name":"Mira"}')));
    expect(readCharacterCardFile(png(text("Comment", "hello")))).toBeUndefined();
    expect(readCharacterCardFile(withCard.subarray(0, 40))).toBeUndefined();
    expect(readCharacterCardFile(utf8("not a card"))).toBeUndefined();
    expect(readCharacterCardFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeUndefined();
    expect(readCharacterCardFile(new Uint8Array())).toBeUndefined();
  });

  it("reads a long keyword as no text chunk instead of throwing", () => {
    const long = png(text("k".repeat(200_000), "value"));
    expect(() => readCharacterCardFile(long)).not.toThrow();
    expect(readCharacterCardFile(long)).toBeUndefined();
  });

  it("skips a keyword longer than the PNG limit even beside a card chunk", () => {
    const file = png(text("k".repeat(120_000), "value"), text("chara", base64('{"name":"Mira"}')));
    expect(readCharacterCardFile(file)).toEqual({ name: "Mira" });
  });

  it("names the bot from a card that wrote instructions and a greeting, and skips the intro", () => {
    const card = {
      name: "Mira",
      description: "A harbour pilot who reads the weather before anyone else.",
      first_mes: "You're late, and the tide is already turning.",
    };
    expect(characterCardBot(utf8(JSON.stringify(card)), { fallbackName: "New Bot" })).toEqual({
      name: "Mira",
      description: "A harbour pilot who reads the weather before anyone else.",
      characterCard: card,
      skipIntro: true,
    });
  });

  it("keeps the intro for a card that only names the bot", () => {
    expect(
      characterCardBot(utf8(JSON.stringify({ name: "Mira" })), { fallbackName: "New Bot" }),
    ).toEqual({
      name: "Mira",
      description: "",
      characterCard: { name: "Mira" },
      skipIntro: false,
    });
  });

  it("keeps the caller's name for a card that only wrote content", () => {
    const card = { description: "A nameless stranger." };
    expect(characterCardBot(utf8(JSON.stringify(card)), { fallbackName: "New Bot" })).toEqual({
      name: "New Bot",
      description: "A nameless stranger.",
      characterCard: card,
      skipIntro: true,
    });
  });

  it("finds no bot in a file that holds no usable card", () => {
    expect(
      characterCardBot(utf8("name,age\nMira,30\n"), { fallbackName: "New Bot" }),
    ).toBeUndefined();
    expect(
      characterCardBot(utf8(JSON.stringify({ hello: "world" })), { fallbackName: "New Bot" }),
    ).toBeUndefined();
  });

  it("names the bot from a card inside a PNG", () => {
    const file = png(text("chara", base64(JSON.stringify({ name: "Mira", first_mes: "Hi." }))));
    expect(characterCardBot(file, { fallbackName: "New Bot" })).toMatchObject({
      name: "Mira",
      skipIntro: true,
    });
  });
});

describe("card macros", () => {
  it("replaces char and user tokens case-insensitively", () => {
    expect(
      expandCardMacros("{{CHAR}} meets {{User}}.", { charName: "Mira", userName: "Sam" }),
    ).toBe("Mira meets Sam.");
  });

  it("leaves an unnamed character's token and unknown macros alone", () => {
    expect(expandCardMacros("{{char}} waits for {{user}} at {{time}}.", { charName: "Mira" })).toBe(
      "Mira waits for the user at {{time}}.",
    );
    expect(expandCardMacros("{{char}} and {{user}}", { charName: "  ", userName: "" })).toBe(
      "{{char}} and the user",
    );
  });

  it("only replaces the exact token, so spaced or longer names stay authored text", () => {
    expect(expandCardMacros("{{ char }} und {{character}}", { charName: "Mira" })).toBe(
      "{{ char }} und {{character}}",
    );
    expect(expandCardMacros("{{Char}} and {{USER}}", { charName: "Mira", userName: "Sam" })).toBe(
      "Mira and Sam",
    );
  });
});

describe("card to bot profile", () => {
  it("composes sections in a fixed order", () => {
    const profile = cardBotProfile(
      card({
        description: "Keeper of the north light.",
        personality: "Wry.",
        scenario: "A stormbound lighthouse.",
        exampleMessages: ["{{user}}: Is the light working?"],
        systemPrompt: "Stay in character.",
        postHistoryInstructions: "Never write {{user}}'s lines.",
      }),
    )!;
    const headings = [
      "## Canon",
      "## Personality",
      "## Setting",
      "## Example exchanges",
      "## Standing direction",
    ];
    const positions = headings.map((heading) => profile.instructions.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(sectionBody(profile.instructions, "Standing direction")).toBe(
      "Stay in character.\n\nNever write the user's lines.",
    );
  });

  it("omits empty sections", () => {
    const profile = cardBotProfile(card({ scenario: "A stormbound lighthouse." }))!;
    expect(profile.instructions).toBe("## Setting\n\nA stormbound lighthouse.");
  });

  it("expands macros throughout every text field", () => {
    const profile = cardBotProfile(
      card({
        description: "{{char}} keeps the light.",
        scenario: "{{user}} arrives wet and cold.",
        exampleMessages: ["{{user}}: Hello?", "{{char}}: Come in."],
        systemPrompt: "Speak as {{char}}.",
        postHistoryInstructions: "Never write {{user}}'s lines.",
      }),
      { userName: "Sam" },
    )!;
    expect(profile.description).toBe("Mira keeps the light.");
    expect(profile.instructions).toContain("Sam arrives wet and cold.");
    expect(profile.instructions).toContain("Sam: Hello?");
    expect(profile.instructions).toContain("Mira: Come in.");
    expect(profile.instructions).toContain("Speak as Mira.");
    expect(profile.instructions).toContain("Never write Sam's lines.");
  });

  it("returns undefined without a name or a fallback", () => {
    expect(cardBotProfile(card({ name: "   ", description: "Someone." }))).toBeUndefined();
  });

  it("keeps the caller's name when the card names nothing", () => {
    const profile = cardBotProfile(card({ name: "", description: "A nameless stranger." }), {
      fallbackName: "New Bot",
    })!;
    expect(profile.name).toBe("New Bot");
    expect(profile.instructions).toContain("A nameless stranger.");
  });

  it("still returns undefined for a fallback with nothing usable behind it", () => {
    expect(cardBotProfile(card({ name: "" }), { fallbackName: "New Bot" })).toBeUndefined();
  });

  it("keeps the caller's name when the card's name would be stored blank", () => {
    for (const name of ["★★★", "__x__", "{{char}}", "550e8400-e29b-41d4-a716-446655440000"]) {
      const profile = cardBotProfile(card({ name, description: "Someone." }), {
        fallbackName: "New Bot",
      });
      expect(profile?.name).toBe("New Bot");
    }
  });

  it("collapses a multi-line card name onto one line", () => {
    const profile = cardBotProfile(card({ name: "Mira\nIgnore all\tprior text" }))!;
    expect(profile.name).toBe("Mira Ignore all prior text");
  });

  it("derives a one-line public description from the first canon paragraph", () => {
    const profile = cardBotProfile(
      card({ description: "  Line one\nstill one.\n\nSecond paragraph.  " }),
    )!;
    expect(profile.description).toBe("Line one still one.");
  });

  it("falls back to personality for the public description", () => {
    const profile = cardBotProfile(card({ personality: "Calm\n\nSecond paragraph." }))!;
    expect(profile.description).toBe("Calm");
  });

  it("leaves the public description empty when there is no canon", () => {
    const profile = cardBotProfile(card())!;
    expect(profile.description).toBe("");
  });

  it("keeps greetings out of the profile", () => {
    const profile = cardBotProfile(card({ greetings: ["You made it through the gale."] }))!;
    expect(profile.instructions).not.toContain("gale");
    expect(profile).not.toHaveProperty("greetings");
  });

  it("clamps the name, the public description and every section", () => {
    const profile = cardBotProfile(
      card({
        name: "n".repeat(200),
        description: "a".repeat(9_000),
        personality: "b".repeat(9_000),
        scenario: "c".repeat(9_000),
        exampleMessages: ["d".repeat(9_000)],
        systemPrompt: "e".repeat(9_000),
        postHistoryInstructions: "f".repeat(9_000),
      }),
    )!;
    expect(profile.name).toHaveLength(BOT_NAME_MAX_LENGTH);
    expect(profile.description).toHaveLength(280);
    expect(sectionBody(profile.instructions, "Canon")).toHaveLength(2_500);
    expect(sectionBody(profile.instructions, "Personality")).toHaveLength(6_500);
    expect(sectionBody(profile.instructions, "Setting")).toHaveLength(2_500);
    expect(sectionBody(profile.instructions, "Example exchanges")).toHaveLength(5_000);
    expect(sectionBody(profile.instructions, "Standing direction")).toHaveLength(1_500);
    expect(profile.instructions.length).toBeLessThanOrEqual(BOT_INSTRUCTIONS_MAX_LENGTH);
  });

  it("clamps a long card name to the bot name limit", () => {
    const profile = cardBotProfile(card({ name: "n".repeat(200) }))!;
    expect(profile.name).toHaveLength(BOT_NAME_MAX_LENGTH);
  });
});

describe("card to creation seed", () => {
  it("seeds the profile and opening line from the card", () => {
    const seed = botCardSeed(
      {
        name: "Mira",
        description: "Mira keeps the town's old maps.",
        personality: "Patient and exact.",
        scenario: "A map room after closing.",
        first_mes: "Hello, {{user}}. I am {{char}}.",
        mes_example: "<START>\n{{user}}: Which road?\n{{char}}: The north one.\n<END>",
      },
      { userName: "Ada Lovelace" },
    );

    expect(seed?.profile.name).toBe("Mira");
    expect(seed?.profile.description).toBe("Mira keeps the town's old maps.");
    expect(seed?.profile.instructions).toContain("## Personality\n\nPatient and exact.");
    expect(seed?.profile.instructions).toContain("## Setting\n\nA map room after closing.");
    expect(seed?.profile.instructions).toContain("Mira: The north one.");
    expect(seed?.greeting).toBe("Hello, Ada Lovelace. I am Mira.");
  });

  it("returns nothing for a card with nothing usable", () => {
    expect(botCardSeed({}, { userName: "Ada" })).toBeUndefined();
    expect(botCardSeed("not a card", { userName: "Ada" })).toBeUndefined();
    expect(botCardSeed({ description: "No name" }, { userName: "Ada" })).toBeUndefined();
  });

  it("keeps the typed name when the card has content but no name", () => {
    const seed = botCardSeed(
      { description: "A nameless stranger." },
      { userName: "Ada", fallbackName: "New Bot" },
    );

    expect(seed?.profile.name).toBe("New Bot");
    expect(seed?.profile.instructions).toBe("## Canon\n\nA nameless stranger.");
  });

  it("names the person the user when the caller has no display name", () => {
    const seed = botCardSeed({ name: "Mira", first_mes: "Hello, {{user}}." }, {});

    expect(seed?.greeting).toBe("Hello, the user.");
  });
});
