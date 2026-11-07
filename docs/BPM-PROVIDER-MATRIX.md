# Provider matrix

| Provider | BPM by title | ID requirement | Commercial/legal posture | Production decision |
| --- | --- | --- | --- | --- |
| AcousticBrainz | No | Verified MusicBrainz Recording MBID | Archived metadata CC0; 2015–2022 | APPROVED for MBID lookup; live probe HTTP 200 |
| MusicBrainz web API | Recording identity only | Artist/title search | Free web API noncommercial; contact for commercial plans | BLOCKED until permission |
| GetSongBPM | Yes | Server API key | Backlink and API terms | BLOCKED until key exists |
| SonoVault | Yes | Own key; contract | Restrictions on distribution/derived catalogs | BLOCKED until explicit allowed-use review |
| Spotify Audio Features | Historical | Client credentials | New-app access restricted | REJECTED as primary dependency |
| GROOVEPRINT local DSP | N/A | User-authorized audio PCM | Original app code; rights for audio remain with user | EXPERIMENTAL; user-visible |

Never conflate a catalog value with VERIFIED_AUDIO. External provider reachability is not a guaranteed SLA. Negative match is an honest no-result.
