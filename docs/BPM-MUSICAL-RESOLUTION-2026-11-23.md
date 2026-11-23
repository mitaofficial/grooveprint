# Risoluzione musicale BPM — checkpoint del 23 novembre 2026

**Prodotto ancora parziale.** La preview di sviluppo ora analizza battiti
musicali con un modello MIR distribuito localmente; può scrivere una stima `~`
quando le sezioni superano i controlli. Non è una validazione 98% / 80% sulla
collezione techno/hardgroove. La disponibilità di audio commerciale analizzabile
e un corpus target indipendente rimangono problemi aperti. Nessun GetSong/GetBPM
è stato aggiunto come lookup o fallback.

Base ripresa: `68a4691c64cb787efa379dce71eba230596cba79`, albero pulito,
PR #3 draft, CI #257 riuscita. Main osservato:
`28f9fd9ed699ec13c4ab4108ca2266159715e73c`. Nessun merge, deploy, nuova
infrastruttura, credenziale o intervento Railway. Il protocollo precedente ai
confronti e le decisioni superate sono in `BPM-RESOLUTION-PROTOCOL-2026-11-23.md`.
SHA finale e CI corrispondente sono riportati nella PR, senza un commit ricorsivo
creato soltanto per inserire il proprio identificatore nel documento.

## Causa riprodotta e cambiamento del detector

V1 continua a essere conservato byte per byte. Correla un inviluppo RMS/onset
a circa 100 Hz e sceglie lag interi: su una pulsazione controllata a 138 BPM
il risultato può superare ±1 BPM anche con audio perfettamente regolare.
Somma inoltre contributi stereo che possono cancellarsi. I sei massimi vicini
del brano Josh Woodward non costituiscono una decisione sul tactus.

Riproduzione su MP3 originale CC BY 4.0 *Fight The Sea*, stessi 5.974.865 byte,
SHA-256 `2016f8a4c3306ddc12c3a1c2bb2a117b8bf2f35913ddbb10c578253aaa4a0c1d`:
primi 180 s, nessuna ripetizione. V1 produce ancora 100 BPM e candidati vicini;
V2 produce 66,7 a 12 kHz e circa 99,76 a 44,1 kHz. Questa dipendenza dal
preprocessing è registrata, non nascosta. Non esiste un riferimento musicale
indipendente per dichiarare corretto un valore di questo brano. Il percorso
JS/WASM finale propone circa 100,13 BPM usando 36 s disgiunti entro i primi
180 s; la sezione iniziale non supera il controllo di fase. È una stima, non
una nuova verifica umana del brano.

Prima alternativa: BeatRoot/music-tempo 1.0.3 (MIT), con flux spettrale,
induzione IOI e agenti che seguono eventi. Il ranking originale favoriva i
percorsi densi: 3/5 proposte corrette su 11 audio train. Un ranking per sostegno
degli onset e fase migliora, ma sul test GMD distinto produce 11/12 proposte
corrette, un errore metrico accettato e copertura corretta 11/27. **Non promosso.**
Codice e fallimenti rimangono riproducibili come ricerca; soltanto FFT viene
riusato nel frontend del modello successivo.

La preview usa ora **Beat This! small0**, Foscarin, Schlüter e Widmer (ISMIR 2024),
codice e pesi pubblicati MIT. Non è Essentia, che non era installata. Modello
float32 esportato ONNX, 2.099.960 parametri, checksum verificato nel worker.
ONNX Runtime Web 1.23.2 è fissato nel lockfile. Nessun servizio d'inferenza
esterno e nessun invio di audio/PCM.

Frontend: 22.050 Hz, log-mel conforme al riferimento, canali mediati salvo
cancellazione severa rilevata; resampler sinc per sample rate diversi. Parità
log-mel sullo stesso PCM: errore massimo 4,995e-5, medio 1,765e-6. Esportazione
ONNX vs PyTorch a 444/760/1500 frame: massimo scarto dei logits <=4,77e-6.
Il test WebAssembly verifica anche valori golden PyTorch, non prodotti da sé.
Sono verifiche numeriche del port, non percentuali di precisione musicale.

## Decisione, perimetro e risorse

Il modello rileva beat/downbeat; il BPM deriva da un fit dei timestamp, senza
leggere titolo, genere, nome file o BPM di catalogo. Non viene moltiplicato per
avvicinarsi a 136–140. Non si interpreta un logit come probabilità calibrata.

Per una stima: almeno 24 s disponibili, almeno due sezioni coerenti, >=12 beat
osservati per sezione, >=85% dei beat attesi presenti, span >=65%, errore di
fase p90 <=70 ms e spread dei fit <=1 BPM. Una sezione debole sufficientemente
popolata con fit distante >3 BPM impedisce il voto a maggioranza. Cambi 2:1,
3:2 e 3:1 restano separati; nessun BPM principale in caso di conflitto.

