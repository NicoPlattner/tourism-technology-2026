"""Render the optional Pangolin-facing ingress without external dependencies."""
import json
import os
from pathlib import Path
import re


def dns_name(value):
    return 0 < len(value) <= 253 and all(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in value.split(".")
    )


def render(host, ingress_class):
    if not dns_name(host) or not dns_name(ingress_class):
        raise ValueError("APP_HOST and INGRESS_CLASS must be lowercase DNS names, without scheme or path")
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {"name": "tourism-technology-2026", "namespace": "tourism-technology-2026"},
        "spec": {
            "ingressClassName": ingress_class,
            "rules": [{"host": host, "http": {"paths": [{
                "path": "/", "pathType": "Prefix",
                "backend": {"service": {"name": "tourism-technology-2026", "port": {"number": 80}}},
            }]}}],
        },
    }


if __name__ == "__main__":
    host = os.environ.get("APP_HOST", "")
    if host:
        manifest = render(host, os.environ.get("INGRESS_CLASS", "nginx"))
        Path(os.environ["RUNNER_TEMP"], "ingress.json").write_text(json.dumps(manifest))
