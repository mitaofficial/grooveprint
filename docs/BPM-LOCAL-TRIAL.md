# Prova BPM sul tuo PC

Scarica dalla chat **GROOVEPRINT_BPM_LOCALE.zip**, estrai tutti i file e apri
**GROOVEPRINT_BPM_LOCALE.html** con il browser del tuo PC. Usa il file scaricato,
non l'anteprima del documento nella chat. Non serve installare Node o aprire il
browser remoto di ChatGPT. Il pacchetto non contiene audio di terzi.

1. Clicca ADD MANUALLY e inserisci artista e titolo della tua release.
2. Aggiungi una traccia con ADD TRACK e inserisci posizione e titolo esatti.
3. Premi FILE accanto alla traccia e scegli una registrazione autorizzata sul PC.
   Il nome deve comparire nella scheda. Dopo cambi di versione/ordine potrebbe
   essere necessario ricollegarlo. Collegare il file non significa averlo analizzato.
4. Il selettore Motore BPM locale parte da **V1 originale**. Per confrontare il
   lavoro nuovo scegli **V1 / V2 sperimentale · scelta manuale**.
5. Premi **ANALIZZA AUDIO — MOTORE INTERNO** e verifica l'associazione proposta.
   Un'eventuale rianalisi di BPM già presenti richiede consenso esplicito. Puoi
   interrompere dal pannello audio; la decodifica già avviata deve prima terminare.
6. Nel confronto leggi i due risultati, i motivi e i candidati con algoritmo.
   Un valore già presente resta invariato. Assenza di risultato o metà/doppio
   tempo non devono diventare un BPM inventato.
7. Usa il player ▶ per ascoltare, il Tap BPM già disponibile o una DAW per
   controllare il tempo. Scegli il candidato dopo il controllo. Le due versioni
   sono sperimentali: i punteggi relativi non sono percentuali di affidabilità.
8. **USA QUESTO BPM** inserisce una stima. **CONFERMA BPM / CONFIRM** consente la
   conferma o la correzione esplicita: controlla soprattutto metà/doppio tempo.
9. Salva il progetto JSON e prova a reimportarlo. Algoritmo dell'ultima analisi e
   valore scelto devono restare. I file audio non entrano nel JSON: si ricollegano.
10. In DESIGN/PRINT prepara l'etichetta e scarica il PDF. Per gli altri file usa
    CONNECT AUDIO LIBRARY: il matching per cartella richiede artista/versione
    senza ambiguità e non sovrascrive i valori manuali.

Per una prova senza Internet, usa dati manuali o il CSV fittizio e disattiva il
recupero Discogs. Il percorso locale audio → confronto → JSON/PDF è stato provato
senza richieste HTTP. OAuth e risorse remote richiedono la versione web/configurazione
appropriata. Non estrarre audio da YouTube o servizi di streaming.

Se hai Node >=22.13 e il repository sul PC, l'alternativa resta `npm run dev` e
l'indirizzo Local stampato nel terminale. Per ricreare il file usa
`npm run preview:local`; il file prodotto è in `.private/local-preview/`.

Per un riscontro indica browser/dispositivo, algoritmo selezionato, durata,
risultato, candidati e BPM di riferimento con il metodo usato per verificarlo.
Non serve caricare la tua registrazione nella chat. Suoni generati e nomi dei
file non certificano l'accuratezza musicale del detector.