Si verificano due finestre disgiunte di 12 s agli estremi e una centrale
per audio >=72 s, con contesto del modello <=768 frame (15,36 s). Le finestre
effettive sono conservate: **36 s distribuiti nei primi 180 s non significano
180 s di beatgrid verificata**. Cambiamenti nelle parti non controllate possono
sfuggire. Audio <24 s non ottiene una stima scalare automatica.

Un decoder/context e un worker proprietario rimangono nella coda esistente.
Il modello non crea un secondo decoder. Stop termina il worker, conserva il lock
durante un decode nativo non annullabile e le guardie scartano scritture tardive.
Il modello usa un solo thread; la configurazione 1500 frame è stata scartata per
memoria eccessiva. Nei pilot Node/WASM il processo ha osservato circa 0,5–0,7 GiB
RSS; non è memoria totale certificata dei browser o un limite garantito. Il
controllo 128 MiB continua a riguardare soltanto il PCM decodificato. Limite del
worker 60 s, nessuno SLA dedotto dai tempi di prova.

## Evidenze musicali e loro qualificazione

| Prova | Risultato | Che cosa permette di concludere |
|---|---|---|
| GMD: batteristi con metronomo e MIDI di acquisizione, CC BY 4.0; train/validation, 22 audio | JS/WASM prima del veto metrico finale: 21 proposte, 21 entro ±1, 1 review | Riferimento indipendente dall'inferenza, ma **GMD era nel training di small0**. Diagnostica di port, non holdout del modello. |
| GMD test: 30 identità selezionate prima, 3 prive di audio, 27 valutabili | BeatRoot: 19/27 top-1; 11/12 proposte corrette, un errore metrico | Fallimento conservato; non si promuove BeatRoot. small0 non è dichiarato validato su questo insieme. |
| ARTBeaT: 25 brevi esempi complessi, CC BY 4.0, timestamp beat forniti dall'autore | 592 match /819 beat stimati /844 riferimenti nel perimetro; F1 micro 0,712, medio 0,714; 0 stime scalari, 25 review | Matching uno-a-uno ±70 ms, nessuno shift o perdono degli ottavi. Non sono 25 brani target. Precisione delle assegnazioni scalari non definita. |
| BabySlakh: 20 mix di strumenti virtuali, CC BY 4.0, 14 clock MIDI costanti entro il perimetro | 10 proposte, 9 entro ±1 dal clock; 4 review scalari. Sui 6 clock variabili: 5 review e 1 proposta | **Non raggiunge 98% /80%.** Il clock MIDI archiviato non è una verifica umana del tactus; Track00009 ha clock 120 e proposta 76,62. Si conserva il disaccordo, senza scartarlo per migliorare il numero. |

Per BabySlakh, precisione rispetto al clock 9/10, Wilson 95% circa
[59,6%;98,2%]; copertura corretta 9/14. Non si presenta come precisione musicale
certificata. Gli split GMD condividono batteristi/sessioni; ARTBeaT un autore e
famiglie correlate. Nessuna moltiplicazione delle finestre per gonfiare il numero
di registrazioni. I 31 vecchi loop ripetuti e i sintetici restano sviluppo.

Le assegnazioni della preview sono quindi **stime sperimentali**, non il
raggiungimento dei criteri di prodotto. Per rivendicare questi ultimi mancano
almeno 100 registrazioni target realmente distinte in holdout, riferimenti
musicali indipendenti appropriati e incertezza compatibile con la pretesa.

## Correzione dopo lo studio elettronico

mshoxxDB v1.1, Michael Taenzer: 18 composizioni elettroniche, clock MIDI
esportati dalla DAW, CC BY-NC-SA 4.0, **solo studio privato non commerciale**,
nessun audio nel prodotto o nei commit. Sui 12 clock scalari, il modello da solo
propone 4 stime, 3 corrette e un mezzo tempo errato (190 ->94,88). Il corpus
diventa sviluppo dopo la diagnosi, non un holdout riuscito. Aggiunto un veto
negativo con V2 immutato sugli stessi segmenti: un livello metrico alternativo
stabile in almeno due sezioni porta alla revisione, senza assegnare la media
o trattare il consenso come validazione. Nell'ablation, le tre proposte corrette
rimangono; l'errore viene bloccato per conflitto 3:2 con V2 a 63,31 BPM.
Precisione osservata 3/3, Wilson molto ampio; copertura corretta **3/12 =25%**.
Gli obiettivi di prodotto restano lontani. Questo gate riduce anche la copertura
di BabySlakh, non corregge il clock incerto Track00009 e non dimostra un
riconoscimento generale di tutti i cambi di tempo.

