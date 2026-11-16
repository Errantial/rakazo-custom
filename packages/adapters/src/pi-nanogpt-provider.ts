import type { Model, MutableModels, Provider, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { createProvider, envApiKeyAuth } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { inputModalities } from "./model-modalities.js";

/**
 * NanoGPT (nano-gpt.com): one key for hundreds of models behind an OpenAI-compatible
 * chat-completions endpoint. Pi's registry does not ship it, so Rakazo registers it here.
 *
 * The seed list below is what pickers show before a key is saved. Once a key is saved the
 * live catalog lists every chat model the account can reach from GET {base}/models, using
 * these seeds as capability siblings, so the list does not need to track NanoGPT's catalog.
 * Seed metadata (context, output ceiling, vision, reasoning efforts, USD per 1M tokens)
 * comes from NanoGPT's detailed models list on 2026-11-15.
 */
export const NANOGPT_PROVIDER_ID = "nanogpt";
export const NANOGPT_BASE_URL = "https://nano-gpt.com/api/v1";
/** Operator-supplied key, for deployments that configure NanoGPT from the environment. */
export const NANOGPT_API_KEY_ENV = ["NANOGPT_API_KEY", "NANO_GPT_API_KEY"];

type NanoGptSeed = {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  images: boolean;
  cost: Model<"openai-completions">["cost"];
  contextWindow: number;
  maxTokens: number;
};

const NANOGPT_SEEDS: readonly NanoGptSeed[] = [
  {
    id: "openai/gpt-6-luna",
    name: "GPT 6 Luna",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    images: true,
    cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0 },
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  },
  {
    id: "openai/gpt-6.1-sol",
    name: "GPT 6.1 Sol",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    images: true,
    cost: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Claude Haiku 5.5",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    images: true,
    cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
      max: null,
    },
    images: true,
    cost: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude Opus 5.5",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    images: true,
    cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
      max: null,
    },
    images: true,
    cost: { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 65_536,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
      max: null,
    },
    images: true,
    cost: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 65_536,
  },
  {
    id: "z-ai/glm-5.3",
    name: "GLM 5.3",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    images: false,
    cost: { input: 0.6, output: 1.1, cacheRead: 0.2, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    reasoning: false,
    images: false,
    cost: { input: 0.26, output: 0.38, cacheRead: 0.13, cacheWrite: 0 },
    contextWindow: 163_000,
    maxTokens: 65_536,
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    images: true,
    cost: { input: 0.45, output: 9.6, cacheRead: 0.13, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 32_768,
  },
  {
    id: "x-ai/grok-4.7",
    name: "Grok 4.7",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: null,
    },
    images: true,
    cost: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
    contextWindow: 500_000,
    maxTokens: 32_768,
  },
  {
    id: "minimax/minimax-m3",
    name: "MiniMax M3",
    reasoning: true,
    images: true,
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    contextWindow: 512_000,
    maxTokens: 80_000,
  },
  {
    id: "qwen/qwen3.8-max-prime",
    name: "Qwen3.8 Max Prime",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: null,
    },
    images: true,
    cost: { input: 4, output: 12, cacheRead: 0.5, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  },
];

function nanoGptModel(seed: NanoGptSeed): Model<"openai-completions"> {
  return {
    id: seed.id,
    name: seed.name,
    api: "openai-completions",
    provider: NANOGPT_PROVIDER_ID,
    baseUrl: NANOGPT_BASE_URL,
    reasoning: seed.reasoning,
    ...(seed.thinkingLevelMap ? { thinkingLevelMap: seed.thinkingLevelMap } : {}),
    // NanoGPT routes to many upstream chat templates; plain system messages work on all of them.
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: Boolean(seed.thinkingLevelMap),
    },
    input: inputModalities(seed.images),
    cost: seed.cost,
    contextWindow: seed.contextWindow,
    maxTokens: seed.maxTokens,
  };
}

export function nanoGptModels(): Model<"openai-completions">[] {
  return NANOGPT_SEEDS.map(nanoGptModel);
}

export function nanoGptProvider(): Provider {
  return createProvider({
    id: NANOGPT_PROVIDER_ID,
    name: "NanoGPT",
    baseUrl: NANOGPT_BASE_URL,
    auth: { apiKey: envApiKeyAuth("NanoGPT API key", NANOGPT_API_KEY_ENV) },
    models: nanoGptModels(),
    api: openAICompletionsApi(),
  });
}

/** Add NanoGPT to a registry unless a newer Pi already ships a provider with this id. */
export function registerNanoGptProvider(models: MutableModels): MutableModels {
  // A catalog that cannot look a provider up is a reduced double (some tests pass one);
  // there is nothing to register into and no way to tell whether it is already there.
  if (!models.getProvider) return models;
  if (!models.getProvider(NANOGPT_PROVIDER_ID)) models.setProvider(nanoGptProvider());
  return models;
}
