#!/bin/bash
# Daily Homebrew update: refresh, upgrade formulae + casks (greedy), then clean up.
# Invoked by the com.example.brew-autoupdate LaunchAgent at 08:00 daily.
set -uo pipefail

# Persist this run's exit code so the Übersicht status widget can color its dot
# from the last ACTUAL run. launchctl's exit code is wiped on reboot; this file
# is not, so the dot stays accurate across restarts.
trap 'echo "$?" > "$HOME/Library/Logs/com.example.brew-autoupdate.exit"' EXIT

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
# Retry brew's own downloads to absorb transient network blips mid-run.
export HOMEBREW_CURL_RETRIES=3
BREW=/opt/homebrew/bin/brew

# The LaunchAgent fires at 08:00, ~2 min after a scheduled 07:58 wake, so the
# network (and VPN) is often not up yet -> curl EADDRNOTAVAIL. Wait for a live
# connection before touching brew, up to ~90s, then proceed regardless.
wait_for_network() {
    local url="https://formulae.brew.sh" tries=0 max=30
    until curl -sf --max-time 5 -o /dev/null "$url"; do
        tries=$((tries + 1))
        if [ "$tries" -ge "$max" ]; then
            echo "network not ready after $((max * 3))s, proceeding anyway"
            return 0
        fi
        sleep 3
    done
    [ "$tries" -gt 0 ] && echo "network ready after $((tries * 3))s"
    return 0
}

# Prominent per-run header so days are easy to tell apart when scanning the log.
banner() {
    printf '\n===================================================================\n'
    printf '  %s  |  %s\n' "$1" "$(date '+%A, %B %d %Y  %H:%M:%S')"
    printf '===================================================================\n'
}

banner "brew autoupdate"

wait_for_network

rc=0
"$BREW" update                 || rc=$?
"$BREW" upgrade --greedy       || rc=$?   # formulae + casks, incl. auto-updating casks
"$BREW" cleanup                || rc=$?

echo "===== $(date '+%Y-%m-%d %H:%M:%S') brew autoupdate DONE (exit $rc) ====="
exit $rc
