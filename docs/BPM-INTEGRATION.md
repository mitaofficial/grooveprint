# Motore BPM interno — integrazione e prova locale, 7 novembre 2026

Successivo incarico automatico: vedere BPM-AUTOMATIC-IMPORT.md. La nuova pipeline
di sviluppo riusa questa coda per le fonti FMA CC0/BY corrispondenti; il file HTML
autonomo descritto qui non include il backend di ricerca. Il catalogo commerciale
generale rimane irrisolto e nessun BPM viene assegnato automaticamente dal pilot.

Base dell'incarico: `aeb0b7854f44a05c1def9e1afe2227bc4e29555e`, PR #3 draft,
main `28f9fd9ed699ec13c4ab4108ca2266159715e73c`. Il documento allegato
GROOVEPRINT_PROMPT_FOCUS_BPM_INTERNO(1).md è stato letto integralmente. Il nuovo
incarico autorizza il confronto V1/V2 soltanto nella prova locale, con default V1.
Nessun merge, deploy, segreto o operazione Railway è stato eseguito.

## Perché il sito pubblico mostra ancora GetSongBPM

È stato verificato in lettura `https://grooveprint-web-production.up.railway.app/`:
HTTP 200, HTML SHA-256
`29a1f42f672c6a63a038c8c1c0dcb352da767a7dc47dbf6c97f636667807c4db`.
I byte sono identici a `index.html` del main sopra indicato. La risposta contiene
il footer GetSongBPM.com, mentre non contiene GROOVEPRINT BPM Engine né l'asset
bpm-library.js. La stringa esatta GETBPM e la variante Get BPM non sono presenti.

Questo identifica la vecchia versione frontend effettivamente servita dal sito
pubblico. Non è stata assunta una causa cache. Non dimostra il commit dell'intero
backend né che una richiesta a GetSong sia stata effettuata: sono stati letti
soltanto l'HTML pubblico e il repository, senza login o ricerca catalografica.
La PR corrente non contiene il client, la lettura chiave o crediti promozionali.
Le fonti storiche nei progetti importati restano correttamente conservate.

## Mappa prima/dopo

| Superficie | Prima | Dopo e risultato |
|---|---|---|
| CONNECT AUDIO LIBRARY | bpm-library.js → worker → detector originale | Stessa coda e matching; worker originale → bpm-engine.mjs → stesso detector V1. Stima/revisione protetta |
| FILE della singola traccia | Collegava il player; mancava un comando di analisi visibile, benché un vecchio wrapper fosse esportato | FILE associa file/record/traccia/identità; ANALIZZA AUDIO — MOTORE INTERNO → analyzeTrack → stessa analyzeFiles/coda/worker. Nessuna ricerca per titolo |
| analyzeReleaseTrackBpm | Stimatore inline separato e decode per conto proprio | Alias compatibile del percorso condiviso; niente secondo decoder per questa funzione |
| Confronto locale | V2 solo nei benchmark | Opt-in di sviluppo o file locale: worker-dev → V1 e V2 su copie PCM indipendenti, diagnostica/candidati, nessuna assegnazione automatica del confronto |
| Mix Lab | estimateTempo inline con anchor, beatTimes e segmenti | Conservato e dichiarato separato: local-energy-onset-multisegment-v2 NON è il challenger grooveprint-onset-acf-v2-experimental |
| Benchmark | Moduli originali V1/V2 e protocollo comune | Stessi file DSP, parametri e predizioni; prove indipendenti su musica completa ancora mancanti |

Il primo difetto funzionale BPM affrontato è il percorso della singola traccia:
il file poteva essere collegato all'ascolto, ma il testo rimandava a un comando
non presente. Ora il comando è visibile, mostra il file associato e usa la coda
che possiede worker, Stop e protezioni delle evidenze.

## Contratto e protezioni

- bpm-engine.mjs normalizza stato, BPM eventualmente assente, candidati con
  algoritmo, motivo, revisione, finestra e durata; confidence resta null. Un
  punteggio relativo non diventa una probabilità.
- V1 rimane il default. Lo sviluppo locale rende disponibile il selettore
  V1 / V2 sperimentale, disattivato al caricamento. Il server abilita questa
  capacità solo con NODE_ENV=development; il server production nega i moduli
  sperimentali, anche con query compare=1. Nessun parametro client sblocca il server.
