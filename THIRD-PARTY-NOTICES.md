# Local musical-beat preview notices

- **Beat This!** code/model: Copyright (c) 2024 Institute of Computational
  Perception, JKU Linz, Austria, MIT. Full notice:
  `src/models/beat-this-small0/LICENCE`. Preprocessing, chunking and minimal
  postprocessing adapted from https://github.com/CPJKU/beat_this; ONNX export
  derived from the published small0 checkpoint. See the model README for hashes.
- **music-tempo** 1.0.3: Copyright (c) 2017 killercrush, MIT. Full notice:
  `src/vendor/music-tempo/LICENCE`. FFT used by the spectral frontend. Other
  modules are retained for the measured, unsuccessful BeatRoot experiment.
- **ONNX Runtime Web** 1.23.2: Microsoft Corporation, MIT. Distributed through
  the pinned npm development dependency, whose package metadata declares MIT.
  MIT notice is in `src/vendor/onnxruntime/LICENSE`; upstream source and notices:
  https://github.com/microsoft/onnxruntime . No runtime binaries are vendored.

No benchmark audio, MIDI, PCM or training data is redistributed. Dataset rights
are separate from dependency rights. GMD/ARTBeaT/BabySlakh research references
and qualifications are in the musical-resolution checkpoint. Research under
more restrictive dataset terms is never an automatic product audio catalog.
