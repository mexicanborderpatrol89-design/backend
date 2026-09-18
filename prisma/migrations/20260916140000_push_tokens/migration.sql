-- CreateTable
CREATE TABLE "DeviceToken" (
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "DeviceToken_studentId_idx" ON "DeviceToken"("studentId");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
