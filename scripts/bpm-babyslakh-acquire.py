#!/usr/bin/env python3
"""Acquire only 20 BabySlakh mixes/MIDI/metadata, no stems or product lookup.
Official CC BY 4.0: https://www.slakh.com/ and Zenodo 4603844 (zip release).
Manilow et al., Cutting Music Source Separation Some Slakh (WASPAA 2019).
These are rendered MIDI compositions, NOT human techno recordings. Slakh is
not in Beat This!'s documented training list; cross-dataset composition overlap
cannot be excluded. Keep this an external diagnostic pilot, never certification.
"""
import importlib.util
import json
import hashlib
from pathlib import Path
import zipfile

spec = importlib.util.spec_from_file_location('gmd_acquire', Path(__file__).with_name('bpm-gmd-acquire.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
URL = 'https://zenodo.org/records/4603844/files/babyslakh_16k.zip'
ROOT = Path('.private/benchmarks/babyslakh-independent')
ROOT.mkdir(parents=True, exist_ok=True)
remote = module.RemoteZip(URL)
manifest = {'source': 'https://zenodo.org/records/4603844', 'license': 'CC-BY-4.0',
            'attribution': 'Manilow, Wichern, Seetharaman and Le Roux (2019)',
            'archive': URL, 'wholeArchiveHashVerified': False,
            'publishedArchiveMd5': 'ea1797fc57689a0e33c759c17a2292f5',
            'selection': 'All Track00001..Track00020; mix.wav, all_src.mid, metadata.yaml; no result-based selection',
            'domain': 'Virtual-instrument multitrack MIDI compositions, 16kHz mono, not target techno/hardgroove',
            'trainingOverlap': 'Slakh absent from documented model training datasets; shared compositions with other datasets not excluded',
            'rows': []}
with zipfile.ZipFile(remote) as archive:
    for i in range(1, 21):
        track = f'Track{i:05d}'
        row = {'id': track, 'files': {}}
        for file in ['mix.wav', 'all_src.mid', 'metadata.yaml']:
            name = f'babyslakh_16k/{track}/{file}'
            member = archive.getinfo(name)
            path = ROOT / name
            path.parent.mkdir(parents=True, exist_ok=True)
            data = path.read_bytes() if path.exists() and path.stat().st_size == member.file_size else archive.read(member)
            import zlib
            if zlib.crc32(data) != member.CRC:
                raise RuntimeError('Cached/extracted CRC mismatch')
            path.write_bytes(data)
            row['files'][file] = {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'zipCrc32': f'{member.CRC:08x}'}
        metadata = (ROOT / row['files']['metadata.yaml']['path']).read_text()
        row['family'] = next(line.split(':', 1)[1].strip() for line in metadata.splitlines() if line.startswith('UUID:'))
        manifest['rows'].append(row)
        (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print(json.dumps({'downloaded': i, 'id': track, 'family': row['family']}), flush=True)
manifest['transfer'] = {'requests': remote.requests, 'bytes': remote.bytes}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest['transfer']), flush=True)
