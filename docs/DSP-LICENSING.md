# DSP licensing decision

Essentia and Essentia.js are licensed AGPLv3. The project's official licensing page says commercial licenses are available by contacting MTG/UPF. Dependencies may have additional GPL/LGPL obligations.

Sources: https://essentia.upf.edu/licensing_information.html and https://github.com/MTG/essentia.js/blob/master/package.json

**Decision:** Do NOT bundle Essentia.js into GROOVEPRINT production yet. A commercial licensing/legal decision and a real-audio accuracy benchmark must come first. Current automatic BPM enrichment is metadata lookup only, not DSP.

If a commercial license is obtained, assess WebAssembly/Worker packaging, beat tracking algorithms (multifeature vs degara), CPU/memory cost, CORS and permitted audio sources. Do not download or decode copyrighted streaming audio without authorization.
