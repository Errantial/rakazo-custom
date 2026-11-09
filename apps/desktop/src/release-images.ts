/** Packaged metadata is fixed by the release build, never supplied by the renderer. */
export function releaseImages(repository: unknown): Record<string, string> {
  if (typeof repository !== "string" || !/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(repository)) {
    return {};
  }
  return {
    RAKAZO_IMAGE: `ghcr.io/${repository}/app`,
    RAKAZO_COMPUTER_IMAGE: `ghcr.io/${repository}/computer`,
  };
}
