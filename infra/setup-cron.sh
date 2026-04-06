#!/usr/bin/env bash
set -euo pipefail

# --- Setup EventBridge Scheduler for t2000-cron ECS task ---
# Run once to create the schedule. Subsequent deploys just update the task definition.
# Prerequisites: task definition registered, secrets created in Secrets Manager.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.env.infra"

TASK_DEF="t2000-cron"
SCHEDULE_NAME="t2000-cron-hourly"
SCHEDULE_EXPRESSION="rate(1 hour)"
SCHEDULE_GROUP="default"

echo "=== t2000-cron EventBridge Scheduler Setup ==="
echo "Cluster:  $ECS_CLUSTER"
echo "Region:   $AWS_REGION"
echo "Schedule: $SCHEDULE_EXPRESSION"
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
        "Resource": ["arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':task-definition/'"$TASK_DEF"':*"],
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
fi

# Step 2: Get latest task definition ARN
TASK_DEF_ARN=$(aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --query "taskDefinition.taskDefinitionArn" --output text)

echo "Task definition: $TASK_DEF_ARN"

# Step 3: Create or update the EventBridge schedule
ECS_TARGET='{
  "RoleArn": "'"$SCHEDULER_ROLE_ARN"'",
  "Arn": "arn:aws:ecs:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':cluster/'"$ECS_CLUSTER"'",
  "EcsParameters": {
    "TaskDefinitionArn": "'"$TASK_DEF_ARN"'",
    "TaskCount": 1,
    "LaunchType": "FARGATE",
    "NetworkConfiguration": {
      "AwsvpcConfiguration": {
        "Subnets": ["'"$SUBNET_A"'", "'"$SUBNET_B"'"],
        "SecurityGroups": ["'"$SECURITY_GROUP_ID"'"],
        "AssignPublicIp": "ENABLED"
      }
    },
    "PlatformVersion": "LATEST"
  }
}'

EXISTING=$(aws scheduler get-schedule --name "$SCHEDULE_NAME" --group-name "$SCHEDULE_GROUP" --query "Name" --output text 2>/dev/null || true)

if [ -z "$EXISTING" ] || [ "$EXISTING" = "None" ]; then
  echo "Creating schedule: $SCHEDULE_NAME"
  aws scheduler create-schedule \
    --name "$SCHEDULE_NAME" \
    --group-name "$SCHEDULE_GROUP" \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --flexible-time-window '{"Mode": "OFF"}' \
    --target "$ECS_TARGET" \
    --state ENABLED > /dev/null
else
  echo "Updating schedule: $SCHEDULE_NAME"
  aws scheduler update-schedule \
    --name "$SCHEDULE_NAME" \
    --group-name "$SCHEDULE_GROUP" \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --flexible-time-window '{"Mode": "OFF"}' \
    --target "$ECS_TARGET" \
    --state ENABLED > /dev/null
fi

echo ""
echo "=== Done ==="
echo "Schedule '$SCHEDULE_NAME' will run ECS task '$TASK_DEF' every hour."
echo "Logs: CloudWatch → $LOG_GROUP → t2000-cron/*"
