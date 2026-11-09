import { describe, expect, it } from "vitest";
import { releaseImages } from "./release-images.js";

describe("release images", () => {
  it("keeps the managed server and computers in the desktop release namespace", () => {
    expect(releaseImages("example/custom-app")).toEqual({
      RAKAZO_IMAGE: "ghcr.io/example/custom-app/app",
      RAKAZO_COMPUTER_IMAGE: "ghcr.io/example/custom-app/computer",
    });
  });
  it.each([undefined, "", "https://github.com/example/repo", "../repo", "a/b/c"])(
    "rejects invalid packaged metadata: %s",
    (repository) => expect(releaseImages(repository)).toEqual({}),
  );
});
