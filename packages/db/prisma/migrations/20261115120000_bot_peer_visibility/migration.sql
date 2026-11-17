-- Additive: older releases ignore it, and an empty object means every default.
ALTER TABLE "bots" ADD COLUMN "peerVisibility" JSONB NOT NULL DEFAULT '{}';
