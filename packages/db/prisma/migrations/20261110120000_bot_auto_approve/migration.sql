-- Additive: older releases ignore it and every existing bot keeps asking.
ALTER TABLE "bots" ADD COLUMN "autoApprove" BOOLEAN NOT NULL DEFAULT false;
