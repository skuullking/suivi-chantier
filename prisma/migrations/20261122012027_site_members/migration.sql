-- CreateTable
CREATE TABLE "SiteMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteMember_userId_idx" ON "SiteMember"("userId");

-- CreateIndex
CREATE INDEX "SiteMember_organizationId_idx" ON "SiteMember"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteMember_siteId_userId_key" ON "SiteMember"("siteId", "userId");

-- AddForeignKey
ALTER TABLE "SiteMember" ADD CONSTRAINT "SiteMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMember" ADD CONSTRAINT "SiteMember_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMember" ADD CONSTRAINT "SiteMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
