> Aggiornamento operativo 23 novembre 2026: leggere prima
> [BPM-MUSICAL-RESOLUTION-2026-11-23.md](BPM-MUSICAL-RESOLUTION-2026-11-23.md).
> La preview usa il nuovo motore di beat musicali con stime sperimentali;
> i vincoli storici V1-default/review-globale sono superati nel solo sviluppo.
> Main/Railway invariati; accuratezza target e copertura commerciale incomplete.

# Ripresa BPM automatici — 23 novembre 2026

**Stato del prodotto: PARZIALE.** La ricerca e l'analisi automatiche funzionano
per gli abbinamenti consentiti nella collezione Free Music Archive di Internet
Archive. Non è dimostrata la copertura della collezione commerciale
techno/hardgroove dell'utente. Tutti i risultati automatici restano in revisione,
senza assegnazione numerica. Un upload manuale non chiude questo incarico.

Prova successiva sul PC del proprietario: la schermata conferma audio CC BY e
180 secondi analizzati, ma nascondeva le ipotesi V1 dietro il solo messaggio di
revisione. Ora **Mostra ipotesi calcolate** espone i numeri diagnostici realmente
salvati. **VEDI RISULTATI BPM** apre quei dettagli; campo BPM, soglie e policy
restano invariati. Leggere i picchi non equivale a convalidare il tempo musicale.

## Stato ripreso e problema riproducibile

Letto integralmente `GROOVEPRINT_PROMPT_BPM_AUTOMATICO_IMPORT_DISCOGS(2).md`.
Il checkout locale pulito era fermo a `e19ebc384d9882467fcc1ba83518f4f4e6902ab3`.
La PR #3 aveva invece HEAD `5d8b2b296b172c19b0d8cf649b5d87453f569550` e CI
#253 riuscita: https://github.com/mitaofficial/grooveprint/actions/runs/42651299710.
È stato effettuato un avanzamento fast-forward, conservando le successive
correzioni della tracklist vuota e gli esperimenti V3/V4. Sono stati letti i
documenti operativi e d'architettura attuali, senza ripartire dagli ZIP.

Nella preview di quel codice il selettore si apriva su confronto V1/V2 e anche
l'importazione normale eseguiva il worker sperimentale. Dopo un confronto, una
nuova copia della stessa registrazione poteva riutilizzare il risultato di quel
confronto. L'allegato attuale richiede invece V1 come default e confronto opt-in.
Due regressioni sono state eseguite prima della correzione: entrambe fallivano,
una sul worker usato e una sul riuso del risultato sperimentale.

## Correzione e flusso conservato

- `bpm-library.js` parte da V1; accetta una scelta del motore per il singolo job,
  verificando comunque che il confronto sia consentito solo in sviluppo.
- `bpm-auto.js` cattura V1 nei job d'importazione e confronto nei soli job avviati
  con l'azione esplicita. Il selettore della libreria locale non cambia questa
  scelta. La cache DSP distingue modalità e identità: una copia V1 può riusare
  V1, mai il risultato del confronto. La coda/context/worker rimane unica.
- Il risultato V1 è descritto come analisi da verificare. La UI conserva il
  comportamento prudente: i picchi non diventano proposte numeriche affidabili;
  il confronto resta facoltativo, con un comando nel pannello del batch.
  Provenienza e durata dell'analisi restano visibili.
- Import CSV seguito da recupero tracklist, sync/revalidazione, caricamento
  progetto e recupero incrementale mantengono gli hook automatici già presenti.
  Restano ticket, Stop, opt-out, protezione di manual/verified/clear, deduplica,
  scadenza dei metadati e separazione `trackSource`/fonte BPM.
- V1 e V2 DSP non sono stati modificati. V3 resta nel confronto esplicito; V4
  resta ricerca offline. Non è stata introdotta Essentia né una nuova sorgente
  BPM esterna. Nessuna promozione di un algoritmo o riattivazione GetSongBPM.

## Evidenza live e prove controllate

