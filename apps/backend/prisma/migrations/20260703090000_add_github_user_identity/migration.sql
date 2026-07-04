ALTER TABLE "User"
  ADD COLUMN "githubId" TEXT,
  ADD COLUMN "githubLogin" TEXT;

CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");
