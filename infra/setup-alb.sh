#!/bin/bash
# ==============================================================================
# t2000 — ALB Setup for api.t2000.ai
# ==============================================================================
# Creates: ACM certificate, ALB, target group, HTTPS listener.
# Updates: ECS security group (allow ALB inbound), ECS service (attach TG).
#
# Prerequisites:
#   - AWS CLI configured
#   - infra/.env.infra exists (from setup.sh)
#   - ECS service 't2000-server' running
#
# Usage: ./infra/setup-alb.sh
#
# After running, you need to add TWO DNS records in Vercel:
#   1. ACM validation CNAME (printed by the script — for SSL cert)
#   2. api CNAME → ALB DNS name (printed by the script — for routing)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.env.infra"

DOMAIN="api.t2000.ai"
ALB_NAME="t2000-api-alb"
ALB_SG_NAME="t2000-alb-sg"
TG_NAME="t2000-server-tg"
ECS_SERVICE="t2000-server"
CONTAINER_NAME="t2000-server"
CONTAINER_PORT=3000

echo "============================================"
echo "  t2000 — ALB Setup"
echo "  Domain:  $DOMAIN"
echo "  Cluster: $ECS_CLUSTER"
echo "  Region:  $AWS_REGION"
echo "============================================"
echo ""

# ── Step 1: Request ACM certificate ──
echo "--- Step 1: ACM Certificate ---"

EXISTING_CERT=$(aws acm list-certificates \
  --region "$AWS_REGION" \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
  --output text 2>/dev/null || echo "None")

if [ "$EXISTING_CERT" != "None" ] && [ "$EXISTING_CERT" != "null" ] && [ -n "$EXISTING_CERT" ]; then
  CERT_ARN="$EXISTING_CERT"
  echo "  Certificate exists: $CERT_ARN"
else
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$DOMAIN" \
    --validation-method DNS \
    --region "$AWS_REGION" \
    --query 'CertificateArn' --output text)
  echo "  Requested certificate: $CERT_ARN"
fi

sleep 3

VALIDATION=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$AWS_REGION" \
  --query 'Certificate.DomainValidationOptions[0]')

CERT_STATUS=$(echo "$VALIDATION" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ValidationStatus','PENDING'))")

if [ "$CERT_STATUS" = "SUCCESS" ]; then
  echo "  Certificate already validated ✓"
else
  CNAME_NAME=$(echo "$VALIDATION" | python3 -c "import sys,json; print(json.load(sys.stdin)['ResourceRecord']['Name'])")
  CNAME_VALUE=$(echo "$VALIDATION" | python3 -c "import sys,json; print(json.load(sys.stdin)['ResourceRecord']['Value'])")

  echo ""
  echo "  ┌─────────────────────────────────────────────────────┐"
  echo "  │  ADD THIS DNS RECORD IN VERCEL (for SSL cert):      │"
  echo "  │                                                     │"
  echo "  │  Type:  CNAME                                       │"
  echo "  │  Name:  $CNAME_NAME"
  echo "  │  Value: $CNAME_VALUE"
  echo "  └─────────────────────────────────────────────────────┘"
  echo ""
  echo "  Add the record above in Vercel, then press ENTER to continue..."
  read -r

  echo "  Waiting for certificate validation..."
  aws acm wait certificate-validated \
    --certificate-arn "$CERT_ARN" \
    --region "$AWS_REGION" 2>/dev/null || true

  sleep 5
  echo "  Certificate validated ✓"
fi
echo ""

# ── Step 2: ALB Security Group ──
echo "--- Step 2: ALB Security Group ---"

EXISTING_ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$ALB_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$EXISTING_ALB_SG" != "None" ] && [ "$EXISTING_ALB_SG" != "null" ] && [ -n "$EXISTING_ALB_SG" ]; then
  ALB_SG="$EXISTING_ALB_SG"
  echo "  SG exists: $ALB_SG"
else
  ALB_SG=$(aws ec2 create-security-group \
    --group-name "$ALB_SG_NAME" \
    --description "ALB for t2000 API" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$ALB_SG_NAME}]" \
    --query "GroupId" --output text --region "$AWS_REGION")

  aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG" \
    --protocol tcp --port 443 \
    --cidr 0.0.0.0/0 \
    --region "$AWS_REGION" > /dev/null

  echo "  Created SG: $ALB_SG (HTTPS inbound)"