Due prove interattive del 23 novembre, con server di sviluppo e rete/audio reali,
usano **PROVA UNA RELEASE APERTA** una volta per prova, senza selezionare file
audio o simulare API. La release di controllo è Josh Woodward, *Crawford Street*,
Discogs 3759149, fuori dal genere target.

| Misura osservata | Prima | Dopo la correzione del motore |
|---|---:|---:|
| Tracce recuperate ed elaborate | 14/14 | 14/14 |
| Tracce con analisi interna | 11 | 11 |
| Abbinamenti in revisione per identità/durata | 2 | 2 |
| Tracce senza fonte utilizzabile | 1 | 1 |
| Totale da verificare nella UI | 13 | 13 |
| Errori riportati | 0 | 0 |
| Assegnazioni numeriche automatiche | 0 | 0 |
| Motore osservato nel percorso normale | confronto V1/V2 | V1 |

Questa è una verifica della catena, non una misura di accuratezza. Non ci sono
riferimenti indipendenti per questo album. Le due prove manuali precedono il
commit, con il checkout di base indicato nel server: non vengono presentate come
sessioni di un server già riavviato sull'HEAD finale. Le prove CI finali sono
collegate alla PR e ne identificano separatamente l'HEAD.

`npm run validate`: 136 test superati, nessuno saltato, controlli sintattici,
repository/privacy e smoke sintetico. Il test del caso corretto verifica anche
la sequenza V1 → confronto esplicito → nuova importazione V1 e il riuso V1 per
un'ulteriore copia, con al massimo un context e risorse finali a zero.

La suite browser verifica CSV → recupero tracklist → fonte → MP3 generato realmente
decodificato → DSP → revisione/PDF, con API esplicitamente simulate. Il primo batch
di sei tracce/due copie richiede tre risoluzioni e un download/decode. Il selettore
locale viene intenzionalmente impostato su confronto prima dell'importazione:
il batch deve eseguire comunque V1. Il successivo confronto esplicito conserva
entrambi gli algoritmi e la decisione sperimentale. Non sono successi live di
catalogo. Il flusso HTML locale conserva confronto opt-in, BPM manuale 145,
JSON/PDF e zero richieste HTTP; non sostituisce il server della pipeline.

`npm run benchmark:compare` mantiene 76/168 V1 e 158/168 V2 entro ±1 BPM, più
un controllo non ritmico. Sono gli stessi casi sintetici di sviluppo già
ispezionati, non un holdout musicale. Gli hash dei due DSP sono invariati.

Log privati ignorati: `.private/checkpoints/auto-discogs-2026-11-23/`.
Misure sanitizzate: `docs/evidence/auto-discogs-2026-11-23.json`.
La CI del nuovo HEAD deve certificare la matrice finale; la #253 è storica.

Firefox 144.0.2 locale: suite completa superata su desktop e viewport touch
390×844. Probe one-click: un caso legacy, un caso fresh, errore 503 visibile e
ripresa, tutti riusciti; provider simulati e decoder/worker reali. Il download
ufficiale Chromium è fallito nel gateway dell'ambiente; WebKit, scaricato, non
parte per librerie di sistema mancanti. Questi limiti locali non vengono
trasformati in pass: la matrice completa viene eseguita nella CI finale.

La prima nuova CI #254, commit `ccd2211b431dede037a6e75ed6d55067ebb95fc4`,
ha riprodotto un diverso problema di ambiente: `ubuntu-latest` è diventato
Ubuntu 26.04 e Playwright 1.57.0 rifiuta quell'OS durante `install --with-deps`.
I sette job browser si fermano prima dei test; il job Node e il probe provider
passano. Log esaminati per tutti e tre i motori. I tre gruppi browser sono ora
fissati su `ubuntu-24.04`, supportato dal pacchetto; nessuna suite o dipendenza
di verifica è rimossa. La nuova CI deve provare la correzione sul nuovo HEAD.
Run fallita: https://github.com/mitaofficial/grooveprint/actions/runs/45143634875.
Etichette runner: https://docs.github.com/en/actions/reference/runners/github-hosted-runners.

## Fonti ricontrollate e impedimento prioritario

