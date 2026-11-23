#!/usr/bin/env python3
"""Acquire a bounded, deterministic GMD diagnostic pilot, never product audio.

Google LLC, Groove MIDI Dataset, CC BY 4.0. Official source and acquisition
clock reference: https://magenta.withgoogle.com/datasets/groove
Gillick et al., Learning to Groove with Inverse Sequence Transformations (2019).
Range reads avoid downloading the 4.76 GiB archive. Every extracted member is
CRC checked by zipfile, and SHA-256 recorded. The *whole* archive hash is not
claimed verified when downloading ranges. No audio or MIDI belongs in git.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request
import zipfile

URL = 'https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0.zip'
ARCHIVE_SHA256 = '21559feb2f1c96ca53988fd4d7060b1f2afe1d854fb2a8dcea5ff95cf3cce7e9'


class RemoteZip(io.RawIOBase):
    def __init__(self, url=URL):
        super().__init__()
        self.url = url
        self.pos = 0
        self.requests = 0
        self.bytes = 0
        self.cache = []
        data, start, total = self.fetch('bytes=-131072')
        self.size = total
        self.cache.append((start, data))

    def fetch(self, byte_range):
        req = urllib.request.Request(self.url, headers={'Range': byte_range})
        with urllib.request.urlopen(req, timeout=45) as response:
            match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
            if response.status != 206 or not match:
                raise RuntimeError('Server must support a bounded HTTP range')
            start, end, total = map(int, match.groups())
            if end - start + 1 > 64 * 1024 * 1024:
                raise RuntimeError('Range exceeds per-member limit')
            data = response.read(end - start + 2)
            if len(data) != end - start + 1:
                raise RuntimeError('Incomplete HTTP range')
        self.requests += 1
        self.bytes += len(data)
        if self.bytes > 1536 * 1024 * 1024:
            raise RuntimeError('Pilot download budget exceeded')
        return data, start, total

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        if self.pos < 0:
            raise ValueError('Negative seek')
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True

    def read(self, size=-1):
        if size < 0:
            size = self.size - self.pos
        size = min(size, self.size - self.pos)
        if not size:
            return b''
        for start, data in self.cache:
            if start <= self.pos and self.pos + size <= start + len(data):
                out = data[self.pos - start:self.pos - start + size]
                self.pos += size
                return out
        end = min(self.size - 1, max(self.pos + size - 1, self.pos + 65535))
        data, start, total = self.fetch(f'bytes={self.pos}-{end}')
        if start != self.pos or len(data) != end - self.pos + 1 or total != self.size:
            raise RuntimeError('HTTP returned a different range')
        # Keep only metadata/small header blocks. Audio is written immediately.
        if len(data) < 2 * 1024 * 1024:
            self.cache.append((start, data))
            self.cache = self.cache[-16:]
        out = data[:size]
        self.pos += len(out)
        return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='.private/benchmarks/gmd-independent')
    parser.add_argument('--metadata-only', action='store_true')
    args = parser.parse_args()
    root = Path(args.out)
    root.mkdir(parents=True, exist_ok=True)
    remote = RemoteZip()
    with zipfile.ZipFile(remote) as archive:
        info_name = next(name for name in archive.namelist() if name.endswith('/info.csv'))
        prefix = info_name[:-len('info.csv')]
        info = archive.read(info_name)
        (root / 'info.csv').write_bytes(info)
        rows = list(csv.DictReader(io.StringIO(info.decode('utf-8'))))
        eligible = [row for row in rows if row['beat_type'] == 'beat' and
                    row['time_signature'] == '4-4' and float(row['duration']) >= 30]
        eligible.sort(key=lambda row: hashlib.sha256(row['id'].encode()).hexdigest())
        selected = []
        for split, limit in [('train', 12), ('validation', 12), ('test', 30)]:
            selected.extend([row for row in eligible if row['split'] == split][:limit])
        manifest = {'dataset': 'GMD v1.0.0', 'license': 'CC-BY-4.0',
                    'attribution': 'Google LLC; Gillick et al. (2019)',
                    'documentation': 'https://magenta.withgoogle.com/datasets/groove',
                    'archive': URL, 'publishedArchiveSha256': ARCHIVE_SHA256,
                    'wholeArchiveHashVerified': False,
                    'selection': 'sha256(id), beat, 4-4, duration>=30; train12/validation12/test30',
                    'reference': 'Independent drummer-set metronome; acquisition MIDI tempo, not an audio detector',
                    'domain': 'Human electronic-kit performances, synthesized TD-11 timbres; not full techno mixes',
                    'rows': selected}
        (root / 'selection.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print(json.dumps({'selected': len(selected), 'bySplit': {split: sum(row['split'] == split for row in selected)
                           for split in ['train', 'validation', 'test']}, 'metadataOnly': args.metadata_only}), flush=True)
        if not args.metadata_only:
            for i, row in enumerate(selected):
                row['files'] = {}
                for kind in ['audio', 'midi']:
                    name = row[kind + '_filename']
                    if not name:
                        row['files'][kind] = {'status': 'not-in-dataset'}
                        continue
                    if Path(name).is_absolute() or '..' in Path(name).parts:
                        raise RuntimeError('Unsafe member name')
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    member = archive.getinfo(prefix + name)
                    if member.file_size > 64 * 1024 * 1024:
                        raise RuntimeError('Member too large')
                    if path.exists() and path.stat().st_size == member.file_size:
                        data = path.read_bytes()
                        import zlib
                        if zlib.crc32(data) != member.CRC:
                            raise RuntimeError('Cached member CRC mismatch')
                    else:
                        data = archive.read(member)
                        path.write_bytes(data)
                    row['files'][kind] = {'path': name, 'sha256': hashlib.sha256(data).hexdigest(),
                                          'bytes': len(data), 'zipCrc32': f'{member.CRC:08x}'}
                (root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
                print(json.dumps({'downloaded': i + 1, 'split': row['split'], 'id': row['id']}), flush=True)
    (root / 'transfer.json').write_text(json.dumps({'requests': remote.requests, 'bytes': remote.bytes}) + '\n')
    print(json.dumps({'requests': remote.requests, 'bytes': remote.bytes}), flush=True)


if __name__ == '__main__':
    main()
