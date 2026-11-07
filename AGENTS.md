# Development workflow

- Make changes on a feature branch, not directly on `main`. Prefer a short, URL-safe branch name (lowercase letters, digits, and
  hyphens) so it can also serve as the deployment path.
- When a change or feature is ready, deploy that branch to the Kubernetes
  cluster and make it available at
  `https://hackathon.daria-and-nico.com/<branch-name>`. Keep branch deployments
  isolated so they do not overwrite other branches or the root deployment.
- Deploy to `https://hackathon.daria-and-nico.com/` only when the user
  explicitly requests a root deployment. A request to deploy, finish, or merge
  a feature does not by itself authorize deployment at the root.
- Verify the deployed URL and report the branch, URL, and verification result.
  If deployment or public verification is blocked, report the blocker rather
  than claiming the deployment is available.

Use the manually dispatched GitHub Actions deployment on the selected branch.
For branch names containing URL-unsafe characters, the workflow uses the
unique generated path reported in the run summary. Select the root deployment
option only when explicitly requested.
