const { build } = require("./package.json");
const { execFileSync } = require("node:child_process");

// GitHub supplies this in fork CI. Local packaging can set the same standard variable.
let repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    repository =
      /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/.exec(
        remote,
      )?.[1];
  } catch {
    // Source archives have no git metadata.
  }
}
repository ||= `${build.publish[0].owner}/${build.publish[0].repo}`;
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY must be owner/repository");
}
const [owner, repo] = repository.split("/");
module.exports = {
  ...build,
  extends: null,
  publish: [{ provider: "github", owner, repo }],
  extraMetadata: { ...build.extraMetadata, releaseRepository: repository.toLowerCase() },
};
