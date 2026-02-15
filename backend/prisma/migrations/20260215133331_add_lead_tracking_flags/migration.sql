-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "notificationSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pushedToCRM" BOOLEAN NOT NULL DEFAULT false;
