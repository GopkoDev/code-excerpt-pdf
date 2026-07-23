-- CreateTable
CREATE TABLE "TreeCache" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "tree" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreeCache_repoId_key" ON "TreeCache"("repoId");

-- AddForeignKey
ALTER TABLE "TreeCache" ADD CONSTRAINT "TreeCache_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
