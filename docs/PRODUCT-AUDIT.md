# GROOVEPRINT — audit di prodotto, 7 novembre 2026

## Stato e obiettivo

Incarico letto integralmente da `GROOVEPRINT_PROMPT_AUDIT_E_PROVA_SITO(1).md`.
Base locale/remota iniziale `25bba4fa464065c5ec6afb628201b50fd64df925`, PR #3
aperta, draft e mergeable; CI #92 verde sulla base. Main iniziale
`28f9fd9ed699ec13c4ab4108ca2266159715e73c`. Working tree inizialmente pulita.
I risultati nuovi si riferiscono alle modifiche di questo audit; la CI #92 non
certifica il nuovo codice. SHA finale e CI corrispondente sono nella PR e nel
resoconto di consegna. Nessun merge, deploy, modifica segreti o operazione Railway.

Obiettivo: provare la web app completa senza account, correggere difetti
riproducibili e preparare un percorso di valutazione per il proprietario.

## Problemi riprodotti e interventi

| ID / priorità | Riproduzione e osservato → atteso | Causa e correzione | Verifica / rischio residuo |
|---|---|---|---|
| A01 P1 | Importare JSON con virgolette e attributi nell'ID di una release: l'ID poteva creare attributi HTML → deve restare un valore letterale | Interpolazione non escapata su riga/checkbox; usare escaping contestuale già presente | Regressione prima rossa e poi verde; import reale, assenza di onclick/data-forged, identificativo preservato e apertura corretta. Non è una certificazione generale di sicurezza |
| A02 P2 | In REVIEW un titolo non era raggiungibile come comando nativo da tastiera → Tab/Invio devono aprire la release | Titolo in contenitore solo cliccabile; pulsante nativo nel titolo, stile e click di riga preservati | Apertura tramite Enter nel browser e verifica del record effettivamente attivo |
| A03 P2 | Caricare demo e leggere REVIEW: promessa di ricerca automatica BPM con provider → spiegare l'audio locale | Testo generico rimasto dalla precedente architettura; corretto il messaggio | Ispezione UI reale e regressione browser. Nessuna modifica al detector o ai valori |
| A04 P2 | Demo con release priva di tracklist: preflight incrementava anche Layout overflow → distinguere dati assenti e problemi fisici | Tutti i warning del compositore erano conteggiati come overflow; escluso il warning della tracklist, come già nel blocco export | Due casi: sola tracklist mancante e vero elemento fuori area. Nessun cambiamento ai byte PDF |
| A05 P2 | A 390×844 la topnav spariva: Salva/Guida non erano raggiungibili direttamente da IMPORT/REVIEW/PRINT → mantenere azioni del progetto | Azioni compatte su layout stretto; la navigazione desktop resta quella esistente | Flusso browser su viewport mobile con download reale JSON e apertura/chiusura guida. DESIGN aveva già un pulsante backup |
| A06 P1 per la prova | Il servizio preview rifiutava l'avvio: mancava scripts.dev; npm start richiedeva una chiave → avvio locale isolato e verificabile | Aggiunto npm run dev, chiave casuale e SQLite in memoria; rifiuta modalità production e porte invalide | Server reale, asset/status/CSRF attivi, database sentinella intatto, nessuna chiave nei log; nessuna modifica alle impostazioni di produzione |
| A07 P3 | Titolo scheda 2.0, interfaccia 3.0 → versione coerente | Aggiornato il titolo HTML | Titolo osservato nel browser della preview |
| A08 P2 | Era disponibile una demo interna ma nessun CSV scaricabile per provare il mapping → esempio anonimo riproducibile | Campione con cinque release/12 tracce, endpoint fisso in allowlist, pulsante download e inclusione nel Dockerfile | Download e reimport reali, accenti/virgolette/copia legittima, nessun ID reale o BPM; path non in allowlist 404 |

Nessun P0 è stato riprodotto in questo perimetro. Non sono state attivate funzioni
commerciali, sostituzioni di provider, nuove politiche di conservazione o V2.

## Verifiche ed evidenze

- `npm run validate`: 63 test Node, syntax/config/privacy e smoke sintetico. La
  suite della base aveva 59 casi; quattro nuovi casi coprono output sicuro,
  preflight e launcher. I nuovi file entrano nel controllo Git prima del push.
- Firefox 144.0.2: suite completa desktop e 390×844 touch. Oltre alle regressioni
  esistenti, un contesto guest separato senza mock delle API scarica il campione,
  importa cinque release/12 tracce, apre da tastiera, modifica titolo e BPM,
  personalizza, scarica un PDF di due pagine, esporta/reimporta JSON e ricarica.
- Il contesto guest non usa una sessione Discogs reale; lo status non autenticato
  e gli asset provengono dal server di test. Le prove Discogs collegate precedenti
  usano mock dichiarati, compresi due cicli di scadenza e Stop.
- Attacco all'ID importato esercitato anche nel DOM reale; nessun attributo
  eseguibile creato, stringa e selezioni preservate. Zero chiamate BPM nel flusso
  guest, e zero chiamate ai domini rimossi nei flussi verificati.
- Sette preset PDF: byte identici fra generazione sincrona e progressiva, geometria,
  pagine incomplete, snapshot e cancellazione verificati. Nessuna promessa di
  font Unicode completi o misura su carta segue da questi controlli.
