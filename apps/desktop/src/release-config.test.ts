import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const configPath = require.resolve("../electron-builder.config.cjs");
const original = process.env.GITHUB_REPOSITORY;
afterEach(() => {
  if (original === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = original;
  delete require.cache[configPath];
});

describe("release packaging", () => {
  it("binds both update metadata and managed images to the repository running CI", () => {
    process.env.GITHUB_REPOSITORY = "Example/Custom-App";
    const config = require(configPath);
    expect(config.publish).toEqual([{ provider: "github", owner: "Example", repo: "Custom-App" }]);
    expect(config.extraMetadata.releaseRepository).toBe("example/custom-app");
    expect(config.win.verifyUpdateCodeSignature).toBe(true);
  });
  it("refuses malformed repository names", () => {
    process.env.GITHUB_REPOSITORY = "https://untrusted.invalid/repo";
    expect(() => require(configPath)).toThrow("owner/repository");
  });
});
