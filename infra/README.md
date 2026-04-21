# infra/

AWS Fargate infrastructure for the t2000 backend. Provisioned via shell scripts that wrap the AWS CLI — idempotent, safe to re-run.

## What runs in ECS

| Service | Task definition | Purpose |
|---------|----------------|---------|
| `t2000-server` | `server-task-definition.json` | Backend API on Fargate, exposed via ALB at `api.t2000.ai`. |
| `t2000-indexer` | `indexer-task-definition.json` | Long-running Sui indexer (built from `indexer.Dockerfile`). |
| `t2000-cron-daily-intel` | `cron-daily-intel-task-definition.json` | Scheduled ECS task — daily portfolio rollups, episodic memory, behavioural patterns, profile inference. Triggered by EventBridge Scheduler. |

The cron stack was reduced from three schedules to one in the April 2026 simplification (S.0–S.12). See `setup-cron.sh` for the history of what was removed and why.

## Scripts

| Script | Runs | What it provisions |
|--------|------|-------------------|
| `setup.sh` | Once | VPC networking (default VPC), ECR repos, ECS cluster (`mission69b-mainnet`), IAM execution role, CloudWatch log group, security group. |
| `setup-alb.sh` | Once after `setup.sh` | ACM certificate, ALB, target group, HTTPS listener; attaches ALB to the `t2000-server` ECS service. Prints DNS records to add in Vercel. |
| `setup-cron.sh` | Once | EventBridge Scheduler rule that invokes `t2000-cron-daily-intel` on its daily cadence. |
| `deploy.sh` | On every release | Builds the Docker image, pushes to ECR, forces a new ECS deployment. `./infra/deploy.sh --service <server\|indexer> [--tag <tag>]` |

## Task definitions

The three `*-task-definition.json` files are the source of truth for container config (image, CPU/memory, env vars, log group). `deploy.sh` registers a new revision each release.

When adding / removing a background job:
1. Add or delete the matching `*-task-definition.json`.
2. Update `setup-cron.sh` (if it's a scheduled task).
3. Update the table above.

## Region & account

- Default region: `us-east-1` (override via `AWS_REGION`).
- Cluster: `mission69b-mainnet`.
- Account ID pulled at runtime from `aws sts get-caller-identity`.

## Requirements

- AWS CLI configured with credentials that can read/write ECS, ECR, IAM, CloudWatch, EC2 (for security groups), ACM, and Route 53 — or scoped equivalents.
- For `deploy.sh`: Docker + `buildx` (for multi-arch builds) + logged into ECR (`aws ecr get-login-password`).
