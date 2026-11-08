# Development workflow

- Work on a feature branch, or directly on `main` when the change is small and
  ready. Every change that should go live ends up on `main`.
- Deployment: `main` is deployed to the root domain
  `https://hackathon.daria-and-nico.com/` with the manually dispatched GitHub
  Actions workflow "Deploy to Kubernetes" (branch `main`, option
  `deploy_root` on). Branch deployments (`/<branch-name>`) are retired: they
  multiplied the load on the shared server. Do not deploy other branches.
- One deploy at a time, and only when a change is ready. Merge the latest
  `main` before pushing, so a deploy never drops other teams' work.
- Verify the deployed URL and report the commit, URL, and verification result.
  If deployment or public verification is blocked, report the blocker rather
  than claiming the deployment is available.

## Shared server: no heavy jobs by default

- Nothing heavy may run on deploy. Model training, data refreshes and other
  batch jobs run only when a person asks for them, or when an explicit
  switch for a schedule is turned on.
- The Challenge 04 data refresh (`models/refresh.py`, Helm
  `templates/c04-pipeline.yaml`) follows this rule: its CronJobs are deployed
  suspended (`c04Pipeline.schedule.fast` / `.full` = `false`). One manual run
  is started by a root deploy with the input `c04_refresh` = `fast` (snow and
  weather, no training, about 10 s) or `full` (all sources, retrains the
  models whose inputs changed).
- New jobs need resource limits, `backoffLimit: 0` unless retries are really
  needed, and must default to off.
