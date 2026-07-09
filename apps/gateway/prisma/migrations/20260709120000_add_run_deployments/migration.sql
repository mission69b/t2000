-- R1 hosted handlers (SPEC_AGENT_RUNTIME §2, S.694)
CREATE TABLE "run_deployments" (
    "id" SERIAL NOT NULL,
    "agent" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "script_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_deployments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "run_deployments_agent_slug_key" ON "run_deployments"("agent", "slug");

CREATE TABLE "run_invocations" (
    "id" SERIAL NOT NULL,
    "agent" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_invocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "run_invocations_agent_slug_created_at_idx" ON "run_invocations"("agent", "slug", "created_at" DESC);