## Flusso, conservazione e limiti di catalogo

Importazione/recupero Discogs attivano il motore musicale automaticamente nella
preview. Il selettore diagnostico non cambia il motore dei job importati; cache
distinte per motore impediscono riusi del vecchio confronto. `estimated` riempie
il campo e le etichette con `~`; `verified` richiede la conferma dell'utente.
Le astensioni mostrano tempo ambiguo/non determinabile e al massimo due ipotesi
di sezione, senza sei picchi trasformati in pulsanti. Il confronto storico resta
esplicito. Production e HTML standalone mantengono i percorsi precedenti.

Manual/verified/clear, revisioni, identità/versione, cambio progetto, scadenza,
deduplica e Stop rimangono protetti. Corretto anche il salvataggio dell'evidenza
locale: dopo scadenza/reimportazione, una stima mantiene algoritmo, finestre,
decisione e provenienza audio sanitizzata, separati dai metadati Discogs eliminati
dal backup. Nessun byte audio, PCM o token viene serializzato o committato.

La fonte automatica rimane il sottoinsieme FMA/IA con dichiarazioni CC0/CC BY,
identità/versione/durata esatte secondo i controlli implementati. Non è stato
ottenuto un catalogo commerciale techno con diritti di analisi. Modello migliore
e disponibilità delle fonti sono due denominatori diversi. I limiti di trasporto
e di attendibilità delle dichiarazioni dell'uploader restano quelli documentati;
nessuna nuova pretesa di DNS pinning o certificazione del master.

## Verifica e prova dal PC del proprietario

153 test locali passati, incluse nuove regressioni di fase/sample rate,
opposizione stereo, cambi di tempo e conservazione. Firefox desktop e viewport
mobile passano il flusso completo con API simulate e MP3 realmente decodificato,
PDF/JSON, confronto storico e HTML offline. Queste prove non sono live di catalogo.
La prova live Firefox nell'ambiente ha risolto 14 tracce ma i download audio hanno
avuto errori di rete; non viene presentata come successo del detector. La CI
finale aggiunge una prova automatica reale con Chromium oltre al confronto live
precedente. Il suo esito va letto sullo stesso HEAD della PR.

Nel clone Windows esistente, arrestare il server, controllare `git status --short`
e usare `git pull --ff-only` senza reset. `npm ci` è necessario una volta per la
nuova dipendenza del motore; poi `npm run dev`. Aprire
http://127.0.0.1:4173/ e Ctrl+F5; importare il CSV/recuperare la tracklist oppure
premere **PROVA UNA RELEASE APERTA** una volta. Non occorre aggiungere audio per
ogni traccia. La demo fuori genere verifica la catena, non la copertura target.
Non esiste una nuova preview pubblica: non è stato aggirato il divieto di deploy.

Priorità successiva: fonti autorizzate del repertorio target con identificatori
di versione e riferimenti musicali indipendenti. Un adapter commerciale richiede
esplicitamente diritto di analisi, accesso ai byte, credenziali e condizioni di
conservazione/territorio/reporting; non basta una preview ascoltabile. Nessun
accordo, servizio o contatto esterno è stato attivato.

## Blocco CI #258 e correzione del provisioning

Sul commit `7719e72ac8b88b66d5477ed84320031e2cac4d1f`, Node e la prova
live Chromium sono riusciti (14/14, 2 stime, 11 review, 1 fonte assente, 0 errori,
zero chooser audio, risorse finali a zero). I browser Chromium/WebKit hanno
completato desktop/mobile. Il job Firefox è invece stato cancellato per timeout
prima dei test, installando FFmpeg tramite apt: il log mostra un download del
pacchetto opzionale `pocketsphinx-en-us` da 27,4 MB e dipendenze GPU raccomandate.

Il follow-up cambia soltanto il provisioning FFmpeg: stessi pacchetti obbligatori
Ubuntu, `--no-install-recommends` e timeout/retry delle acquisizioni apt. Non
rimuove FFmpeg, codec, test o il job obbligatorio del pilot. Restano Ubuntu 24.04,
Playwright 1.57 e il live senza preparazione FFmpeg superflua. I risultati
musicali non cambiano. La CI finale deve corrispondere all'HEAD del follow-up;
il tentativo #258 cancellato non viene presentato come un pass completo.

L'ambiente locale si è disconnesso dopo il salvataggio Git del lavoro. Il codice,
i protocolli e le evidenze sanitizzate erano già conservati nel repository;
il follow-up viene verificato nella CI sullo stesso contenuto applicativo.
