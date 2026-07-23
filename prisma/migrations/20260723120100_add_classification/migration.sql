-- CreateEnum
CREATE TYPE "ClassificationKind" AS ENUM ('VENDORED', 'AUTHORED');

-- CreateTable
CREATE TABLE "Classification" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "pathOrGlob" TEXT NOT NULL,
    "kind" "ClassificationKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Classification_repoId_pathOrGlob_key" ON "Classification"("repoId", "pathOrGlob");

-- AddForeignKey
ALTER TABLE "Classification" ADD CONSTRAINT "Classification_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
