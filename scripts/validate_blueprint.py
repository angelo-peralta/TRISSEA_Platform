#!/usr/bin/env python3
"""Quick documentation contract validation; does not replace application tests."""
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
required = [
    'README.md', 'AGENTS.md', 'docs/03-DISPATCH-RULES.md',
    'docs/04-RIDE-STATE-MACHINE.md', 'docs/11-SECURITY-PRIVACY-PH.md',
    'design/DESIGN-BIBLE.md', 'contracts/openapi.yaml', 'database/001_core.sql',
    'infra/compose.yml',
]
errors = []
for f in required:
    if not (root / f).exists():
        errors.append(f'Missing {f}')
# Skip generated/runtime dependencies once the implementation workspace exists.
excluded = {'node_modules', '.git', '.pnpm-store', '.cache', '.c', '.expo', '.gradle', '.cxx', 'dist', '__pycache__'}
def source_files(directory):
    for p in directory.iterdir():
        if p.name in excluded:
            continue
        if p.is_dir():
            yield from source_files(p)
        else:
            yield p

files = list(source_files(root))
for p in (p for p in files if p.suffix == '.json'):
    try:
        json.loads(p.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'Invalid JSON {p.relative_to(root)}: {exc}')
for p in [root / 'contracts/openapi.yaml', root / 'infra/compose.yml']:
    if not p.exists():
        continue
    try:
        import yaml  # optional pip install PyYAML
        yaml.safe_load(p.read_text(encoding='utf-8'))
    except ImportError:
        print('Note: PyYAML not installed; skipping YAML parsing')
    except Exception as exc:
        errors.append(f'Invalid YAML {p.relative_to(root)}: {exc}')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'Blueprint validation OK ({len(files)} source files scanned).')
