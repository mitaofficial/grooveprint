#!/usr/bin/env python3
"""Acquire ARTBeaT author's audio + reference beat timestamps (CC BY 4.0).
Rico Rosenbusch (2024), https://audiolabs-erlangen.de/resources/MIR/2024-ARTBeaT
Short crafted rhythmic examples, not 25 independent target full tracks.
"""
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://www.audiolabs-erlangen.com/content/resources/MIR/00_2024-ARTBeaT/data/ARTBeaT_Dataset.zip'
root = Path('.private/benchmarks/artbeat')
root.mkdir(parents=True, exist_ok=True)
archive = root / 'ARTBeaT_Dataset.zip'
if not archive.exists():
    with urllib.request.urlopen(URL, timeout=45) as response, archive.open('wb') as output:
        total = 0
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > 70 * 1024 * 1024:
                raise RuntimeError('Archive too large')
            output.write(block)
data = archive.read_bytes()
if hashlib.sha256(data).hexdigest() != '55d29f0ea5c42c5babfaad6eb30e8b41d5deda9efe8b92694d8bba86a6b7edc3':
    raise RuntimeError('Archive changed; review source instead of silently changing corpus')
with zipfile.ZipFile(archive) as source:
    for name in source.namelist():
        if name.startswith('__MACOSX') or not name.endswith(('.wav', '.csv', '.md', '/LICENSE')):
            continue
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise RuntimeError('Unsafe member')
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(source.read(name))
print(json.dumps({'dataset': 'ARTBeaT', 'archiveSha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'license': 'CC-BY-4.0'}))
