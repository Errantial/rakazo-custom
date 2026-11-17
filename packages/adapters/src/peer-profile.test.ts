import type { AdapterContext, MemoryStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { PEER_MEMORY_MAX_BYTES, readPeerProfile } from "./peer-profile.js";

const scope = { spaceId: "space-1", userId: "user-1", botId: "bot-self" };
const context = scope as unknown as AdapterContext;

const target = {
  id: "bot-target",
  spaceId: "space-1",
  userId: "user-1",
  name: "Researcher",
  description: "Finds sources.",
  instructions: "Read primary sources first.",
  modelProvider: "anthropic",
  modelId: "claude-sonnet",
  thinkingLevel: "medium",
  disabledBuiltinTools: ["shell"],
  archivedAt: null,
  peerVisibility: {},
};

function fixture(overrides: Record<string, unknown> = {}) {
  const bot = { ...target, ...overrides };
  const prisma = {
    bot: {
      findMany: vi.fn(async () => [bot]),
      findUniqueOrThrow: vi.fn(async () => ({
        description: bot.description,
        instructions: bot.instructions,
        disabledBuiltinTools: bot.disabledBuiltinTools,
      })),
    },
    routine: {
      findMany: vi.fn(async () => [
        {
          name: "Morning brief",
          crons: ["0 8 * * *"],
          nextRunAt: new Date("2026-11-16T08:00:00Z"),
        },
      ]),
    },
    botMcpServer: {
      findMany: vi.fn(async () => [{ server: { name: "Linear" } }]),
    },
  };
  const memory = {
    read: vi.fn(async () => ({
      documents: [
        {
          id: "m1",
          path: "MEMORY.md",
          content: "# Notes\n\nPrefers primary sources.",
          revision: 1,
        },
      ],
    })),
  };
  return {
    deps: {
      prisma: prisma as unknown as PrismaClient,
      memory: memory as unknown as MemoryStore,
    },
    prisma,
    memory,
  };
}

describe("readPeerProfile", () => {
  it("returns only what a bot shares by default: its name and description", async () => {
    const { deps, prisma } = fixture();
    expect(
      await readPeerProfile(deps, scope, "teammate", { bot_id: "bot-target" }, context),
    ).toEqual({
      id: "bot-target",
      name: "Researcher",
      description: "Finds sources.",
      hidden: ["instructions", "memory", "routines", "model", "tools"],
    });
    // A hidden field costs no query at all.
    expect(prisma.routine.findMany).not.toHaveBeenCalled();
    expect(prisma.botMcpServer.findMany).not.toHaveBeenCalled();
    expect(deps.memory.read).not.toHaveBeenCalled();
  });

  it("adds the parts shared with managers for a fleet-manager run", async () => {
    const { deps } = fixture({
      peerVisibility: {
        instructions: "managers",
        memory: "managers",
        routines: "managers",
        model: "managers",
        tools: "managers",
      },
    });
    expect(
      await readPeerProfile(deps, scope, "manager", { bot_id: "bot-target" }, context),
    ).toEqual({
      id: "bot-target",
      name: "Researcher",
      description: "Finds sources.",
      instructions: "Read primary sources first.",
      model: { provider: "anthropic", modelId: "claude-sonnet", thinkingLevel: "medium" },
      routines: [
        { name: "Morning brief", cron: "0 8 * * *", nextRunAt: "2026-11-16T08:00:00.000Z" },
      ],
      tools: { disabled: ["shell"], mcpServers: ["Linear"] },
      memory: [{ path: "MEMORY.md", content: "# Notes\n\nPrefers primary sources." }],
      hidden: [],
    });
  });

  it("leaves out what a bot shares only with managers when a plain teammate asks", async () => {
    const { deps } = fixture({ peerVisibility: { instructions: "managers" } });
    const profile = await readPeerProfile(
      deps,
      scope,
      "teammate",
      { bot_name: "Researcher" },
      context,
    );
    expect(profile).not.toHaveProperty("instructions");
    expect(profile).toMatchObject({ hidden: expect.arrayContaining(["instructions"]) });
  });

  it("gives a bot everything about itself", async () => {
    const { deps } = fixture({ id: "bot-self", name: "Me" });
    expect(await readPeerProfile(deps, scope, "teammate", { bot_id: "bot-self" }, context)).toEqual(
      expect.objectContaining({
        id: "bot-self",
        instructions: "Read primary sources first.",
        hidden: [],
      }),
    );
  });

  it("bounds the memory it hands over", async () => {
    const long = "x".repeat(PEER_MEMORY_MAX_BYTES + 1_000);
    const { deps, memory } = fixture({ peerVisibility: { memory: "teammates" } });
    memory.read.mockResolvedValueOnce({
      documents: [{ id: "m1", path: "MEMORY.md", content: long, revision: 1 }],
    });
    const profile = await readPeerProfile(
      deps,
      scope,
      "teammate",
      { bot_id: "bot-target" },
      context,
    );
    const documents = (profile as { memory: Array<{ content: string }> }).memory;
    expect(Buffer.byteLength(documents[0]!.content, "utf8")).toBeLessThanOrEqual(
      PEER_MEMORY_MAX_BYTES,
    );
  });

  it("refuses a bot that is not in the same space", async () => {
    const { deps } = fixture();
    deps.prisma.bot.findMany = vi.fn(async () => []) as never;
    expect(
      await readPeerProfile(deps, scope, "teammate", { bot_id: "bot-target" }, context),
    ).toEqual({ error: 'No bot with id "bot-target". Call list_fleet for ids.' });
  });
});
