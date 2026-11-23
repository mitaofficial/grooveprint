#!/usr/bin/env python3
"""Offline reproducible export, never required by npm run dev.
Pinned research environment: beat-this==1.1.0 torch==2.5.1+cpu
torchaudio==2.5.1+cpu einops==0.8.2 rotary-embedding-torch==0.9.2
soxr==1.1.0 onnx==1.17.0. MIT code/weights, attribution in model LICENCE.
Usage: python scripts/export-beat-this-small0.py CHECKPOINT OUTPUT.onnx
Download checkpoint only from the documented original source; validate its hash.
"""
import hashlib
from pathlib import Path
import sys
import torch
from beat_this.inference import load_model

checkpoint, output = map(Path, sys.argv[1:])
if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != '6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b':
    raise RuntimeError('Unexpected original checkpoint')
torch.set_num_threads(2)
model = load_model(str(checkpoint), 'cpu')


class Export(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, spect):
        result = self.model(spect)
        return result['beat'], result['downbeat']


x = torch.zeros(1, 1500, 128)
with torch.inference_mode():
    model(x)  # initialize rotary-frequency caches identically before tracing
    torch.onnx.export(Export(model), x, str(output),
                      input_names=['spectrogram'], output_names=['beat', 'downbeat'],
                      opset_version=17, do_constant_folding=True,
                      dynamic_axes={'spectrogram': {1: 'frames'}, 'beat': {1: 'frames'}, 'downbeat': {1: 'frames'}})
print(hashlib.sha256(output.read_bytes()).hexdigest(), output.stat().st_size)
