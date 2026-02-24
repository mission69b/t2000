#!/bin/bash
# ==============================================================================
# t2000 — Deploy Service to ECS Fargate
# ==============================================================================
# Usage: ./infra/deploy.sh --service <server|indexer> [--tag latest]
# ==============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER_NAME="mission69b-mainnet"
SERVICE=""
TAG="latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service) SERVICE="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./infra/deploy.sh --service <server|indexer> [--tag <tag>]"
      exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [ -z "$SERVICE" ]; then
  echo "Error: --service required (server or indexer)"
  exit 1
fi

REPO="t2000-$SERVICE"
DOCKERFILE="apps/server/Dockerfile"
TASK_DEF_FILE="infra/server-task-definition.json"

if [ "$SERVICE" = "indexer" ]; then
  DOCKERFILE="infra/indexer.Dockerfile"
  TASK_DEF_FILE="infra/indexer-task-definition.json"
fi

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
EXEC_ROLE_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:role/mission69b-mainnet-ecs-execution-role"

cd "$(git rev-parse --show-toplevel)"

echo "🚀 Deploying $REPO:$TAG → $AWS_REGION"

# 1. Build
echo "📦 Building..."
docker build -f "$DOCKERFILE" -t "$REPO:$TAG" .

# 2. Push to ECR
echo "📤 Pushing to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_BASE"
docker tag "$REPO:$TAG" "$ECR_BASE/$REPO:$TAG"
docker push "$ECR_BASE/$REPO:$TAG"

# 3. Register task definition
echo "📋 Registering task definition..."
TMPFILE=$(mktemp)
sed \
  -e "s|\${AWS_ACCOUNT_ID}|$AWS_ACCOUNT_ID|g" \
  -e "s|\${AWS_REGION}|$AWS_REGION|g" \
  -e "s|\${ECR_BASE}|$ECR_BASE|g" \
  -e "s|\${EXEC_ROLE_ARN}|$EXEC_ROLE_ARN|g" \
  -e "s|\${LOG_GROUP}|/ecs/mission69b-mainnet|g" \
  "$TASK_DEF_FILE" > "$TMPFILE"

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "file://$TMPFILE" \
  --query "taskDefinition.taskDefinitionArn" \
  --output text --region "$AWS_REGION")
rm -f "$TMPFILE"

# 4. Deploy
ECS_SERVICE="$REPO"
ACTIVE=$(aws ecs describe-services \
  --cluster "$CLUSTER_NAME" --services "$ECS_SERVICE" \
  --query "services[?status=='ACTIVE'] | length(@)" \
  --output text --region "$AWS_REGION" 2>/dev/null || echo "0")

if [ "${ACTIVE:-0}" -gt 0 ]; then
  echo "♻️  Updating service..."
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" --service "$ECS_SERVICE" \
    --task-definition "$TASK_DEF_ARN" \
    --force-new-deployment --region "$AWS_REGION" > /dev/null
else
  echo "🆕 Creating service..."
  VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region "$AWS_REGION")
  SUBNETS=$(aws ec2 describe-subnets --filters "Name=defaultForAz,Values=true" "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output json --region "$AWS_REGION" | jq -r 'join(",")')
  SG_ID=$(aws ec2 describe-security-groups --filters "Name=tag:Name,Values=mission69b-mainnet-ecs-sg" "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION")
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" --service-name "$ECS_SERVICE" \
    --task-definition "$TASK_DEF_ARN" --desired-count 1 \
    --capacity-provider-strategy "capacityProvider=FARGATE,weight=1" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --deployment-configuration "minimumHealthyPercent=0,maximumPercent=100" \
    --region "$AWS_REGION" > /dev/null
fi

echo "✅ Deployed $ECS_SERVICE"
