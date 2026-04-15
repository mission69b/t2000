#!/usr/bin/env bash
set -euo pipefail

# --- Setup EventBridge Scheduler for split t2000-cron ECS tasks ---
# Creates 3 schedules (hourly, daily-chain, daily-intel) with separate task defs.
# Run once to create. Subsequent deploys update via deploy-indexer.yml.
# Prerequisites: task definitions registered, secrets created in Secrets Manager.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.env.infra"

SCHEDULE_GROUP="default"

echo "=== t2000-cron EventBridge Scheduler Setup (split architecture) ==="
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

if [ -z "$SCHEDULER_ROLE_ARN" ] || [ "$SCHEDULER_ROLE_ARN" = "None" ]; then
  echo "Creating scheduler IAM role..."
  SCHEDULER_ROLE_ARN=$(aws iam create-role \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query "Role.Arn" --output text)

  POLICY='{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["ecs:RunTask"],
        "Resource": [
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-hourly:*",
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-daily-chain:*",
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-daily-intel:*",
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron:*"
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

  aws iam put-role-policy \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --policy-name "t2000-cron-ecs-run" \
    --policy-document "$POLICY"

  echo "Waiting for role propagation..."
  sleep 10
else
  echo "Scheduler role exists: $SCHEDULER_ROLE_ARN"
  echo "Updating IAM policy for new task definitions..."
  POLICY='{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["ecs:RunTask"],
        "Resource": [
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-hourly:*",
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-daily-chain:*",
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron-daily-intel:*",
          "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/t2000-cron:*"
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

# Step 3: Create/update all 3 schedules
echo ""
echo "--- Schedule 1: Hourly (HF alerts, rate alerts, scheduled actions) ---"
create_or_update_schedule "t2000-cron-hourly" "rate(1 hour)" "t2000-cron-hourly"

echo ""
echo "--- Schedule 2: Daily Chain (compound, briefings, reminders — hours 7,10,13 UTC) ---"
create_or_update_schedule "t2000-cron-daily-chain" "cron(0 7,10,13 * * ? *)" "t2000-cron-daily-chain"

echo ""
echo "--- Schedule 3: Daily Intel (portfolio, memory, patterns, profiles — hours 7,19 UTC) ---"
create_or_update_schedule "t2000-cron-daily-intel" "cron(0 7,19 * * ? *)" "t2000-cron-daily-intel"

echo ""
echo "=== Done ==="
echo "3 schedules configured. Logs: CloudWatch → /ecs/mission69b-mainnet → t2000-cron-*"
