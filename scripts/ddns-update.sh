#!/bin/bash
# DDNS 自动同步脚本 - 飞牛 NAS v6 出口变化 → 阿里云 AAAA 记录
#
# 运行方式：cron 每 5 分钟跑一次, 日志在 /tmp/ddns-update.log

set -eu

NAS_HOST="gpssong@192.168.0.32"
NAS_PASS="850225sonG"
DOMAIN="93gushi.com"
RR="error"
AAAA_RECORD_ID="2096030127842204672"
TTL=600
STATE_FILE="/tmp/ddns-state.json"
ALOG="/tmp/ddns-update.log"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$ALOG" >&2; }

# 1. 从飞牛拿当前全局 v6 (去 prefixlen, 取第一个非 fe80)
CURRENT_V6=$(/opt/homebrew/bin/sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$NAS_HOST" \
  'ip -6 addr show scope global 2>/dev/null | grep -Eo "inet6 [0-9a-f:]+/" | grep -v fe80 | awk "{print \$2}" | cut -d/ -f1 | head -1' 2>/dev/null || echo "")

if [ -z "$CURRENT_V6" ]; then
  log "WARN 飞牛 SSH 取 v6 失败 (NAS 不可达?), 本次跳过"
  exit 0
fi

# 2. 查阿里云当前 AAAA 值
REMOTE_V6=$(/opt/homebrew/bin/aliyun alidns DescribeDomainRecords --profile dns \
  --DomainName "$DOMAIN" --PageSize 100 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(r['Value']) for r in d.get('DomainRecords',{}).get('Record',[]) if r.get('Type')=='AAAA' and r.get('RR')=='error']" 2>/dev/null \
  | head -1 || echo "")

if [ -z "$REMOTE_V6" ]; then
  log "WARN 阿里云查不到 AAAA 记录 (CLI 异常?), 本次跳过"
  exit 0
fi

# 3. 对比
if [ "$CURRENT_V6" = "$REMOTE_V6" ]; then
  log "OK 一致: 飞牛 v6=$CURRENT_V6 == 阿里云 AAAA, 无需更新"
  echo "{\"v6\":\"$CURRENT_V6\",\"synced_at\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"}" > "$STATE_FILE"
  exit 0
fi

log "INFO 不一致: 飞牛 v6=$CURRENT_V6, 阿里云 AAAA=$REMOTE_V6, 开始更新"
if /opt/homebrew/bin/aliyun alidns UpdateDomainRecord --profile dns \
  --RecordId "$AAAA_RECORD_ID" \
  --RR "$RR" --Type AAAA \
  --Value "$CURRENT_V6" --TTL "$TTL" \
  >> "$ALOG" 2>&1; then
  log "OK AAAA 已更新 → $CURRENT_V6"
else
  log "ERROR aliyun UpdateDomainRecord 失败, 详情看 $ALOG"
  exit 1
fi

echo "{\"v6\":\"$CURRENT_V6\",\"synced_at\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"}" > "$STATE_FILE"
log "OK 完成"
