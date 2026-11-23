# Beat This! small0 — development preview

Francesco Foscarin, Jan Schlüter, Gerhard Widmer, *Beat this! Accurate beat
tracking without DBN postprocessing*, ISMIR 2024.
https://github.com/CPJKU/beat_this — code and published weights MIT; see `LICENCE`.
The authors note that training audio has diverse copyright terms. No training
audio, dataset or annotations are redistributed here. No training was performed.

- Original `small0.ckpt`: https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/small0.ckpt
- Original SHA-256: `6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b`.
- ONNX SHA-256: `9a46746dcd87354f67010c274fcde8ab8331048022d2b2c0043f5314b6468f07`.
- ONNX bytes: 10,401,060; opset 17; 2,099,960 parameters; float32.
- Input `[1,frames,128]` log-mel, outputs `beat` / `downbeat` logits.
- Export checked at 444/760/1500 frames against PyTorch: maximum absolute logit
  differences <=4.77e-6 on the deterministic export diagnostic. That is numerical
  parity, not musical validation. Browser inference is bounded to 768 frames.
- JS spectral features vs PyTorch on the same 30 s PCM: max difference 4.995e-5,
  mean 1.765e-6. Full PCM/features remain private.

The preview does not interpret logits or agreement as calibrated confidence.
It fits measured musical beats in disjoint windows, gates phase/stability and
preserves uncertainty. Small independent clock-reference pilots are not a
validation of commercial techno/hardgroove; see the resolution checkpoint.

Python is needed only to reproduce the export, not to run the site. The browser
uses pinned `onnxruntime-web` 1.23.2 (MIT) locally, single-threaded WebAssembly,
without a third-party inference service or audio upload. Native/browser memory
is separate from the existing 128 MiB decoded-PCM check; no 128 MiB total-memory
guarantee is made. The 30 s / 1500-frame prototype was rejected for excessive
memory (~907 MiB observed Node process RSS); the shipped context is shorter.
