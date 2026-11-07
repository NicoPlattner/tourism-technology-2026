# tourism-technology-2026

The [deployment workflow](.github/workflows/deploy.yaml) deploys to the existing
`tourism-technology-2026` Kubernetes namespace through Pangolin. It uses the
GitHub → Authentik OIDC credential helper embedded in the supplied kubeconfig.
No permanent Kubernetes token is required.

The [Helm chart](helm/tourism-technology) deploys PARALLEL LAB using a compressed
static build and an unprivileged nginx image. Each branch gets an isolated Helm release and URL under
`https://hackathon.daria-and-nico.com/<branch-name>`.

## Repository setup

Set these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `KUBE_CONFIG` | Complete kubeconfig, including its embedded exec helper |
| `PANGOLIN_ID` | Pangolin machine client ID with access to the private Kubernetes API |
| `PANGOLIN_SECRET` | That machine client's secret |
| `PANGOLIN_ENDPOINT` | Pangolin dashboard URL |

The workflow selects its `microk8s` context, and `id-token: write` lets the helper
request short-lived credentials. The namespace and its RBAC must already exist;
CI does not create them. Helm also needs permission to manage release secrets in
that namespace.

Optional Actions variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `KUBECTL_VERSION` | `v1.31.14` | Matches the cluster version recorded in the reference repo; adjust if upgraded |

## Run the pipeline

After the workflow exists on the default branch, open **Actions → Deploy to
Kubernetes → Run workflow**, select the branch to deploy, and run it. Any branch
can be selected; deploying is manual so unfinished pushes are not published.
By default the branch is available at
`https://hackathon.daria-and-nico.com/<branch-name>`. Branch names containing
characters outside letters, digits, `.`, `_`, `-`, and `/` receive a generated,
hashed path instead; the run summary reports the exact URL. Branch deployments
have separate release and resource names and can coexist.

Select **Deploy to the domain root** only when the user explicitly requests a
root deployment. It updates a separate `tourism-root` release at
`https://hackathon.daria-and-nico.com/`; normal runs never update that release.

The job validates configuration, connects Pangolin with private DNS, installs
or upgrades the release, waits for rollout, verifies the Service, and checks the
public URL. It collects diagnostics on failure and attempts to disconnect and
delete its temporary kubeconfig. A failed HTTP check does not automatically
roll back an already applied deployment. Public verification requires DNS,
Pangolin, and its authentication policy to allow access from GitHub Actions.

The `pangolin-ci` concurrency group serializes this repository's connections.
GitHub does not share concurrency locks across repositories: use a separate
Pangolin machine client here if another repository may deploy simultaneously.
Existing releases and legacy resources are not automatically removed.

## Public access through Pangolin

Configure a Pangolin public HTTP/HTTPS resource on the existing site:

- Domain: `hackathon.daria-and-nico.com`.
- Target: `http://<ingress-controller-LAN-IP>:80`, using the reachable controller
  address and port from your existing deployment.
- Custom Host Header: `hackathon.daria-and-nico.com`; forward all paths unchanged.
- HTTPS: terminate TLS at Pangolin. Choose the desired Pangolin authentication policy.
- DNS: point the public hostname to your Pangolin server.

Requests then follow Pangolin → ingress controller → Service → application.
The workflow checks both the Service and the public route after deployment.

## Troubleshooting

With an authenticated cluster connection, inspect the release named in the run:

```sh
kubectl -n tourism-technology-2026 get deployments,pods,services,ingresses
helm -n tourism-technology-2026 list
helm -n tourism-technology-2026 history <release>
helm -n tourism-technology-2026 rollback <release> <revision>
```

Rollback requires an earlier Helm revision. Private DNS failures usually
require checking the machine client's access to `k8s.daria-and-nico.private`.
Authentication failures require checking the supplied kubeconfig and Authentik
trust for this repository. An ingress 404 requires checking the hostname and class;
a Pangolin 502 requires checking its target address and port.

Protocol references:
[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc) and
[Pangolin machine clients](https://docs.pangolin.net/manage/clients/machine-clients).

## PARALLEL LAB

Three local tourism innovation demonstrations: Parallel Universes, Data Integrity Lab and Chaos Engine. All data, failures and predictions are simulated. See [the presentation walkthrough and model notes](docs/PARALLEL-LAB.md).

```sh
npm ci
npm run dev
npm test
npm run build
```

The default local URL is http://localhost:5173; `/` opens `/parallel`.
The deployment workflow builds with the selected branch URL prefix, runs tests,
packages `dist/` into a compressed ConfigMap, and serves the app with SPA fallback.
All three module links and assets retain the deployment prefix. The default-branch
workflow must be manually dispatched with the feature branch selected. No root
deployment is performed unless explicitly requested.
