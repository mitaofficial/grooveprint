# Importazione Discogs → analisi BPM automatica — 7 novembre 2026

**Stato: implementazione parziale, con prova reale riuscita su un catalogo aperto
delimitato. L’obiettivo di coprire automaticamente la collezione techno/hardgroove
commerciale resta incompleto.** Non viene sostituito da upload manuali.

Base verificata: `fa00c353cdba31eb8ca02b57715dca51ac3627ae`, working tree pulito,
PR #3 draft, CI #94 success. Main `28f9fd9ed699ec13c4ab4108ca2266159715e73c`
invariato. Letto integralmente l’incarico BPM_AUTOMATICO_IMPORT_DISCOGS(1).md.
Nessun deploy, merge, modifica a Railway, segreto, acquisto o registrazione API.

## Problema riprodotto e cambiamento

Prima, CSV/import Discogs/recupero tracklist attivavano esclusivamente
collection-enrichment.js: nessuna ricerca audio e nessun job BPM automatico.
FILE richiedeva un’associazione per traccia.

Ora, nell’ambiente di sviluppo, le tracklist valide attivano bpm-auto.js.
Il resolver cerca nel catalogo autorizzato; il browser scarica l’originale,
quindi usa la stessa coda/context/worker V1 della libreria locale. Non serve
scegliere file audio. Copie identiche riusano risoluzione positiva/negativa e
risultato DSP; renderer, notifica ripetuta e retry non duplicano lo stesso lavoro.

Il resolver cerca per i metadati importati nella collezione curata
**freemusicarchive** di Internet Archive. Accetta soltanto dichiarazioni CC0 o
CC BY 3.0/4.0, controllando anche un'eventuale licenza specifica del file.
Non esiste una whitelist di release ID: un altro album può essere trovato senza
modificare il codice. Vengono esclusi gli upload generici opensource_audio,
le licenze NC/ND/SA non approvate e le fonti ambigue. La disponibilità nel
catalogo commerciale techno/hardgroove non è stabilita.

Josh Woodward, *Crawford Street*, Discogs 3759149, resta il controllo reale fuori
dal genere target e il pulsante di prova; il suo ID non è una condizione del
resolver. La UI dichiara il catalogo prima della ricerca e conserva l'opt-out
nel browser. Production non abilita il resolver.

## Decisione sulle fonti

Verifica documentale e richieste controllate del 7 novembre 2026. L’esistenza di
un endpoint o di una preview ascoltabile non prova il permesso per il nostro uso.

| Fonte | Evidenza verificata | Decisione attuale |
|---|---|---|
| Discogs | Metadati reali della release 3759149 ottenuti dal pubblico `/releases/3759149`; nessun BPM/audio nella tracklist | Identità e tracce, mai segnale inventato |
| Internet Archive / Free Music Archive | Ricerca reale per artista/album, item Crawford_Street-17897 nella collezione freemusicarchive, licenza BY 4.0 e file originali con tag/durata; pagina FMA dell’album e schede individuali dichiarano BY | Ricerca nella collezione FMA, con filtro CC0/BY per ogni item e file; prova live sul controllo; copertura commerciale non stabilita |
| Spotify | Developer Policy III.13 vieta l’analisi del contenuto | Escluso come sorgente DSP |
| Apple Search API | Preview offerte per promozione del contenuto del negozio; nessun permesso verificato per questa analisi | Escluso in assenza di autorizzazione specifica |
| YouTube | Policy vietano download/separazione dei componenti salvo le autorizzazioni previste; link Discogs propagabili fra release dello stesso master | Nessuna estrazione, player nascosto, cattura scheda o ripping |
| SoundCloud | API richiede registrazione/credenziali; diritti dell’uploader e limiti di uso/download/commerciali restano applicabili | Nessuna credenziale o autorizzazione per un catalogo generale disponibile; nessuna integrazione attivata |
| Jamendo | API gratuita non commerciale; condizioni Licensing vietano data mining commerciale automatizzato | Non assunto come fonte commerciale utilizzabile |
| MassiveMusic / 7digital | Documentazione attuale espone consegna di preview con OAuth, URL a scadenza e reporting | Candidato B2B da valutare con autorizzazione scritta all’analisi e credenziali; non interrogato né integrato |
| AcousticBrainz / vecchio pilot WaivOps | Archivio di valori esterni / loop da benchmark | Non sono audio di catalogo automaticamente collegabile alle release; nessun fallback |

Le condizioni IA osservate nel browser dichiarano accesso per ricerca e consentono
l’uso del materiale secondo la licenza dichiarata, nella misura in cui si ritenga
attendibile il dichiarante. Questo non certifica ogni upload né un uso commerciale
generale del servizio. Il codice rimane confinato allo sviluppo e alla collezione curata con le sole licenze supportate.
Non sono state ottenute nuove autorizzazioni commerciali.

