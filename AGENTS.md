# Development workflow

- Work on a feature branch, or directly on `main` when the change is small and
  ready. Every change that should go live ends up on `main`.
- Production: `main` is deployed to the root domain
  `https://hackathon.daria-and-nico.com/` with the manually dispatched GitHub
  Actions workflow "Deploy to Kubernetes" (branch `main`, option `deploy_root`
  on). Merge the latest `main` before pushing, so a deploy never drops other
  teams' work.
- Branch deployments (`https://hackathon.daria-and-nico.com/<branch-name>`) are
  allowed but not the default. Decide per change whether one is needed, for
  example to show or test a larger feature in the cluster before it reaches
  `main`, or when someone asks for a preview. Do not deploy a branch for every
  change, and do not redeploy one repeatedly when tests or a local run can
  answer the question. Each branch deployment runs its own pods on the shared
  server. When a branch is deployed, keep it isolated (its own path) and say
  why it was needed.
- Use a short, URL-safe branch name (lowercase letters, digits, hyphens) when
  a branch may be deployed: it becomes the path. For other names the workflow
  generates a unique path, reported in the run summary.
- Verify a deployed URL and report the branch or commit, URL, and verification
  result. If deployment or public verification is blocked, report the blocker
  rather than claiming the deployment is available.

## Shared server: no heavy jobs by default

- Nothing heavy may run on deploy. Model training, data refreshes and other
  batch jobs run only when a person asks for them, or when an explicit
  switch for a schedule is turned on.
- The Challenge 04 data refresh (`models/refresh.py`, Helm
  `templates/c04-pipeline.yaml`) follows this rule. It exists only in the root
  release, and its CronJobs are deployed suspended
  (`c04Pipeline.schedule.fast` / `.full` = `false`). One manual run is started
  by a root deploy with the input `c04_refresh`:
  - `fast`: snow and weather, no training, about 10 s
  - `full`: all sources, retrains the models whose inputs changed
- New jobs need resource limits, `backoffLimit: 0` unless retries are really
  needed, and must default to off, also in branch releases.
