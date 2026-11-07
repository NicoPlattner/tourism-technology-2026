# tourism-technology-2026

The [deployment workflow](.github/workflows/deploy.yaml) deploys to the existing
`tourism-technology-2026` Kubernetes namespace through Pangolin. It uses the
GitHub → Authentik OIDC credential helper embedded in the supplied kubeconfig.
No permanent Kubernetes token is required.

This repository does not contain an application yet. The pipeline deploys a
small HTTP smoke application from [k8s/app.yaml](k8s/app.yaml), returning
`tourism-technology-2026 deployment OK`. It uses a public image, so no Docker Hub
credentials or image build are needed. Replace that workload and its HTTP check
when adding the actual application.

## Repository setup

Set these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `KUBE_CONFIG` | Complete contents of `someMoreInfo/KUBE_CONFIG`, including its embedded exec helper |
| `PANGOLIN_ID` | Pangolin machine client ID with access to the private Kubernetes API |
| `PANGOLIN_SECRET` | That machine client's secret |
| `PANGOLIN_ENDPOINT` | Pangolin dashboard URL |

For example, from this repository after authenticating GitHub CLI:

```sh
gh secret set KUBE_CONFIG --repo NicoPlattner/tourism-technology-2026 < someMoreInfo/KUBE_CONFIG
```

Use the new supplied kubeconfig, not the other repository's config. The workflow
selects its `microk8s` context, and `id-token: write` lets the helper request
short-lived credentials. The supplied session notes report that namespace and
RBAC preparation is already complete. CI does not create namespaces or RBAC.

Optional Actions variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_HOST` | Empty | Bare public hostname; enables the application's Ingress |
| `INGRESS_CLASS` | `nginx` | Installed ingress controller class from the reference setup |
| `KUBECTL_VERSION` | `v1.31.14` | Matches the cluster version recorded in the reference repo; adjust if upgraded |

An empty `APP_HOST` deploys only the internal Service and removes this application's
Ingress if a previous run created it. Hostnames must be lowercase, without a scheme
or path. Other applications' resources are not modified.

## Run the pipeline

Push the workflow, `k8s/`, and `scripts/` to `main`. Changes to these deployment
files trigger deployment automatically. You can also run **Actions → Deploy to
Kubernetes → Run workflow** on `main`. Other branches cannot deploy through this
workflow, although the supplied server-side OIDC trust currently accepts all refs.

The job validates configuration, connects Pangolin with private DNS, verifies API
access and namespace permissions, applies the workload and optional Ingress,
waits for rollout, then verifies the expected response through a temporary Service
port-forward. It collects diagnostics on failure and always attempts to disconnect
and delete its temporary kubeconfig. A failed HTTP check does not automatically
roll back an already applied deployment.

The `pangolin-ci` concurrency group serializes this repository's connections. GitHub
does not share concurrency locks across repositories: use a separate Pangolin
machine client here if the other repository may deploy simultaneously.

## Public access through Pangolin

Set `APP_HOST` to your chosen domain and configure a Pangolin public HTTP/HTTPS
resource on the existing site:

- Domain: exactly `APP_HOST`.
- Target: `http://<ingress-controller-LAN-IP>:80`, using the reachable controller
  address and port from your existing deployment.
- Custom Host Header: exactly `APP_HOST`; forward all paths unchanged.
- HTTPS: terminate TLS at Pangolin. Choose the desired Pangolin authentication policy.
- DNS: point the public hostname to your Pangolin server.

Requests then follow Pangolin → ingress controller → Service → application.
The workflow's smoke check verifies the Service, not public DNS or Pangolin's
browser-facing route. Test `https://<APP_HOST>/` separately once configured.

## Troubleshooting

With an authenticated cluster connection:

```sh
kubectl -n tourism-technology-2026 get deployments,pods,services,ingresses
kubectl -n tourism-technology-2026 describe deployment tourism-technology-2026
kubectl -n tourism-technology-2026 logs deployment/tourism-technology-2026
kubectl -n tourism-technology-2026 rollout undo deployment/tourism-technology-2026
```

Rollback requires an earlier deployment revision. Private DNS failures usually
require checking the machine client's access to `k8s.daria-and-nico.private`.
Authentication failures require checking the supplied kubeconfig and Authentik
trust for this repository. An ingress 404 requires checking the hostname and class;
a Pangolin 502 requires checking its target address and port.

Reference material: `otherRepo/` and `someMoreInfo/`. The active workflow does not
execute their administrative setup scripts. Protocol references:
[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc) and
[Pangolin machine clients](https://docs.pangolin.net/manage/clients/machine-clients).

## Hello world sample

[k8s/hello-world.yaml](k8s/hello-world.yaml) deploys a separate `hello-world`
Deployment, Service and Ingress that answers `Hello, World!` at
`https://hackathon.daria-and-nico.com/hello-world`. The Ingress is independent of
`APP_HOST` and uses the `nginx` class. For public access, Pangolin needs an HTTP
resource for `hackathon.daria-and-nico.com` targeting the ingress controller with
the Custom Host Header set to `hackathon.daria-and-nico.com`, as described above.
