"""Publish public binary site assets separately to respect Helm/ConfigMap size limits."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--release', required=True)
parser.add_argument('--namespace', required=True)
parser.add_argument('--site', type=Path, required=True)
parser.add_argument('--values', type=Path, required=True)
args = parser.parse_args()
names = []
for path in sorted(args.site.glob('*.webp')):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    name = f'{args.release}-asset-{digest}'
    # kubectl uses binaryData for non-UTF-8 files. Server-side apply avoids duplicating
    # image bytes in the size-limited last-applied-configuration annotation.
    manifest = subprocess.run([
        'kubectl', '-n', args.namespace, 'create', 'configmap', name,
        f'--from-file={path}', '--dry-run=client', '-o', 'json',
    ], check=True, capture_output=True).stdout
    value = json.loads(manifest)
    value['metadata']['labels'] = {'app': args.release, 'campaign-static-asset': 'true'}
    subprocess.run([
        'kubectl', '-n', args.namespace, 'apply', '--server-side',
        '--field-manager=campaign-static-assets', '-f', '-',
    ], input=json.dumps(value).encode(), check=True)
    names.append(name)
args.values.write_text(json.dumps({'staticAssetConfigMaps': names}))
print(f'Published {len(names)} static image ConfigMaps.')