Fonti ufficiali consultate:
- https://archive.org/about/terms (testo reso nel browser; la lettura HTTP iniziale mostrava solo il contenitore JavaScript)
- https://archive.org/services/docs/api/ (risorsa ufficiale; accesso del motore web limitato)
- https://archivesupport.zendesk.com/hc/en-us/articles/360018359991-Search-A-Basic-Guide
- https://archive.org/metadata/Crawford_Street-17897
- https://freemusicarchive.org/music/Josh_Woodward/Crawford_Street/ e schede individuali: indicizzazione consultata, apertura web diretta 403
- https://developer.spotify.com/policy
- https://performance-partners.apple.com/search-api
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.soundcloud.com/docs/api/terms-of-use
- https://devportal.jamendo.com/api_terms_of_use
- https://licensing.jamendo.com/en/legal/termsofuse
- https://docs.massivemusic.com/reference/introduction
- https://docs.massivemusic.com/reference/play-preview-clip

## Percorso e contratti

| Fase | Implementazione / vincolo |
|---|---|
| Import CSV e recupero tracce | collection-enrichment.run → AutomaticBPM.schedule; ogni tracklist recuperata può partire senza attendere l’intera collezione |
| Import/sync, revalidazione, progetto e restore | Hook sui percorsi reali; metadati scaduti, record rimossi o account disconnesso non sono idonei |
| Fonte | audio-source.mjs ricerca IA, verifica item, collezione e licenza, poi tag originali esatti artista/titolo/versione/album e durata entro 5 secondi |
| Identità | Nessuna rimozione delle versioni tra parentesi; omonimi, file multipli e durate incompatibili richiedono astensione. Non è una certificazione del master |
| Download | URL costruito per un item validato della collezione; browser CORS, niente cookie, MIME audio/mpeg e limite effettivo 16 MiB; timeout 45 s |
| DSP | AudioLibrary.analyzeFiles con ticket precedente alla ricerca, signal e guardia di validità; un context/worker proprietario; default V1 |
| Assegnazione | Tutti i risultati automatici sono review, BPM numerico non assegnato. Manca una politica di accettazione musicalmente validata |
| Risultati | Algoritmo, finestra/durata, candidati, data e provenienza: item/file, licenza, attribuzione, checksum della fonte; mai byte/PCM o URL di download nel JSON |
| Ripresa | Solo errori/cancellazioni/stale dopo comando esplicito; assenza fonte non genera retry infinito |

`/api/audio/status` è leggibile e descrive la capacità. `/resolve` e `/example`
esistono soltanto in development; production risponde 404 anche con query enable=1.
Resolve usa sessione, CSRF, controlli origine e limiti per sessione/globali; massimo due risoluzioni in volo e almeno 1500 ms fra richieste del client.
429/503 sospendono il batch per evitare una cascata di richieste. Nessun
endpoint accetta URL o host scelti dal client. La cache sorgente è solo metadati
pubblici: massimo 16 ricerche album, fino a tre item per ricerca, TTL cinque
minuti con rimozione temporizzata; la cache risultati
frontend è volatile, limitata a 1500 identità e viene svuotata al cambio progetto.

Il backend legge API HTTPS del servizio fissato dal codice. Redirect esterni,
IP letterali, credenziali e porte alternative vengono rifiutati. Il trasporto nel
container usa il proxy HTTPS gestito: **non è dichiarato DNS pinning**. La verifica
di indirizzi non pubblici è testata con resolver iniettato, non dimostrata come
pinning del trasporto proxy. Non esiste un proxy audio generico; l’audio va dal
servizio approvato al browser. Un’estensione a host di terzi richiede nuova revisione.

## Integrità preservata e difetto aggiuntivo corretto

Manual/verified/clear e revisioni proteggono ogni scrittura. Stop del pannello
automatico o della coda condivisa interrompe tutta la coda automatica: i lavori
successivi non ripartono da soli. Il decode nativo non annullabile conserva il
lock fino al rilascio. Copie, reorder, modifiche concorrenti, collezioni sostituite
e scadenze invalidano i ticket. Nessun secondo decoder viene introdotto.

Il campo source aveva due ruoli: origine metadati e fonte BPM. Cambiarlo in
local-dsp dopo un’analisi poteva sottrarre una tracklist Discogs alla rimozione
per TTL/backup. Le tracce recuperate mantengono ora anche trackSource=discogs;
scadenza, backup e reimportazione continuano a eliminare i metadati API. Le copie
locali esplicite e i valori umani conservano i meccanismi già previsti. Le nuove
URL di provenienza rifiutano query/fragment, byte e campi sconosciuti.

