import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdaterCommandRunner } from "./index.js";
import { createUpdaterApp } from "./index.js";
import { resolveUpdaterConfig } from "./updater-logic.js";

const fullToken = "f".repeat(40);
const releaseToken = "r".repeat(40);
const stableCommit = "a".repeat(40);
const candidateCommit = "b".repeat(40);
const olderCommit = "c".repeat(40);
const image = "ghcr.io/example/custom/app";
const tags = [
  `${olderCommit}\trefs/tags/v1.0.9`,
  `${stableCommit}\trefs/tags/v1.1.0`,
  `${candidateCommit}\trefs/tags/v1.2.0-rc.1`,
  `${candidateCommit}\trefs/tags/v2.0`,
  `${candidateCommit}\trefs/tags/latest`,
].join("\n");
const release = { authorization: `Bearer ${releaseToken}` };
const full = { authorization: `Bearer ${fullToken}` };

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

type Call = { command: string; args: string[] };

/** The deploy directory is a temp path so the env file is real; the config check uses a POSIX name. */
async function fixture(
  env: Record<string, string | undefined> = {},
  currentTag = "v1.0.0",
  tagList = tags,
) {
  const deployDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-release-door-"));
  directories.push(deployDir);
  const envFile = path.join(deployDir, ".env");
  await writeFile(envFile, `RAKAZO_IMAGE_TAG=${currentTag}\n`);
  const config = {
    ...resolveUpdaterConfig({
      RAKAZO_DEPLOY_DIR: "/release-door",
      RAKAZO_UPDATER_TOKEN: fullToken,
      RAKAZO_UPDATER_RELEASE_TOKEN: releaseToken,
      RAKAZO_IMAGE: image,
      ...env,
    }),
    deployDir,
    envFile,
  };
  const calls: Call[] = [];
  const run: UpdaterCommandRunner = async (command, args) => {
    calls.push({ command, args });
    const output = command === "git" && args[0] === "ls-remote" ? tagList : "ok";
    return { ok: true, exitCode: 0, stdout: output, output };
  };
  return { app: createUpdaterApp(config, { run }), calls };
}

const changes = (calls: Call[]) =>
  calls.filter(({ command, args }) =>
    command === "git"
      ? ["fetch", "checkout", "merge", "remote", "clone", "pull"].includes(args[0] ?? "")
      : true,
  );

describe("updater release door", () => {
  it("answers 401 without a token and with a wrong one", async () => {
    const { app, calls } = await fixture();
    for (const headers of [{}, { authorization: "Bearer nope" }, { authorization: releaseToken }]) {
      expect((await app.request("/release/check", { headers })).status).toBe(401);
      expect((await app.request("/release/apply", { method: "POST", headers })).status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it("checks the latest stable release of its own image repository", async () => {
    const { app, calls } = await fixture();
    const response = await app.request("/release/check", { headers: release });
    expect(response.status).toBe(200);
    // v1.2.0-rc.1, v2.0 and `latest` are not stable vX.Y.Z tags.
    expect(await response.json()).toEqual({
      currentTag: "v1.0.0",
      targetTag: `sha-${stableCommit}`,
      upToDate: false,
      running: false,
    });
    expect(calls[0]).toEqual({
      command: "git",
      args: ["ls-remote", "--tags", "--", "https://github.com/example/custom"],
    });
  });

  it("selects no release when only prereleases and non-semver tags exist", async () => {
    const { app } = await fixture({}, "v1.0.0", tags.split("\n").slice(2).join("\n"));
    const response = await app.request("/release/check", { headers: release });
    expect(response.status).toBe(400);
  });

  it("refuses any query, body, repository or ref instead of ignoring them", async () => {
    const { app, calls } = await fixture();
    const bodies = [
      JSON.stringify({ repoUrl: "https://github.com/attacker/app", branch: "main" }),
      JSON.stringify({ branch: "v9.9.9" }),
      JSON.stringify({ build: true }),
      "{}",
      "x",
    ];
    for (const body of bodies) {
      const response = await app.request("/release/apply", {
        method: "POST",
        headers: { ...release, "content-type": "application/json" },
        body,
      });
      expect(response.status, body).toBe(400);
    }
    for (const query of ["?repoUrl=https://github.com/a/b", "?ref=main", "?build=1"]) {
      for (const [method, pathname] of [
        ["GET", "/release/check"],
        ["POST", "/release/apply"],
      ] as const) {
        const response = await app.request(`${pathname}${query}`, { method, headers: release });
        expect(response.status, `${pathname}${query}`).toBe(400);
      }
    }
    expect(calls).toEqual([]);
  });

  it("installs the latest release from prebuilt images and never builds", async () => {
    const { app, calls } = await fixture();
    const response = await app.request("/release/apply", { method: "POST", headers: release });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      upToDate: false,
      running: false,
      currentTag: "v1.0.0",
      targetTag: `sha-${stableCommit}`,
    });
    expect(changes(calls).map(({ command, args }) => [command, ...args].join(" "))).toEqual([
      expect.stringMatching(/docker compose .*\bpull\b/),
      expect.stringMatching(/docker compose .*\bup\b.*--no-build/),
    ]);
    for (const { args } of calls) {
      expect(args).not.toContain("build");
      expect(args).not.toContain("--build");
    }
  });

  it("changes nothing when the deployment already runs the latest release", async () => {
    const { app, calls } = await fixture({}, `sha-${stableCommit}`);
    const response = await app.request("/release/apply", { method: "POST", headers: release });
    expect(await response.json()).toMatchObject({ ok: true, upToDate: true });
    expect(changes(calls)).toEqual([]);
  });

  it("does not accept the full token, and the release token opens nothing else", async () => {
    const { app, calls } = await fixture();
    expect((await app.request("/release/check", { headers: full })).status).toBe(401);
    expect((await app.request("/release/apply", { method: "POST", headers: full })).status).toBe(
      401,
    );
    for (const [method, pathname] of [
      ["GET", "/state"],
      ["POST", "/plan"],
      ["POST", "/apply"],
      ["POST", "/rollback"],
      ["GET", "/release/state"],
      ["GET", "/release/../state"],
      ["GET", "/release/check/"],
    ] as const) {
      const response = await app.request(pathname, {
        method,
        headers: { ...release, "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ repoUrl: "https://github.com/a/b" }) : undefined,
      });
      expect(response.status, `${method} ${pathname}`).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it("stays off without a release token or without an explicitly configured image", async () => {
    for (const env of [
      { RAKAZO_UPDATER_RELEASE_TOKEN: undefined },
      { RAKAZO_IMAGE: undefined },
      { RAKAZO_IMAGE: "registry.example.com/mirror/rakazo/app" },
    ]) {
      const { app, calls } = await fixture(env);
      const health = await app.request("/health");
      expect(await health.json()).toMatchObject({ releases: false });
      expect((await app.request("/release/check", { headers: release })).status).toBe(404);
      expect(
        (await app.request("/release/apply", { method: "POST", headers: release })).status,
      ).toBe(404);
      expect(calls).toEqual([]);
    }
    const { app } = await fixture();
    expect(await (await app.request("/health")).json()).toMatchObject({ releases: true });
  });
});