Il resolver rimane generico per artista/album, non vincolato all'ID del controllo.
Prima del download richiede collezione curata, CC0/CC BY 3.0/4.0 per item/file,
artista effettivo, titolo/versione, album e durata compatibili. I limiti di rete,
licenza e transport/DNS dichiarati in `BPM-AUTOMATIC-IMPORT.md` restano applicabili.

Verifica pubblica del 23 novembre:

| Fonte ufficiale | Osservazione e limite |
|---|---|
| https://archive.org/about/terms | Testo letto nel browser: accesso per ricerca; le licenze dichiarate richiedono fiducia nel dichiarante. Non costituisce un accordo commerciale generale. La lettura web senza rendering restituisce solo un contenitore JavaScript. |
| https://freemusicarchive.org/music/Josh_Woodward/Crawford_Street/ | L'indicizzazione ufficiale dichiara CC BY, da verificare per singola traccia; l'apertura web diretta restituisce 403. Il resolver controlla anche i metadati live della fonte prima di usare i file. |
| https://developer.spotify.com/policy | La policy III.13 continua a vietare l'analisi dei contenuti Spotify. Non è stata selezionata come fonte. |
| https://docs.massivemusic.com/reference/play-preview-clip | Consegna preview autenticata, paese e logging; URL a scadenza. Nessuna autorizzazione per la nostra analisi è stata ottenuta o dedotta da questo endpoint. |

**Unico prerequisito di prodotto prioritario:** accesso a registrazioni/preview
del catalogo target con identità di versione e permesso esplicito di analisi BPM
automatizzata. Il contratto di risultato del resolver è già disponibile; un
adapter commerciale richiede queste condizioni e le credenziali reali, non una
chiave generica o un player ascoltabile. Nessun contatto commerciale, accordo,
registrazione o acquisto è stato avviato. Dopo l'accesso serviranno riferimenti
beat-grid indipendenti per validare la politica di assegnazione; non si abbassano
le soglie sui dati già visti.

## Come provare la pipeline completa

Non esiste una nuova preview pubblica condivisibile tra gli ambienti autorizzati.
La preview gestita è interna alla sessione e il suo loopback non è un link dal
PC dell'utente. Non è stato creato hosting né effettuato deploy per aggirare il
vincolo. Il sito Railway non viene presentato come questa nuova versione.

Lettura anonima del sito pubblico il 23 novembre, HTTP 200: HTML SHA-256
`29a1f42f672c6a63a038c8c1c0dcb352da767a7dc47dbf6c97f636667807c4db`,
224.671 byte identici all'index del main protetto. Contiene ancora il vecchio
credito GetSongBPM e non l'asset `bpm-library.js`. Questo spiega la differenza
visibile rispetto al branch: non è la nuova interfaccia. Non prova quale commit
esegua il backend o che siano state inviate richieste a quel servizio.

Sul PC, con Node >=22.13 e Git, primo avvio in una nuova cartella:

```powershell
git clone --single-branch --branch feature/bpm-intelligence-3-open-data https://github.com/mitaofficial/grooveprint.git
cd grooveprint
npm run dev
```

Se il repository è già presente, controllare prima `git status --short`; sul
branch corretto e senza modifiche incompatibili, fermare il server precedente,
eseguire `git pull --ff-only` e `npm run dev`. Non scartare modifiche locali.
Non occorrono chiavi Discogs, FFmpeg o `npm ci` per il controllo aperto.

Aprire http://127.0.0.1:4173/ **sullo stesso PC del server**, confrontare il commit
mostrato nel pannello con l'HEAD della PR e premere **PROVA UNA RELEASE APERTA**.
Attendere il progresso automatico; **VEDI RISULTATI BPM** apre la revisione.
Il test non richiede MP3, cartelle audio o click per ogni traccia. Per il proprio
CSV lasciare attivo il recupero tracklist: i brani fuori dal catalogo consentito
resteranno senza BPM. La stampa non inventa i valori mancanti.

Main protetto `28f9fd9ed699ec13c4ab4108ca2266159715e73c`; PR #3 draft.
Nessun merge, deploy, operazione Railway o variazione di segreti/ambiente.
