# Matching accuracy — preliminary

Strict matching uses normalized filenames with exact artist + title or a unique title-only hit across the entire collection. Original vs Dub/Remix is not collapsed; collisions are marked ambiguous. Filenames are not audio fingerprints.

Unit tests confirm: exact matching; Original vs Dub remain distinct; title-only duplicates are rejected; unknown files are left unmatched. No real collection coverage/precision sample available yet. The 50–100/300-track benchmark requested in the master plan remains outstanding.

Recording MBID is NOT derivable directly from a Discogs Release ID. Because the public MusicBrainz API requires commercial permission, no auto-resolution by artist+title is performed. Enter a trusted MBID in the optional track field or use a licensed future provider.