- Nel confronto, entrambi i risultati sono diagnostici. BPM, stato e fonte
  precedenti restano invariati fino a USA QUESTO BPM. La scelta resta estimated;
  soltanto la conferma dell'utente imposta verified. Le versioni degli algoritmi
  e la durata misurata restano nel backup, senza audio o PCM.
- Libreria e singola traccia hanno un solo job/decoder/worker. Una rianalisi
  esplicita di un valore protetto chiede conferma. Una mancata stima non cancella
  quel valore. Modifiche concorrenti invalidano il ticket prima della scrittura.
- I file collegati alla singola traccia sono legati anche a oggetto e identità
  della traccia: eliminare/riordinare/cambiare una versione non sposta il file a
  un'altra traccia con lo stesso indice. Un file picker tardivo viene rifiutato.
- Le scelte di confronto pendenti vengono invalidate da modifiche manuali. Gli
  originali esterni non sono rinominati come dati interni senza una nuova scelta.
- Decode Web Audio non annullabile e allocazioni native prima del limite PCM
  restano limiti reali. Stop scarta risultati tardivi e attende il cleanup.

## Collegamento utilizzabile: file locale scaricabile

Il browser remoto di ChatGPT ha dato errore all'utente. Non viene presentato come
accesso riuscito. Il nuovo build `npm run preview:local` produce l'app HTML
autonoma, poi consegnata in un archivio ZIP con istruzioni. Non richiede Node per
essere aperta: estrarre e aprire l'HTML nel browser del PC. Il link del pacchetto
viene fornito nella consegna della chat.

Nel file locale gli asset sono incorporati; i worker classici Blob incorporano
il codice reale dei detector, senza eval, fixture musicali o risultati precotti.
V1 è il default; V2 è opt-in e impone la scelta. Il flusso provato da file URL
non fa richieste HTTP. OAuth richiede l'edizione web configurata e non è incluso
nel file autonomo; le funzioni CSV/editor/BPM/PDF restano locali. Discogs e video
possono essere richiesti solo con le rispettive azioni esplicite: per una prova
senza rete usare dati manuali/fittizi e disabilitare il recupero dal CSV.

L'artefatto finale viene costruito dopo il commit e ne riporta l'identificativo.
La guida è `docs/BPM-LOCAL-TRIAL.md`. Il link scaricabile non è una pubblicazione
del sito Railway e non viene descritto come URL pubblico della nuova release.

## Evidenze e limiti

- Suite offline: 69 test (63 di base, tre di contratto, due lifecycle e un caso
  reale di isolamento production). Aggiunti check degli asset sviluppo/production.
- Firefox desktop/mobile: flusso da vero file URL con worker reali, confronto
  delle due versioni, valore manuale 145 preservato, scelta V2, conferma esplicita,
  versione/durata nel JSON, reimport e PDF. Zero richieste HTTP, decoder/worker
  chiusi. Una sola onda click generata prova l'integrazione, non la musica.
- La matrice CI del commit finale è il riferimento per Chromium/Firefox/WebKit,
  entrambi i viewport. Non usare la CI #93 della base per certificare questo lavoro.
- Il confronto sintetico prima/dopo mantiene tutti i risultati numerici, esclusi
  tempi/memoria variabili: V1 76/168 top-1 ±1, V2 158/168. Sono 168 casi ritmici
  generati più un controllo non ritmico, già parte dello sviluppo.
- File DSP V1 e V2 identici: hash SHA-256 rispettivamente
  `63e756e1fc3868ba8e239d80d8613d34f3e9358914d62c5c2c853ef9158d3bc4` e
  `0dad1f5d80286818b9da3bd7cb5a45988f519542c7fa9cd26092e661024df8fc`.
- I vecchi 31 loop ripetuti con etichette del produttore non sono un holdout;
  nessuna nuova precisione su brani completi, confidenza calibrata, certificazione
  di beatgrid, stampa fisica o endurance nativa viene rivendicata.

Report sanitizzato: `docs/evidence/bpm-integration-2026-11-07.json`.
Log privati: `.private/checkpoints/bpm-integration/`.
Prossimo intervento singolo: costituire il corpus autorizzato di registrazioni
complete con riferimenti beat-grid indipendenti e holdout raggruppato del
protocollo esistente. L'integrazione locale non sostituisce questa misura.
