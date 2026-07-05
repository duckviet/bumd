-- CreateTable
CREATE TABLE "GithubInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "githubInstallationId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubRepository" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "githubInstallationId" TEXT NOT NULL,
    "githubRepoId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "docId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubRepoBranchMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "githubRepoId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "specPath" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubRepoBranchMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubInstallation_githubInstallationId_key" ON "GithubInstallation"("githubInstallationId");

-- CreateIndex
CREATE INDEX "GithubInstallation_organizationId_idx" ON "GithubInstallation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubRepository_githubRepoId_key" ON "GithubRepository"("githubRepoId");

-- CreateIndex
CREATE INDEX "GithubRepository_organizationId_idx" ON "GithubRepository"("organizationId");

-- CreateIndex
CREATE INDEX "GithubRepository_githubInstallationId_idx" ON "GithubRepository"("githubInstallationId");

-- CreateIndex
CREATE INDEX "GithubRepository_docId_idx" ON "GithubRepository"("docId");

-- CreateIndex
CREATE INDEX "GithubRepoBranchMapping_organizationId_idx" ON "GithubRepoBranchMapping"("organizationId");

-- CreateIndex
CREATE INDEX "GithubRepoBranchMapping_githubRepoId_idx" ON "GithubRepoBranchMapping"("githubRepoId");

-- CreateIndex
CREATE INDEX "GithubRepoBranchMapping_docId_idx" ON "GithubRepoBranchMapping"("docId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubRepoBranchMapping_githubRepoId_branchName_specPath_key" ON "GithubRepoBranchMapping"("githubRepoId", "branchName", "specPath");

-- AddForeignKey
ALTER TABLE "GithubInstallation" ADD CONSTRAINT "GithubInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepository" ADD CONSTRAINT "GithubRepository_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepository" ADD CONSTRAINT "GithubRepository_githubInstallationId_fkey" FOREIGN KEY ("githubInstallationId") REFERENCES "GithubInstallation"("githubInstallationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepository" ADD CONSTRAINT "GithubRepository_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepoBranchMapping" ADD CONSTRAINT "GithubRepoBranchMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepoBranchMapping" ADD CONSTRAINT "GithubRepoBranchMapping_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "GithubRepository"("githubRepoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepoBranchMapping" ADD CONSTRAINT "GithubRepoBranchMapping_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
