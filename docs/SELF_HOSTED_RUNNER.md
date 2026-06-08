# Running the daily refresh on a self-hosted runner

The nightly data refresh (`.github/workflows/refresh-data.yml`) scrapes
Basketball-Reference and stats.nba.com. **Both block datacenter / cloud IP
ranges on sight** — which is exactly what GitHub-hosted runners use — so a
scheduled run on `ubuntu-latest` will usually get HTTP 403 and commit nothing.

The fix is to run the job from a **non-datacenter egress IP**. A self-hosted
runner on a residential connection is the standard way to do that.

## ⚠️ The one requirement that actually matters

The runner must reach the internet over a **residential / non-flagged IP**:

| Host the runner on…                              | Egress IP        | Works? |
|--------------------------------------------------|------------------|:------:|
| Home machine, NAS, Raspberry Pi, always-on PC    | Residential ISP  | ✅ yes |
| A cloud VM (DigitalOcean, AWS, GCP, Azure, …)    | Datacenter       | ❌ no — still blocked |

Putting the runner on another cloud box does **not** help: you'd just be on a
different datacenter IP that's blocked the same way. If you don't have an
always-on home machine, skip to [Alternatives](#alternatives) below.

The machine only needs to be awake at the scheduled time (11:00 UTC), but
"always on" is simplest.

## Why this is reasonably safe here (despite the usual warning)

GitHub warns against self-hosted runners on **public** repos because a fork can
open a PR that modifies the workflow and runs arbitrary code on your machine.
That attack relies on a `pull_request` trigger running fork-supplied code.

**This workflow has no `pull_request` trigger** — only `schedule` and
`workflow_dispatch`. Both always run the workflow file from the *default
branch* in the *base repo's* context; fork PR code never executes on the
runner. So the only code that can run on your runner is what's already merged
to your default branch — your own trust boundary.

To keep it that way:
- **Do not** add a `pull_request` (or `pull_request_target`) trigger to this
  workflow.
- Review what you merge to the default branch, as always.
- Optional hardening: register the runner as **ephemeral** (`--ephemeral`) so
  each job gets a clean checkout, and/or restrict it to this one repo.

## Quick install (one command)

On your always-on home machine (Linux/macOS), clone the repo and run the setup
script. First check that this machine's IP is actually unblocked — if it isn't,
a runner here won't help and the script tells you so without installing
anything:

```bash
# 1. Does this machine's IP reach the sources? (no install, just a probe)
scripts/setup_runner.sh --check

# 2. If that passed, grab a registration token from
#    https://github.com/skerk001/reign-web/settings/actions/runners/new
#    then install + register + service-install in one go:
scripts/setup_runner.sh --token <TOKEN>
```

The script preflights source reachability, downloads the matching runner
release, registers it with the `reign-refresh` label, and installs it as a
service. When it finishes, do the two clicks it prints: set the `RUNNER_LABEL`
repo variable and run the workflow once to confirm. Windows users (or anyone who
wants to understand each step) can follow the manual walkthrough below.

## Setup (Linux, ~10 minutes) — manual equivalent

1. **Provision the machine** with Python 3 and Node 20:
   ```bash
   sudo apt-get update && sudo apt-get install -y python3 nodejs npm
   python3 --version && node --version
   ```
   (`actions/setup-python` and `actions/setup-node` in the workflow will also
   provision these into the runner's tool cache, but having them present is a
   good fallback.)

2. **Register the runner.** In the repo on GitHub:
   `Settings → Actions → Runners → New self-hosted runner`, pick **Linux**, and
   run the commands it shows. They look like:
   ```bash
   mkdir actions-runner && cd actions-runner
   curl -o actions-runner-linux-x64.tar.gz -L \
     https://github.com/actions/runner/releases/download/<version>/actions-runner-linux-x64-<version>.tar.gz
   tar xzf actions-runner-linux-x64.tar.gz
   ./config.sh --url https://github.com/skerk001/reign-web --token <TOKEN> \
     --labels reign-refresh --unattended
   ```
   Give it a memorable label (e.g. `reign-refresh`).

3. **Install it as a service** so it survives reboots and is up at 11:00 UTC:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

4. **Point the workflow at it.** In the repo:
   `Settings → Secrets and variables → Actions → Variables → New repository
   variable`:
   - Name: `RUNNER_LABEL`
   - Value: the label from step 2 (e.g. `reign-refresh`)

   The workflow reads `runs-on: ${{ vars.RUNNER_LABEL || 'ubuntu-latest' }}`, so
   setting this variable routes the job to your runner; unsetting it falls back
   to the hosted runner with no code change.

5. **Test it now** without waiting for the cron: `Actions → Refresh REIGN data →
   Run workflow`. Watch the `refresh` job land on your runner and confirm the
   scrape returns rows (not a 403). A successful run commits any data changes
   and pushes, which triggers your Netlify/Vercel redeploy.

## Verifying it worked

- The job log should show `built N rows; top: …` from `refresh_current_season.py`
  with N in the hundreds — not `FETCH FAILED (… 403 …)`.
- The clutch step is best-effort; if stats.nba.com still blocks it you'll see
  `WARNING: clutch fetch failed … continuing without it` and the core REIGN
  refresh still completes.
- A no-change run prints `No data changes today — nothing to commit.` and is a
  clean no-op.

## Alternatives

If you can't host a runner on a residential connection:

- **Residential / rotating proxy** from the hosted runner. Keep
  `runs-on: ubuntu-latest`, add the proxy as a secret, and export
  `HTTPS_PROXY` before the refresh step. No hardware to maintain, but it's a
  paid dependency and the proxy IPs can themselves get flagged.
- **Run the pipeline entirely off GitHub** — cron `scripts/refresh_all.sh` on a
  home server and `git push` with a deploy key. Same residential-IP benefit,
  no runner agent.
- **Switch sources to the nba.com stats API for everything** (not just clutch).
  It's the less restrictive source and would consolidate on one API, but still
  blocks datacenter IPs — so it reduces the ToS concern, not the IP one.

> Heads-up on policy, not just IPs: Sports-Reference's
> [data-use policy](https://www.sports-reference.com/data_use.html) asks that
> you not build tools/sites on their scraped data without permission and caps
> requests at 20/min. Worth reviewing before running this publicly regardless of
> where the runner lives.
