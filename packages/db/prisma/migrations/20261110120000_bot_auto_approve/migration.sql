-- Additive: older releases ignore it and every existing bot keeps asking.
ALTER TABLE "Bot" ADD COLUMN "autoApprove" BOOLEAN NOT NULL DEFAULT false;