- Browser della preview: primo accesso, demo, CSV scaricabile, mapping/import,
  selezione da tastiera, editor, preflight e percorso stampa osservati nell'UI.
- Chromium e WebKit desktop/mobile: fare riferimento alla CI del commit finale,
  mantenendo l'aggregato richiesto `browser`. I limiti locali non vengono contati
  come pass. Il binario Firefox è stato reinstallato dopo la pulizia della cache.
- Il container non dispone del comando Docker: Dockerfile aggiornato per il
  nuovo asset, ma nessuna immagine è stata costruita o distribuita in questa prova.
- I file DSP/worker in `src/` sono invariati. Nessun nuovo benchmark musicale è
  stato necessario o presentato come validazione indipendente.

Report sanitizzato: `docs/evidence/product-audit-2026-11-07.json`.
Log intermedi privati: `.private/checkpoints/product-audit/`.
Guida utente: `docs/USER-TEST-GUIDE.md`.

## Preview e valutazioni separate

L'app completa è avviata tramite il servizio di preview gestito. L'indirizzo
interno restituito è `http://127.0.0.1:4173/`; l'accesso dell'utente avviene dal
browser della sessione, non da un link localhost sul suo PC. Nessun nuovo hosting
pubblico è stato creato. La preview può essere arrestata dalla manutenzione:
non è una pubblicazione persistente. `npm run dev` sul PC è l'alternativa verificata.
Usare dati fittizi nel browser remoto; i dati privati richiedono l'esecuzione sul
proprio dispositivo per restare su quel dispositivo.

| Area | Valutazione entro il perimetro verificato | Gate ancora aperto |
|---|---|---|
| CSV/editor/PDF | Candidato beta provabile sui flussi esercitati, con backup e campione riproducibile | Feedback dell'utente, stampa fisica, font non WinAnsi, telefoni reali |
| Discogs | Contratti server, protezioni e recupero da scadenza verificati con fixture/mock dichiarati | OAuth live con account consentito, condizioni di rete e limiti reali |
| BPM interno | Integrazione locale, candidati, conferma, Stop e protezione dei valori verificati | Accuratezza indipendente su registrazioni complete e holdout raggruppato; endurance nativa |

## Backlog dopo la prova

Ordine proposto in base agli attriti osservati. S/M/L sono dimensioni relative,
non preventivi. Le proposte restano da scegliere; non sono funzioni già implementate.

| Priorità / intervento | Evidenza e valore | Dipendenze / impegno / rischio | Criterio di accettazione e motivo |
|---|---|---|---|
| 1. Ingresso guidato CSV con opzioni progressive | Prima dell'import sono mostrati Discogs, recupero e audio; il compito principale compete con tre pannelli tecnici | Feedback sul percorso della guida; M; rischio di nascondere azioni avanzate | Primo import e primo PDF completabili senza account; mapping portato in vista; opzioni Discogs/audio sempre raggiungibili. Prossima implementazione raccomandata |
| 2. Stato di salvataggio esplicito | La scritta Saved locally non distingue debounce, completamento e backup JSON; esistono già protezioni quota da preservare | IndexedDB/quota e feedback; M; rischio di messaggi ottimistici | Mostrare in attesa/salvato/errore basandosi su scrittura completata, con backup sempre accessibile; verifica reload e quota |
| 3. Collaudo stampa fisica e preset del supporto scelto | PDF verificato in mm, ma preset generici e margini della stampante possono cambiare l'uscita | Carta/stampante reali; S software + prova fisica; rischio di precisione non dimostrata | Linea da 100 mm misurata, scostamento registrato e profilo di calibrazione provato prima di dichiarare compatibilità con un foglio commerciale |
| 4. Font incorporati per caratteri ulteriori | Limite Base-14/WinAnsi documentato; la stampa browser è un percorso alternativo da controllare | Font con licenza e renderer; L; rischio geometria/dimensioni PDF | Test multilingue con testo estratto, font incorporati, posizioni e dimensioni verificate senza regressioni sui preset |
| 5. Validazione musicale indipendente | Solo loop etichettati dal produttore e sintetici di sviluppo già esaminati | Audio completo autorizzato, riferimenti beat-grid, holdout; L; rischio di sovrastimare precisione | Protocollo attuale con copertura, errori metà/doppio tempo e fallimenti inclusi; nessuna promozione del challenger sulla sola prova d'integrazione |
| 6. Sessione Discogs live in ambiente autorizzato | Le prove collegate sono simulate; il locale guest funziona senza credenziali | Account/credenziali e ambiente approvati separatamente; M; rischio di effetti sui dati/limiti | Collegamento, scadenza, disconnessione e recupero verificati con account reale senza cambiare le regole di conservazione |
| 7. Lingua e gerarchia coerenti | Nell'UI convivono inglese e italiano, testi densi e controlli piccoli | Scelta lingua/utenza dopo feedback; M; rischio di regressioni dei nomi accessibili | Terminologia coerente nel percorso principale, contrasto/focus/touch verificati; nessuna dichiarazione di conformità completa senza audit dedicato |

La prima decisione utile è il riscontro sul percorso CSV/editor/PDF della guida.
Pagamenti, abbonamenti e account commerciali richiedono una specifica distinta.
