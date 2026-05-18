-- CreateTable
CREATE TABLE "EditPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "originalReq" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "isNewFile" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,

    CONSTRAINT "EditTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditPlan_runId_key" ON "EditPlan"("runId");

-- AddForeignKey
ALTER TABLE "EditPlan" ADD CONSTRAINT "EditPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditPlan" ADD CONSTRAINT "EditPlan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditTask" ADD CONSTRAINT "EditTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