fi
echo ""

# ── Step 3: Create ALB ──
echo "--- Step 3: Application Load Balancer ---"

EXISTING_ALB=$(aws elbv2 describe-load-balancers \
  --names "$ALB_NAME" \
  --region "$AWS_REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "None")

if [ "$EXISTING_ALB" != "None" ] && [ -n "$EXISTING_ALB" ]; then
  ALB_ARN="$EXISTING_ALB"
  echo "  ALB exists: $ALB_NAME"
else
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --name "$ALB_NAME" \
    --subnets "$SUBNET_A" "$SUBNET_B" \
    --security-groups "$ALB_SG" \
    --scheme internet-facing \
    --type application \
    --region "$AWS_REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  echo "  Created ALB: $ALB_NAME"
fi

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text \
  --region "$AWS_REGION")

echo "  DNS: $ALB_DNS"
echo ""

# ── Step 4: Target Group ──
echo "--- Step 4: Target Group ---"

EXISTING_TG=$(aws elbv2 describe-target-groups \
  --names "$TG_NAME" \
  --region "$AWS_REGION" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "None")

if [ "$EXISTING_TG" != "None" ] && [ -n "$EXISTING_TG" ]; then
  TG_ARN="$EXISTING_TG"
  echo "  Target group exists: $TG_NAME"
else
  TG_ARN=$(aws elbv2 create-target-group \
    --name "$TG_NAME" \
    --protocol HTTP \
    --port "$CONTAINER_PORT" \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/" \
    --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region "$AWS_REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  echo "  Created target group: $TG_NAME"
fi
echo ""

# ── Step 5: HTTPS Listener ──
echo "--- Step 5: HTTPS Listener ---"

EXISTING_LISTENER=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$AWS_REGION" \
  --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text 2>/dev/null || echo "None")

if [ "$EXISTING_LISTENER" != "None" ] && [ "$EXISTING_LISTENER" != "null" ] && [ -n "$EXISTING_LISTENER" ]; then
  echo "  HTTPS listener exists ✓"
else
  aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTPS \
    --port 443 \
    --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
    --certificates CertificateArn="$CERT_ARN" \
    --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
    --region "$AWS_REGION" > /dev/null
  echo "  Created HTTPS listener (443 → target group)"
fi
echo ""

# ── Step 6: Update ECS Security Group ──
echo "--- Step 6: ECS Security Group ---"

aws ec2 authorize-security-group-ingress \
  --group-id "$SECURITY_GROUP_ID" \
  --protocol tcp --port "$CONTAINER_PORT" \
  --source-group "$ALB_SG" \
  --region "$AWS_REGION" > /dev/null 2>&1 \
  && echo "  Added inbound: ALB → ECS on port $CONTAINER_PORT" \
  || echo "  Inbound rule already exists ✓"
echo ""

# ── Step 7: Update ECS Service ──
echo "--- Step 7: Update ECS Service ---"

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=$CONTAINER_NAME,containerPort=$CONTAINER_PORT" \
  --force-new-deployment \
  --region "$AWS_REGION" > /dev/null 2>&1 \
  && echo "  Attached target group + forced new deployment" \
  || echo "  ⚠ Could not update service — you may need to recreate it (see below)"
echo ""

# ── Step 8: Save ALB config ──
cat >> "$SCRIPT_DIR/.env.infra" <<EOF

# ALB (added by setup-alb.sh)
ALB_ARN=$ALB_ARN
ALB_DNS=$ALB_DNS
ALB_SG=$ALB_SG
TG_ARN=$TG_ARN
CERT_ARN=$CERT_ARN
EOF

echo "  Saved ALB config to .env.infra"
echo ""

# ── Done ──
echo "============================================"
echo "  ALB Setup Complete"
echo ""
echo "  Add this DNS record in Vercel:"
echo ""
echo "    Type:  CNAME"
echo "    Name:  api"
echo "    Value: $ALB_DNS"
echo ""
echo "  Then test:"
echo "    curl https://api.t2000.ai/"
echo "============================================"
