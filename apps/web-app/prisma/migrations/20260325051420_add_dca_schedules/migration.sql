-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "dcaSchedules" JSONB NOT NULL DEFAULT '[]';
