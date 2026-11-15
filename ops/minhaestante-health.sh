#!/usr/bin/env bash
set -euo pipefail

read -r memory available swap swapFree < <(awk '
  /^MemTotal:/ { memory=$2 }
  /^MemAvailable:/ { available=$2 }
  /^SwapTotal:/ { swap=$2 }
  /^SwapFree:/ { swapFree=$2 }
  END { print memory, available, swap, swapFree }' /proc/meminfo)
read -r swapIn swapOut majorFaults oom < <(awk '
  $1=="pswpin" { inCount=$2 }
  $1=="pswpout" { outCount=$2 }
  $1=="pgmajfault" { faults=$2 }
  $1=="oom_kill" { oom=$2 }
  END { print inCount, outCount, faults, oom }' /proc/vmstat)
read -r load1 _ </proc/loadavg
diskFree=$(df -kP /home/opc | awk 'NR==2 {print $4}')
nodePid=$(systemctl show minhaestante.service -p MainPID --value)
nodeRss=0
if [[ "$nodePid" != 0 && -r "/proc/$nodePid/status" ]]; then
  nodeRss=$(awk '/^VmRSS:/ {print $2; found=1} END{if(!found) print 0}' "/proc/$nodePid/status")
fi
http=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4183/api/auth/session || true)
pg=false
if pg_isready -q -t 2 -h /var/run/postgresql -d minhaestante; then pg=true; fi
latest=$(find /var/backups/minhaestante-postgres -maxdepth 2 -type f -name SHA256SUMS -printf '%T@\n' |
  awk '$1>max{max=$1} END {print int(max)}')
backupAge=$(( latest > 0 ? $(date +%s) - latest : -1 ))
printf '{"event":"minhaestante_health","entryPoint":"systemd_timer","httpStatus":%d,"postgresReady":%s,"backupAgeSeconds":%d,"memTotalKiB":%d,"memAvailableKiB":%d,"swapUsedKiB":%d,"swapInPages":%d,"swapOutPages":%d,"majorFaults":%d,"oomKills":%d,"load1":%s,"nodeRssKiB":%d,"diskFreeKiB":%d}\n' \
  "${http:-0}" "$pg" "$backupAge" "$memory" "$available" "$((swap-swapFree))" "$swapIn" "$swapOut" "$majorFaults" "$oom" "$load1" "$nodeRss" "$diskFree"
[[ "$http" = 200 && "$pg" = true && "$backupAge" -ge 0 && "$backupAge" -lt 172800 ]]
