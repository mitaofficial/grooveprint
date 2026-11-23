# GROOVEPRINT — prova pratica della beta

Versione di sviluppo nella PR #3, ramo `feature/bpm-intelligence-3-open-data`.
La versione pubblica su Railway rimane invariata. La prova non richiede un account.

## Come aprirla

La preview di questa sessione usa l'app completa, avviata con `npm run dev`, nel
browser remoto. Aprila dal collegamento/controllo browser fornito nella chat.
`http://127.0.0.1:4173/` è il suo indirizzo interno: non è un link pubblico
raggiungibile dal tuo computer. La disponibilità dipende dalla sessione; nessuna
durata permanente è garantita. La manutenzione può arrestare la preview.

Per questa prima prova remota usa i dati fittizi preparati o il CSV di esempio.
Per elaborare una collezione privata o audio personale, esegui l'app sul tuo PC:
un browser remoto non equivale al browser locale del tuo dispositivo.

Con Git e Node.js **22.13 o successivo**, in una nuova cartella:

```sh
git clone --branch feature/bpm-intelligence-3-open-data https://github.com/mitaofficial/grooveprint.git
cd grooveprint
npm run dev
```

Apri l'indirizzo Local stampato nel terminale, normalmente
`http://127.0.0.1:4173/`. Non servono dipendenze npm per il funzionamento dell'app.
Non impostare NODE_ENV=production per questa prova. Il launcher genera una chiave
temporanea in memoria e usa SQLite in memoria; non apre un database configurato.
I progetti sono salvati nel browser e possono essere esportati in JSON. Alla
chiusura del server le sessioni backend vengono perse; Ctrl+C arresta il server.
Discogs OAuth resta disabilitato se non sono configurate credenziali appropriate.

## Dieci passi per valutarla

1. **IMPORT → TRY WITH DEMO DATA / LOAD FICTIONAL DEMO.** Se la preview ha già la
   demo, passa a REVIEW. Sono tre release inventate: due complete e una senza
   tracklist. Anche i BPM della demo sono inventati, non sono risultati del motore.
2. **REVIEW.** Cerca `Analog`, controlla il filtro formato e poi svuota la ricerca.
   Il testo deve restare nel campo e la release cercata deve essere raggiungibile.
3. **Apri Analog District.** Clicca il titolo oppure raggiungi il suo pulsante con
   Tab e premi Invio. Cambia il titolo in `Floor Studies - prova`, poi sposta il
   focus fuori dal campo per applicare la modifica.
4. **Modifica un BPM.** Inserisci `141` sulla traccia A1 e lascia il campo. Il valore
   deve essere indicato come manuale; cancellandolo deve restare vuoto, senza
   ricerche automatiche. Puoi reinserirlo per continuare.
5. **Scegli cosa stampare.** Deseleziona Drift Mechanics, la release senza brani.
   Le due release complete devono restare selezionate. La release incompleta non
   viene cancellata; serve a provare le segnalazioni.
6. **DESIGN.** Scegli MINIMAL oppure un altro preset, cambia font e rotazione.
   Controlla che titolo, catalogo, posizioni A1/B1 e BPM siano leggibili. I comandi
   UNDO/REDO e RESTORE ORIGINAL DJ LAYOUT permettono di recuperare un tentativo.
7. **PRINT.** Scegli un preset del foglio, ad esempio A4 · 4. Controlla misure,
   numero di etichette e avvisi. Una tracklist assente deve essere segnalata come
   tale, non come contenuto fisicamente fuori area.
8. **DOWNLOAD PRINT PDF.** Apri il file e controlla testo, ordine e pagine. Con due
   release su un foglio da quattro etichette è prevista una pagina incompleta.
   Stampa di prova: scala 100%, nessun adattamento; misura la linea di calibrazione
   da 100 mm. La verifica digitale non certifica la tua stampante.
9. **SAVE PROJECT.** Scarica il JSON. Il comando è disponibile anche su schermo
   stretto, senza passare a DESIGN. Ricarica la pagina; poi prova anche IMPORT
   SAVED PROJECT con il JSON. Titolo modificato, BPM e selezioni devono ritornare.
10. **BPM interno, facoltativo e sul tuo PC.** Con audio autorizzato, scegli CONNECT
    AUDIO LIBRARY. Usa nomi che identifichino artista e versione esatti. Controlla
    esclusioni, Stop e candidati; una scelta resta una stima fino alla conferma.
    Senza audio i BPM mancanti restano vuoti. L'accuratezza su brani completi non
    è ancora certificata; non usare i BPM fittizi della demo come riferimento.

## Ripetere anche l'import CSV

In IMPORT premi **DOWNLOAD EXAMPLE CSV**, poi **CHOOSE A FILE** e scegli il file
scaricato. Il campione ha cinque release fittizie e 12 tracce: una seconda copia
legittima, accenti, virgole e virgolette. Non contiene Release ID reali né BPM.
Verifica il mapping; deseleziona RECUPERA LE TRACKLIST DA DISCOGS per una prova
interamente autonoma. Dopo l'importazione sono attese cinque release, 12 tracce,
una copia segnalata e BPM vuoti. Con tutte selezionate e A4 · 4, il PDF ha due pagine.

## Come mandare un riscontro utile

Indica: passo della guida, dispositivo/browser, comando premuto, risultato atteso
e osservato. Aggiungi il formato del foglio o il codice DEMO della release quando
pertinente. Non inviare token, audio protetto o collezioni private per descrivere
un difetto riproducibile con il campione. Distingui un problema del sito da una
preferenza: per esempio «il titolo viene tagliato» oppure «vorrei il titolo più grande».

Limiti correnti: OAuth live non provato con un account reale; viewport mobile
emulata, non telefono fisico; PDF Base-14/WinAnsi senza font incorporati; stampa
fisica e validazione musicale indipendente ancora da completare. La preview Pro
è una dimostrazione del layout e non abilita acquisti o export senza branding.
