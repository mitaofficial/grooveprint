# Cost model — current alpha

| Scenario | Provider charge | Expected calls |
| --- | --- | --- |
| Discogs-only release with no recording MBID and no authorized audio | No new AcousticBrainz charges | 0 available archive queries → zero guaranteed BPM |
| 100 known Recording MBIDs | CC0 archive API; no API subscription key | Up to 100 public archive GET requests, time/network/rate limits still apply |
| 100 local files selected in one folder | No remote DSP provider charge | 0 audio uploads; user's browser CPU/memory and power |
| GetSongBPM batch | Unavailable without key | 0 if no credential |
| MusicBrainz title matching | Not enabled | 0 |
| SonoVault | Not integrated | 0 |

Operational hosting costs: Railway existing service. Do not claim zero total cost for server CPU, bandwidth, database or browser electricity. Provider quotas, availability and commercial arrangements may change. Exact benchmarks/costs require real workloads.
