#!/usr/bin/env python3
"""Offline, research-only librosa dynamic-programming beat tracker baseline.

Use the SAME already-downloaded CC BY WaivOps EDM-TECH audio as the JS pilot.
No network access, no data upload, no audio artifacts. Publisher BPM labels
are evaluation-only and do not enter the inference function.

Requires (not runtime webapp dependencies): librosa==0.11.0, numpy, ffmpeg.
Usage:
  python3 scripts/bpm-v4-librosa-baseline.py .private/benchmarks/waivops-pilot/audio
"""
import json
import re
import subprocess
import sys
from pathlib import Path
import numpy as np
import librosa

BASE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".private/benchmarks/waivops-pilot/audio")
PATTERN = re.compile(r"^(\d{2,3})bpm_edm_tech_drm_id_01_\d{6}\.mp3$")
if not BASE.is_dir():
    raise SystemExit("LICENSED_LOOP_BASELINE_BLOCKED: expected pilot audio folder is absent; run the WaivOps pilot first")

def pcm(file):
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-i", str(file),
         "-t", "16", "-ar", "12000", "-ac", "1", "-f", "f32le", "-acodec",
         "pcm_f32le", "pipe:1"],
        capture_output=True, timeout=90, check=True)
    y = np.frombuffer(result.stdout, dtype="<f4").copy()
    if y.size < 5 * 12000:
        raise RuntimeError("decoded audio too short")
    # Match the earlier Node study's repeated-loop comparison protocol.
    repetitions = max(1, int(np.ceil(20 * 12000 / len(y))))
    return np.tile(y, repetitions)

rows = []
for path in sorted(BASE.glob("*.mp3")):
    m = PATTERN.fullmatch(path.name)
    if not m:
        raise ValueError("unexpected audio file name: " + path.name)
    ref = int(m.group(1))
    try:
        y = pcm(path)
        # Pure audio inference. No genre label, filename BPM or expected tempo.
        estimated, beat_frames = librosa.beat.beat_track(y=y, sr=12000, trim=False)
        bpm = float(np.asarray(estimated).reshape(-1)[0])
        if not np.isfinite(bpm) or bpm <= 0:
            bpm = None
        row = {"id": path.stem, "referencePublisherBpm": ref,
               "estimatedBpm": bpm, "beatCount": int(np.asarray(beat_frames).size),
               "within1": bpm is not None and abs(bpm - ref) <= 1.0,
               "status": "estimated" if bpm is not None else "unavailable"}
    except Exception as exc:
        row = {"id": path.stem, "referencePublisherBpm": ref, "estimatedBpm": None,
               "status": "error", "errorClass": type(exc).__name__,
               "within1": False}
    rows.append(row)
if not rows:
    raise SystemExit("LICENSED_LOOP_BASELINE_BLOCKED: found zero MP3 files")
correct = sum(1 for r in rows if r["within1"])
proposed = sum(1 for r in rows if r["status"] == "estimated")
errors = [r for r in rows if r["status"] == "error"]
result = {
    "kind": "LIBROSA_DYNAMIC_PROGRAMMING_PUBLISHER_LABEL_ONLY",
    "license": "librosa ISC, WaivOps EDM-TECH CC BY 4.0",
    "audioType": "four-bar techno loops repeated to at least 20s, NOT full tracks",
    "groundTruthIndependent": False,
    "librosaVersion": librosa.__version__,
    "total": len(rows), "proposed": proposed, "correctWithin1PublisherLabel": correct,
    "conditionalWithin1Percent": round(100 * correct / proposed, 2) if proposed else None,
    "top1CorrectCoveragePercent": round(100 * correct / len(rows), 2),
    "errors": len(errors), "cases": rows
}
print("LIBROSA_BASELINE_PUBLISHER_LABELS", json.dumps(result, separators=(",", ":")))
if errors:
    raise SystemExit("librosa baseline had decoding/detector errors; see recorded classes")
