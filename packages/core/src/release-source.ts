/** Only images published by this repository's workflow can use its release feed. */
export function releaseRepository(image: string): string | null {
  return /^ghcr\.io\/([a-z0-9-]+\/[a-z0-9._-]+)\/app$/.exec(image)?.[1] ?? null;
}
