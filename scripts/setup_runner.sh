#!/usr/bin/env bash
# One-command setup for the REIGN self-hosted GitHub Actions runner.
#
# Run this ON YOUR ALWAYS-ON HOME MACHINE (residential IP) — not a cloud VM.
# It (1) preflight-checks that this machine can actually reach the data sources
# (the whole point of a self-hosted runner), then (2) downloads, registers, and
# service-installs the GitHub Actions runner with the label the workflow expects.
#
# See docs/SELF_HOSTED_RUNNER.md for the why and the manual equivalent.
#
#   # just test if this machine's IP is unblocked (no install):
#   scripts/setup_runner.sh --check
#
#   # full install (get TOKEN from the repo:
#   #   Settings -> Actions -> Runners -> New self-hosted runner):
#   scripts/setup_runner.sh --token <TOKEN>
#
# Supports Linux and macOS. Windows: follow docs/SELF_HOSTED_RUNNER.md manually.
set -euo pipefail

REPO="skerk001/reign-web"
LABEL="reign-refresh"
DIR="$HOME/actions-runner"
TOKEN=""
CHECK_ONLY=0
FALLBACK_VERSION="2.323.0"   # used only if the GitHub API lookup fails
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --repo)  REPO="$2";  shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --dir)   DIR="$2";   shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; }
warn() { printf '    \033[33mWARN\033[0m %s\n' "$*"; }
fail() { printf '    \033[31mFAIL\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Preflight: can THIS machine reach the sources? This is the residential-IP
#    test that decides whether a runner here is worth installing at all.
# ---------------------------------------------------------------------------
say "Preflight: checking this machine's egress + source reachability"

IP=$(curl -fsS -m 10 https://api.ipify.org 2>/dev/null || echo "unknown")
echo "    public egress IP: $IP"

probe() {  # name, url
  local code
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -A "$UA" "$2" 2>/dev/null || echo "000")
  case "$code" in
    200) ok   "$1 reachable (HTTP 200)";          return 0 ;;
    403) fail "$1 BLOCKED (HTTP 403) — datacenter/flagged IP"; return 1 ;;
    429) warn "$1 rate-limited (HTTP 429) — reachable but throttled, try later"; return 0 ;;
    000) warn "$1 no response (network/DNS/timeout)"; return 1 ;;
    *)   warn "$1 unexpected HTTP $code";          return 1 ;;
  esac
}

BREF_OK=0; NBA_OK=0
probe "Basketball-Reference" "https://www.basketball-reference.com/leagues/NBA_2026_per_game.html" && BREF_OK=1 || true
probe "stats.nba.com (clutch)" "https://stats.nba.com/stats/leaguedashplayerclutch?Season=2025-26&SeasonType=Regular+Season&ClutchTime=Last+5+Minutes&AheadBehind=Ahead+or+Behind&PointDiff=5&MeasureType=Base&PerMode=Totals&LeagueID=00&Period=0&Month=0&LastNGames=0&OpponentTeamID=0&TeamID=0&PaceAdjust=N&PlusMinus=N&Rank=N&PORound=0" && NBA_OK=1 || true

if [ "$BREF_OK" -ne 1 ]; then
  echo
  fail "Basketball-Reference is blocked from this machine's IP."
  echo  "    A runner here will NOT fix the scrape — it'd 403 just like the hosted runner."
  echo  "    This machine must reach the internet over a residential / non-datacenter IP."
  echo  "    (A cloud VM will always fail this check.) Aborting."
  exit 1
fi
ok "This machine can reach Basketball-Reference — a runner here will work."
[ "$NBA_OK" -eq 1 ] || warn "stats.nba.com blocked: REIGN still refreshes, but clutch stays stale (best-effort step)."

if [ "$CHECK_ONLY" -eq 1 ]; then
  say "Preflight only (--check): looks good. Re-run with --token <TOKEN> to install."
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Prerequisites
# ---------------------------------------------------------------------------
say "Checking prerequisites (Python 3, Node)"
command -v python3 >/dev/null && ok "python3 $(python3 --version 2>&1 | awk '{print $2}')" \
  || warn "python3 not found — install it (the workflow's setup-python step is a fallback, but local is safer)"
command -v node >/dev/null && ok "node $(node --version)" \
  || warn "node not found — install Node 20+ (the workflow's setup-node step is a fallback)"

if [ -z "$TOKEN" ]; then
  fail "No --token given. Get one at: https://github.com/$REPO/settings/actions/runners/new"
  echo "    Then: scripts/setup_runner.sh --token <TOKEN>"
  exit 2
fi

# ---------------------------------------------------------------------------
# 3. Resolve platform + latest runner release
# ---------------------------------------------------------------------------
say "Resolving runner package for this platform"
case "$(uname -s)" in
  Linux)  RUNNER_OS="linux"; SVC_SUDO="sudo" ;;
  Darwin) RUNNER_OS="osx";   SVC_SUDO="" ;;
  *) fail "Unsupported OS $(uname -s); use docs/SELF_HOSTED_RUNNER.md"; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) RUNNER_ARCH="x64" ;;
  arm64|aarch64) RUNNER_ARCH="arm64" ;;
  *) fail "Unsupported arch $(uname -m)"; exit 1 ;;
esac

VERSION=$(curl -fsSL -m 15 https://api.github.com/repos/actions/runner/releases/latest 2>/dev/null \
  | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/' | head -1)
[ -n "$VERSION" ] || { VERSION="$FALLBACK_VERSION"; warn "release lookup failed; using pinned v$VERSION"; }
ok "runner v$VERSION for $RUNNER_OS-$RUNNER_ARCH"

TARBALL="actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${VERSION}/${TARBALL}"

# ---------------------------------------------------------------------------
# 4. Download + extract
# ---------------------------------------------------------------------------
say "Installing into $DIR"
mkdir -p "$DIR"; cd "$DIR"
if [ -f "./config.sh" ]; then
  warn "runner already present in $DIR; reconfiguring"
else
  curl -fsSL -o "$TARBALL" "$URL"
  tar xzf "$TARBALL"
  rm -f "$TARBALL"
  ok "extracted runner"
fi

# ---------------------------------------------------------------------------
# 5. Register with the repo (idempotent: --replace)
# ---------------------------------------------------------------------------
say "Registering runner with $REPO (label: $LABEL)"
./config.sh \
  --url "https://github.com/$REPO" \
  --token "$TOKEN" \
  --name "$(hostname)-reign" \
  --labels "$LABEL" \
  --unattended --replace
ok "registered"

# ---------------------------------------------------------------------------
# 6. Install + start as a service so it survives reboots / is up at 11:00 UTC
# ---------------------------------------------------------------------------
say "Installing as a background service"
$SVC_SUDO ./svc.sh install
$SVC_SUDO ./svc.sh start
$SVC_SUDO ./svc.sh status || true

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
say "Runner is up. Two more clicks to go live:"
cat <<EOF
    1. Set the repo variable so the workflow targets this runner:
         https://github.com/$REPO/settings/variables/actions
         New repository variable -> Name: RUNNER_LABEL   Value: $LABEL

    2. Test it now (don't wait for the 11:00 UTC cron):
         https://github.com/$REPO/actions/workflows/refresh-data.yml
         "Run workflow". The 'refresh' job should land on $(hostname)-reign
         and log "built N rows" instead of a 403.

    Manage the runner later from $DIR:
         $SVC_SUDO ./svc.sh status | stop | start
         ./config.sh remove --token <new-token>   # to unregister
EOF
