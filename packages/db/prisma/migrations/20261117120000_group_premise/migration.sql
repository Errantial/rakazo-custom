-- Additive: older releases ignore it and every existing group keeps an empty premise.
ALTER TABLE "chat_groups" ADD COLUMN "premise" TEXT NOT NULL DEFAULT '';
