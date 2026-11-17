import type { AdapterContext, MemoryStore } from "@rakazo/adapter-kit";
import {
  BOT_PEER_VISIBILITY_FIELDS,
  type BotPeerVisibilityField,
  botPeerVisibility,
} from "@rakazo/contracts";
import { type PeerViewer, peerVisibilityAllowsField } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { resolveBot } from "./fleet-tools.js";
import { byteLength, truncateUtf8 } from "./utf8.js";

/** Bytes of another bot's memory one read may return. */
export const PEER_MEMORY_MAX_BYTES = 8 * 1024;
/** Routines one read may list. */
export const PEER_ROUTINE_LIMIT = 50;

export type PeerProfile = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  model?: { provider: string | null; modelId: string | null; thinkingLevel: string | null };
  routines?: Array<{ name: string; cron: string | null; nextRunAt: string | null }>;
  tools?: { disabled: string[]; mcpServers: string[] };
  memory?: Array<{ path: string; content: string }>;
  /** Parts this bot keeps to itself, so the caller stops asking for them. */
  hidden: BotPeerVisibilityField[];
};

/**
 * What another bot shares with `viewer`. Every field goes through the same visibility rule the
 * teammate directory, group roster and fleet tools use, so a bot that hides its instructions here
 * hides them everywhere. A bot asking about itself gets everything.
 */
export async function readPeerProfile(
  deps: { prisma: PrismaClient; memory: MemoryStore },
  scope: { spaceId: string; userId: string; botId: string },
  viewer: PeerViewer,
  args: { bot_id?: unknown; bot_name?: unknown },
  context: AdapterContext,
): Promise<PeerProfile | { error: string }> {
  const target = await resolveBot(deps.prisma, scope, args);
  if ("error" in target) return { error: target.error };
  const own = target.id === scope.botId;
  const visibility = botPeerVisibility(target.peerVisibility);
  const allows = (field: BotPeerVisibilityField) =>
    own || peerVisibilityAllowsField(visibility, field, viewer);
  const hidden = BOT_PEER_VISIBILITY_FIELDS.filter((field) => !allows(field));

  const [row, routines, mcpServers, memory] = await Promise.all([
    deps.prisma.bot.findUniqueOrThrow({
      where: { id: target.id },
      select: { description: true, instructions: true, disabledBuiltinTools: true },
    }),
    allows("routines")
      ? deps.prisma.routine.findMany({
          where: { botId: target.id, spaceId: scope.spaceId, userId: scope.userId, active: true },
          select: { name: true, crons: true, nextRunAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: PEER_ROUTINE_LIMIT,
        })
      : [],
    allows("tools")
      ? deps.prisma.botMcpServer.findMany({
          where: { botId: target.id, spaceId: scope.spaceId, userId: scope.userId },
          select: { server: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    allows("memory") ? deps.memory.read({ scope: "bot", botId: target.id }, context) : undefined,
  ]);

  const profile: PeerProfile = { id: target.id, name: target.name, hidden };
  if (allows("description") && row.description.trim()) profile.description = row.description;
  if (allows("instructions") && row.instructions.trim()) profile.instructions = row.instructions;
  if (allows("model"))
    profile.model = {
      provider: target.modelProvider || null,
      modelId: target.modelId ?? null,
      thinkingLevel: target.thinkingLevel ?? null,
    };
  if (allows("routines"))
    profile.routines = routines.map((routine) => ({
      name: routine.name,
      cron: routine.crons[0] ?? null,
      nextRunAt: routine.nextRunAt?.toISOString() ?? null,
    }));
  if (allows("tools"))
    profile.tools = {
      disabled: [...row.disabledBuiltinTools],
      mcpServers: mcpServers.map((entry) => entry.server.name),
    };
  if (memory) {
    const documents: Array<{ path: string; content: string }> = [];
    let remaining = PEER_MEMORY_MAX_BYTES;
    for (const document of memory.documents) {
      if (remaining <= 0) break;
      const content = truncateUtf8(document.content, remaining);
      remaining -= byteLength(content);
      documents.push({ path: document.path, content });
    }
    if (documents.length) profile.memory = documents;
  }
  return profile;
}
