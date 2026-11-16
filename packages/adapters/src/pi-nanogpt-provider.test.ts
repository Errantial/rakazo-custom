import { afterEach, describe, expect, it, vi } from "vitest";
import { listPiCatalog } from "./pi-models.js";
import {
  NANOGPT_BASE_URL,
  NANOGPT_PROVIDER_ID,
  nanoGptModels,
  registerNanoGptProvider,
} from "./pi-nanogpt-provider.js";
import { resolveRuntimeModel } from "./pi-runtime-models.js";

describe("NanoGPT provider", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists NanoGPT in the model catalog with a pinned models probe", () => {
    const entries = listPiCatalog().filter((entry) => entry.provider === NANOGPT_PROVIDER_ID);
    expect(entries.length).toBe(nanoGptModels().length);
    expect(entries[0]?.providerName).toBe("NanoGPT");
    expect(entries.every((entry) => entry.auth === "api-key" && entry.catalogProbe)).toBe(true);
    expect(entries.find((entry) => entry.recommended)?.id).toBe("z-ai/glm-5.3");
    expect(entries[0]?.billing).toBe(
      "Uses your NanoGPT API key. Rakazo does not pay for model usage.",
    );
  });

  it("seeds chat-completions models on one HTTPS base URL with sane limits", () => {
    const ids = new Set<string>();
    for (const model of nanoGptModels()) {
      expect(model.api).toBe("openai-completions");
      expect(model.baseUrl).toBe(NANOGPT_BASE_URL);
      expect(model.contextWindow).toBeGreaterThan(model.maxTokens / 2);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(model.compat).toMatchObject({ supportsDeveloperRole: false });
      expect(ids.has(model.id)).toBe(false);
      ids.add(model.id);
    }
  });

  it("maps thinking levels only onto efforts NanoGPT accepts", () => {
    const glm = nanoGptModels().find((model) => model.id === "z-ai/glm-5.3");
    expect(glm?.thinkingLevelMap).toMatchObject({ low: "low", medium: null, high: "high" });
    const deepseek = nanoGptModels().find((model) => model.id === "deepseek/deepseek-v3.2");
    expect(deepseek?.reasoning).toBe(false);
    expect(deepseek?.thinkingLevelMap).toBeUndefined();
  });

  it("resolves a run with the saved key and never borrows the OpenRouter env key", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-should-not-leak");
    const saved = resolveRuntimeModel({
      provider: NANOGPT_PROVIDER_ID,
      id: "z-ai/glm-5.3",
      apiKey: "nano-key",
    } as Parameters<typeof resolveRuntimeModel>[0]);
    expect(saved.model?.baseUrl).toBe(NANOGPT_BASE_URL);
    expect(saved.apiKey).toBe("nano-key");
    const unsaved = resolveRuntimeModel({
      provider: NANOGPT_PROVIDER_ID,
      id: "z-ai/glm-5.3",
    } as Parameters<typeof resolveRuntimeModel>[0]);
    expect(unsaved.apiKey).toBeUndefined();
  });

  it("runs a model outside the seed list as a live sibling on the same host", () => {
    const run = resolveRuntimeModel({
      provider: NANOGPT_PROVIDER_ID,
      id: "z-ai/glm-5.3:thinking",
      apiKey: "nano-key",
    } as Parameters<typeof resolveRuntimeModel>[0]);
    expect(run.model?.id).toBe("z-ai/glm-5.3:thinking");
    expect(run.model?.baseUrl).toBe(NANOGPT_BASE_URL);
  });

  it("does not replace a NanoGPT provider a newer Pi might ship", () => {
    const existing = { id: NANOGPT_PROVIDER_ID };
    const models = {
      getProvider: vi.fn(() => existing),
      setProvider: vi.fn(),
    } as unknown as Parameters<typeof registerNanoGptProvider>[0];
    registerNanoGptProvider(models);
    expect(models.setProvider).not.toHaveBeenCalled();
  });
});
