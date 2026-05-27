-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('NORMAL', 'CENTER');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('REGISTER_ACCOUNT', 'CHANGE_NODE_NAME', 'CHANGE_NODE_LOCATION', 'APPLY_CENTER_NODE', 'REVERT_NORMAL_NODE', 'CONFIG_JUDGE_MODEL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "ownerAccount" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "NodeCluster" (
    "id" TEXT NOT NULL,
    "ownerAccount" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeFile" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "ownerAccount" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "localPath" TEXT,
    "textContent" TEXT,
    "contentBase64" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeFileChunk" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "ownerAccount" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeFileChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeFileEmbedding" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "ownerAccount" TEXT NOT NULL,
    "vectorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeFileEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAuditLog" (
    "id" TEXT NOT NULL,
    "ownerAccount" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeStorageMeta" (
    "id" TEXT NOT NULL,
    "ownerAccount" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeStorageMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "nodeType" "NodeType" NOT NULL DEFAULT 'NORMAL',
    "nodeName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionRequest" (
    "id" TEXT NOT NULL,
    "requestType" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "remark" TEXT NOT NULL DEFAULT '',
    "applicantId" TEXT NOT NULL,
    "handlerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminActionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionHistory" (
    "id" TEXT NOT NULL,
    "requestType" "RequestType" NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL,
    "handlerName" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeCluster_ownerAccount_updatedAt_idx" ON "NodeCluster"("ownerAccount", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NodeCluster_ownerAccount_name_key" ON "NodeCluster"("ownerAccount", "name");

-- CreateIndex
CREATE INDEX "NodeFile_ownerAccount_createdAt_idx" ON "NodeFile"("ownerAccount", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NodeFile_clusterId_createdAt_idx" ON "NodeFile"("clusterId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NodeFileChunk_ownerAccount_createdAt_idx" ON "NodeFileChunk"("ownerAccount", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NodeFileChunk_fileId_chunkIndex_key" ON "NodeFileChunk"("fileId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "NodeFileEmbedding_chunkId_key" ON "NodeFileEmbedding"("chunkId");

-- CreateIndex
CREATE INDEX "NodeFileEmbedding_ownerAccount_updatedAt_idx" ON "NodeFileEmbedding"("ownerAccount", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "NodeAuditLog_ownerAccount_createdAt_idx" ON "NodeAuditLog"("ownerAccount", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NodeAuditLog_type_createdAt_idx" ON "NodeAuditLog"("type", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NodeStorageMeta_ownerAccount_key_key" ON "NodeStorageMeta"("ownerAccount", "key");

-- CreateIndex
CREATE UNIQUE INDEX "User_account_key" ON "User"("account");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActionRequest_status_createdAt_idx" ON "AdminActionRequest"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActionRequest_applicantId_createdAt_idx" ON "AdminActionRequest"("applicantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActionHistory_approvedAt_idx" ON "AdminActionHistory"("approvedAt" DESC);

-- CreateIndex
CREATE INDEX "ChatConversation_ownerAccount_updatedAt_idx" ON "ChatConversation"("ownerAccount", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "NodeFile" ADD CONSTRAINT "NodeFile_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "NodeCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeFileChunk" ADD CONSTRAINT "NodeFileChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "NodeFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeFileEmbedding" ADD CONSTRAINT "NodeFileEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "NodeFileChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionRequest" ADD CONSTRAINT "AdminActionRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionRequest" ADD CONSTRAINT "AdminActionRequest_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
