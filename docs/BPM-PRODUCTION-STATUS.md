# GROOVEPRINT — internal BPM product status

GetSongBPM integration was removed from active code on the development branch
`feature/bpm-intelligence-3-open-data`, PR #3. No main update, merge, deployment,
production secret change or Railway operation was performed. A live site left
on its previous release is not evidence that the development removal was deployed.

**Default BPM path:** the experimental GROOVEPRINT BPM Engine analyzes authorized
local audio in the browser using the unchanged original detector worker. Import
recovers metadata only; a missing BPM stays missing without signal or explicit
user input. There is no BPM provider signup/key gate or automatic remote fallback.

**Preserved:** user manual/verified values, explicit clears, local candidates,
version matching, stop/resource ownership, historical external provenance,
project import/export, Discogs tracklists/two-expiry recovery and vector PDF.
The isolated archive research adapter is not called by the default browser path.

**Removed:** catalog client, environment-key reader, matching resolver, lookup/
batch implementation, cache, readiness polling, promotional credits, service
controls and activation instructions. Retired API routes return 410; capability
status describes local signal analysis. Security checks remain on shared routes.

**Verification:** the new offline suite and full browser flows explicitly check
zero retired service/network/API use. A valid fixture-authorized backend session
is tested with and without a dummy obsolete key under a network audit. Legacy
JSON values retain source/reference and are not relabelled as internal estimates.
Read WORK-CHECKPOINT.md and the latest PR CI for exact results.

**Musical gate remains incomplete:** the challenger stays benchmark-only. Prior
31/31 results refer to repeated publisher-labelled loops, all review-required;
158/168 and 137/144 refer to inspected synthetic development cases. These are not
independent full-track accuracy. No musical confidence, full-track reliability,
physical print/device endurance or live OAuth certification is implied.
