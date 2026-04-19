#!/usr/bin/env bash
set -euo pipefail

# --- Setup EventBridge Scheduler for t2000-cron-daily-intel ECS task ---
#
# History (April 2026 simplification — see audric-build-tracker.md S.0–S.12):
# This script used to provision THREE schedules:
#   - t2000-cron-hourly       → HF alerts, rate alerts, scheduled actions
#   - t2000-cron-daily-chain  → auto-compound, morning briefings, follow-up reminders
#   - t2000-cron-daily-intel  → portfolio rollups, episodic memory, behavioural patterns, profile inference
#
# The first two were retired with the chat-first / autonomy-cleanup work:
#   - HF alerts moved to a synchronous email hook (see apps/server hf-alert route).
#   - Rate alerts, scheduled actions (DCA), morning briefings, auto-compound,
#     follow-up reminders, and behavioural-pattern proposals were all DELETED.
#     zkLogin can't sign without user presence, so "autonomous" actions were
#     theatre. Daily summaries were noise. Both schedules + their task
#     definitions (`t2000-cron-hourly`, `t2000-cron-daily-chain`, and the
#     legacy umbrella `t2000-cron`) were deleted from EventBridge + ECS in S.12.5.
#
# Only `t2000-cron-daily-intel` survives. It still runs at 07:00 + 19:00 UTC
# to refresh:
#   - Portfolio snapshots (silent context for the engine)
#   - Episodic memory + financial profile inference
#   - Behavioural-pattern *classifiers* (kept as pure functions feeding ChainFacts)
# All output is silent context fed to the LLM at chat time. Nothing is surfaced
# to the user without them asking.
#
# Run once to create. Subsequent deploys update via deploy-indexer.yml.
# Prerequisites: cron-daily-intel-task-definition.json registered, secrets
# created in Secrets Manager.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.env.infra"

SCHEDULE_GROUP="default"

echo "=== t2000-cron-daily-intel EventBridge Scheduler Setup ==="
echo "Cluster:  $ECS_CLUSTER"
echo "Region:   $AWS_REGION"
echo ""

# Step 1: Create IAM role for EventBridge to run ECS tasks
SCHEDULER_ROLE_NAME="t2000-cron-scheduler-role"

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "scheduler.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

SCHEDULER_ROLE_ARN=$(aws iam get-role --role-name "$SCHEDULER_ROLE_NAME" --query "Role.Arn" --output text 2>/dev/null || true)

POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecs:RunTask"],
      "Resource": [
        "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-daily-intel:*"
      ],
      "Condition": {
        "ArnLike": {"ecs:cluster": "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':cluster/'"$ECS_CLUSTER"'"}
      }
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": ["'"$EXEC_ROLE_ARN"'"]
    }
  ]
}'

if [ -z "$SCHEDULER_ROLE_ARN" ] || [ "$SCHEDULER_ROLE_ARN" = "None" ]; then
  echo "Creating scheduler IAM role..."
  SCHEDULER_ROLE_ARN=$(aws iam create-role \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query "Role.Arn" --output text)

  aws iam put-role-policy \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --policy-name "t2000-cron-ecs-run" \
    --policy-document "$POLICY"

  echo "Waiting for role propagation..."
  sleep 10
else
  echo "Scheduler role exists: $SCHEDULER_ROLE_ARN"
  echo "Refreshing IAM policy..."
  aws iam put-role-policy \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --policy-name "t2000-cron-ecs-run" \
    --policy-document "$POLICY"
fi

# Step 2: VPC/networking info
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
SUBNETS_JSON=$(aws ec2 describe-subnets --filters "Name=defaultForAz,Values=true" "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0:2].SubnetId" --output json)
SG_ID=$(aws ec2 describe-security-groups --filters "Name=tag:Name,Values=mission69b-mainnet-ecs-sg" "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[0].GroupId" --output text)

SUBNET_A=$(echo "$SUBNETS_JSON" | jq -r '.[0]')
SUBNET_B=$(echo "$SUBNETS_JSON" | jq -r '.[1]')

# Helper: create or update a schedule
create_or_update_schedule() {
  local SCHEDULE_NAME="$1"
  local SCHEDULE_EXPRESSION="$2"
  local TASK_DEF_FAMILY="$3"

  TASK_DEF_ARN=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF_FAMILY" \
    --query "taskDefinition.taskDefinitionArn" --output text 2>/dev/null || true)

  if [ -z "$TASK_DEF_ARN" ] || [ "$TASK_DEF_ARN" = "None" ]; then
    echo "  SKIP: Task definition '$TASK_DEF_FAMILY' not registered yet. Register it first."
    return
  fi

  ECS_TARGET='{
    "RoleArn": "'"$SCHEDULER_ROLE_ARN"'",
    "Arn": "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':cluster/'"$ECS_CLUSTER"'",
    "EcsParameters": {
      "TaskDefinitionArn": "'"$TASK_DEF_ARN"'",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["'"$SUBNET_A"'", "'"$SUBNET_B"'"],
          "SecurityGroups": ["'"$SG_ID"'"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }'

  EXISTING=$(aws scheduler get-schedule --name "$SCHEDULE_NAME" --group-name "$SCHEDULE_GROUP" --query "Name" --output text 2>/dev/null || true)

  if [ -z "$EXISTING" ] || [ "$EXISTING" = "None" ]; then
    echo "  Creating schedule: $SCHEDULE_NAME ($SCHEDULE_EXPRESSION)"
    aws scheduler create-schedule \
      --name "$SCHEDULE_NAME" \
      --group-name "$SCHEDULE_GROUP" \
      --schedule-expression "$SCHEDULE_EXPRESSION" \
      --schedule-expression-timezone "UTC" \
      --flexible-time-window '{"Mode": "OFF"}' \
      --target "$ECS_TARGET" \
      --state ENABLED > /dev/null
  else
    echo "  Updating schedule: $SCHEDULE_NAME ($SCHEDULE_EXPRESSION)"
    aws scheduler update-schedule \
      --name "$SCHEDULE_NAME" \
      --group-name "$SCHEDULE_GROUP" \
      --schedule-expression "$SCHEDULE_EXPRESSION" \
      --schedule-expression-timezone "UTC" \
      --flexible-time-window '{"Mode": "OFF"}' \
      --target "$ECS_TARGET" \
      --state ENABLED > /dev/null
  fi
}

# Step 3: Create/update the daily-intel schedule (only surviving cron)
echo ""
echo "--- Schedule: Daily Intel (silent context refresh — hours 7,19 UTC) ---"
create_or_update_schedule "t2000-cron-daily-intel" "cron(0 7,19 * * ? *)" "t2000-cron-daily-intel"

echo ""
echo "=== Done ==="
echo "1 schedule configured. Logs: CloudWatch → /ecs/mission69b-mainnet → t2000-cron-daily-intel"
