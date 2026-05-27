-- AlterTable: rename traceCaseId to evidenceJson for dynamic evidence storage
ALTER TABLE "ChatMessage" RENAME COLUMN "traceCaseId" TO "evidenceJson";
