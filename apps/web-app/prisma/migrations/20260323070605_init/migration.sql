-- CreateTable
CREATE TABLE "UserPreferences" (
    "address" TEXT NOT NULL,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "limits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "address" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("address","date")
);
