#!/bin/bash
# DDNS 自动更新脚本（修正版）
# 仅在公网IPv4变化时更新，IPv6使用固定值（通过SSH获取服务器实际出口IP）
#
# 运行方式：bash scripts/ddns-update.sh

set -e

# DNS 记录 ID
A_RECORD_ID="2097487302061989888"
AAAA_RECORD_ID="2096030127842204672"

# 服务器信息
SERVER_HOST="gpssong@192.168.0.14"
SERVER_SSH_PASS="850225song"
STATE_FILE="/tmp/ddns-state.json"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] INFO${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARN${NC}  $1"; }
log_error() { echo -e "${RED}[$(date '+%H:%M:%S')] ERROR${NC} $1"; }

# 获取当前公网 IPv4（从本地获取）
CURRENT_IPV4=$(curl -4 -s --max-time 5 ifconfig.me 2>/dev/null || echo "")

if [ -z "$CURRENT_IPV4" ]; then
  log_error "无法检测到公网 IPv4 地址"
  exit 1
fi

# 从服务器获取 IPv6（服务器直连外网的地址）
CURRENT_IPV6=$(sshpass -p "$SERVER_SSH_PASS" ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SERVER_HOST" \
  "curl -s -m 5 ifconfig.me -6" 2>/dev/null || echo "")

log_info "当前公网 IP: IPv4=$CURRENT_IPV4 IPv6=${CURRENT_IPV6:-无}"

# 检查上次记录的 IP
LAST_IPV4=""
if [ -f "$STATE_FILE" ]; then
  LAST_IPV4=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('ipv4',''))" 2>/dev/null || echo "")
fi

# 判断是否需要更新
if [ "$CURRENT_IPV4" = "$LAST_IPV4" ]; then
  log_info "公网 IPv4 未变化，无需更新 DNS"
  exit 0
fi

# 检查 aliyun CLI
if ! command -v aliyun &> /dev/null; then
  log_error "aliyun CLI 未安装，请先安装"
  exit 1
fi

log_info "开始更新 DNS A 记录 → $CURRENT_IPV4"

# 更新 A 记录
if aliyun alidns update-domain-record \
  --record-id "$A_RECORD_ID" \
  --type A --rr error \
  --value "$CURRENT_IPV4" --ttl 600 \
  > /dev/null 2>&1; then
  log_info "✅ A 记录更新成功"
else
  log_warn "⚠️  A 记录更新失败（可能已最新或网络问题）"
fi

# 如果 IPv6 有变化，也更新 AAAA 记录
if [ -n "$CURRENT_IPV6" ]; then
  LAST_IPV6=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('ipv6',''))" 2>/dev/null || echo "")
  
  if [ "$CURRENT_IPV6" != "$LAST_IPV6" ]; then
    log_info "更新 DNS AAAA 记录 → $CURRENT_IPV6"
    if aliyun alidns update-domain-record \
      --record-id "$AAAA_RECORD_ID" \
      --type AAAA --rr error \
      --value "$CURRENT_IPV6" --ttl 600 \
      > /dev/null 2>&1; then
      log_info "✅ AAAA 记录更新成功"
    else
      log_warn "⚠️  AAAA 记录更新失败（可能已最新或网络问题）"
    fi
  fi
fi

# 保存状态
cat > "$STATE_FILE" << STATE_EOF
{
  "ipv4": "$CURRENT_IPV4",
  "ipv6": "${CURRENT_IPV6}",
  "updated_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
STATE_EOF

log_info "✅ DDNS 更新完成"
