-- Additive: older releases ignore it and every existing bot keeps an empty reminder.
ALTER TABLE "bots" ADD COLUMN "turnReminder" TEXT NOT NULL DEFAULT '';