## Prove reali, prove simulate e limiti

1. `npm run proof:auto-bpm`: rete reale Discogs → ricerca IA → metadati → MP3
   originale → FFmpeg (12 kHz mono, primi 180 s, nessuna ripetizione) → V1/V2.
   Tracklist di 14 tracce: 11 abbinamenti secondo i criteri, 2 durate incompatibili,
   1 artista non corrispondente. La ricerca generica finale riproduce questi conteggi. Questo runner analizza **un solo MP3**, 5.974.865
   byte, SHA-256 `2016f8a4c3306ddc12c3a1c2bb2a117b8bf2f35913ddbb10c578253aaa4a0c1d`.
   V1 100 BPM, V2 66.7 BPM: riferimento indipendente assente, accuratezza non
   misurata. Nessuno dei due viene dichiarato il tempo corretto.
2. Prova interattiva Chrome del server development: premuto PROVA UNA RELEASE
   APERTA, senza file chooser audio né mock. Il flusso ha recuperato le 14 tracce,
   eseguito 11 analisi, mantenuto 2 abbinamenti in revisione e 1 senza fonte.
   UI finale: 14/14, 13 da verificare, 1 senza fonte, 0 errori. Zero BPM assegnati
   automaticamente. Non è una prova di precisione musicale né della collezione utente.
3. Ulteriore ricerca reale, solo metadati: le prime tre tracce di *Only Whispering*
   (Discogs 7162237) restano irrisolte ai controlli di licenza/identità. Due richieste
   alla fonte, nessun audio scaricato o BPM analizzato. È un controllo negativo,
   non un campione rappresentativo né una prova che il brano non esista altrove.
4. Browser automatici: nuovo flusso con API esplicitamente simulate e MP3 generato
   realmente decodificato da V1. Sei tracce/due copie → tre risoluzioni, un download
   e un decode; remix ambiguo e assenza fonte non assegnano BPM. Verificati PDF e
   conservazione dei limiti metadata. Il precedente flusso HTML locale resta.
5. Suite offline: 87 test; aggiunti contratto fonte, limiti/redirect/licenza e scoperta di un altro album senza ID fissato, compilation/opt-out,
   idempotenza e concorrenza, Stop/race/expiry, protezione dei dati e sessioni
   sviluppo/production. La CI del nuovo HEAD deve certificare la matrice finale.

I due moduli DSP sono byte-identici alla base. Il benchmark sintetico completo
resta un controllo di sviluppo: 76/168 V1 e 158/168 V2 top-1 ±1, non una misura su
queste registrazioni. Il vecchio corpus di loop ripetuti non diventa un holdout.

Non sono disponibili riferimenti beat-grid indipendenti, un holdout di brani
completi target o misure di copertura della collezione dell’utente. Precisione delle
assegnazioni automatiche: non definita (nessuna assegnazione). Memoria nativa,
dispositivi fisici, OAuth reale e stampa misurata mantengono i limiti precedenti.

## Prossimo impedimento prioritario e accesso alla prova

Serve **un catalogo di registrazioni/preview con identificatori di versione e
autorizzazione esplicita all’analisi BPM automatica**, per il repertorio target.
Il candidato B2B MassiveMusic/7digital documenta un endpoint di preview; non
documenta in quella pagina una licenza sufficiente per il nostro uso. Prima di
implementarlo servono conferma di tale uso, accesso/catalogo e credenziali, limiti
territoriali, reporting e costi. Nessun accordo, richiesta commerciale o acquisto
è stato avviato. Un catalogo autorizzato di etichette è un’altra fonte concreta,
con la stessa esigenza di identificare la versione. Non basta un’API key generica.

Dopo questo prerequisito, si estende il resolver e si valida la precisione prima
di attivare assegnazioni numeriche automatiche. La presenza di un sottoinsieme open-license non
dimostra la copertura del catalogo commerciale desiderato.

`npm run dev` avvia l’app completa sul dispositivo dell’utente; aprire l’indirizzo
Local stampato e PROVA UNA RELEASE APERTA, oppure importare il CSV. La preview
gestita è stata verificata nella sessione, ma il suo loopback non è un URL pubblico
dal PC dell’utente. L’HTML scaricabile precedente non include questo backend e
non viene ripresentato come prova della nuova pipeline. Non è stato creato un
nuovo hosting per aggirare il divieto di deploy.

Evidenze sanitizzate: `docs/evidence/auto-discogs-2026-11-07.json`.
Log e audio del runner: `.private/checkpoints/auto-discogs/` (ignorati, non pubblicati).
