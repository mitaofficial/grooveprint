#!/usr/bin/env python3
"""Private NONCOMMERCIAL MIR study only, not product catalog integration.
Michael Taenzer, mshoxxDB v1.1 (2025), CC BY-NC-SA 4.0.
https://zenodo.org/records/15881577 and https://github.com/mic-tae/mshoxxdb
No audio/MIDI redistribution. Do not use this source as commercial app audio.
Downloads only 18 full mixes and one original DAW-export MIDI per composition.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

spec = importlib.util.spec_from_file_location('acquire', Path(__file__).with_name('bpm-gmd-acquire.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root = Path('.private/benchmarks/mshoxx-research-only')
root.mkdir(parents=True, exist_ok=True)
remote = module.RemoteZip('https://zenodo.org/records/15881577/files/mshoxxDB_v1.1.zip')
with zipfile.ZipFile(remote) as archive:
    for name in ['LICENSE.txt', 'README.txt']:
        (root / name).write_bytes(archive.read(name))
    names = archive.namelist()
    mixes = sorted(name for name in names if name.endswith('.flac') and
                   name == name.split('/')[0] + '/' + name.split('/')[0] + '.flac')
    if len(mixes) != 18:
        raise RuntimeError('Dataset changed; review before redefining selection')
    manifest = {'source': 'https://zenodo.org/records/15881577',
                'license': 'CC-BY-NC-SA-4.0; private noncommercial research only; never automatic catalog audio',
                'attribution': 'Michael Taenzer, mshoxxDB v1.1 (2025)',
                'trainingOverlap': 'Not in documented Beat This training list; one composer; not target validation',
                'expectedRecords': 18, 'wholeArchiveHashVerified': False, 'rows': []}
    for mix in mixes:
        stem = mix.split('/')[0]
        midis = sorted(name for name in names if name.startswith(stem + '/') and name.endswith('.mid'))
        midi = next((name for name in midis if '_drums' in name), midis[0])
        row = {'id': stem, 'family': stem, 'files': {}}
        for kind, name in [('audio', mix), ('midi', midi)]:
            if Path(name).is_absolute() or '..' in Path(name).parts:
                raise RuntimeError('Unsafe member')
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            data = archive.read(name)
            path.write_bytes(data)
            row['files'][kind] = {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        manifest['rows'].append(row)
        (root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print(len(manifest['rows']), stem, flush=True)
