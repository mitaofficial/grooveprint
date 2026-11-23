# Protocollo di risoluzione BPM — 23 novembre 2026

Registrato prima di eseguire i nuovi confronti. Base: PR #3,
`68a4691c64cb787efa379dce71eba230596cba79`; main osservato
`28f9fd9ed699ec13c4ab4108ca2266159715e73c`. Working tree iniziale pulito,
CI #257 riuscita. Nessun merge o deploy autorizzato.

## Conflitti effettivi e decisioni

| Indicazione precedente | Mandato attuale / decisione |
|---|---|
| V1 obbligatorio come default; confronto soltanto manuale | Superata. Conservare V1 immutato come controllo; valutare un candidato di beat tracking prima di cambiare il percorso development. |
| Tutte le analisi automatiche devono rimanere review | Stato provvisorio da superare con evidenze. Non trasformare un punteggio in probabilità o chiamare validato un pilot. |
| Essentia progettata | Non installata. Esaminare dipendenza, licenza e parametri effettivi; non attribuire al prodotto un motore assente. |
| CI verde / candidati leggibili | Prove di integrazione, non di accuratezza. Nessun conflitto Git osservato. |
| V4 più recente | Esperimento negativo conservato; non promosso. |
| Preview richiesta | Riutilizzare backend locale; nessun nuovo hosting, main e Railway invariati. |

## Controlli congelati

- V1 `src/bpm-tempo.mjs`, SHA-256
  `63e756e1fc3868ba8e239d80d8613d34f3e9358914d62c5c2c853ef9158d3bc4`.
- V2 `src/bpm-tempo-experiment.mjs`, SHA-256
  `0dad1f5d80286818b9da3bd7cb5a45988f519542c7fa9cd26092e661024df8fc`.
- Josh Woodward, *Fight The Sea*: stesso MP3 originale CC BY 4.0 già acquisito,
  SHA-256 `2016f8a4c3306ddc12c3a1c2bb2a117b8bf2f35913ddbb10c578253aaa4a0c1d`.
  Analizzare i primi 180 secondi, senza ripetizioni. È una riproduzione senza
  riferimento indipendente: nessun BPM verrà dichiarato corretto su questo caso.
- I 168 sintetici e i 31 loop WaivOps già visti sono sviluppo/regressione,
  mai holdout. Nessun loop ripetuto nel nuovo confronto musicale.

## Candidato e misure prima dei risultati

Esaminare `music-tempo` 1.0.3 (BeatRoot, MIT), con novelty spettrale, induzione
dagli intervalli degli onset e agenti che seguono battiti. Verificare nel codice
sample rate, hop, limiti di agenti e memoria; conservare attribuzione e licenza
se distribuito. Preprocessing identico per tutti i comparatori ove compatibile;
documentare separatamente ogni differenza inevitabile. Nessun prior di genere,
nessuna moltiplicazione per avvicinarsi a 136–140 BPM.

La decisione dovrà richiedere una sequenza di beat effettivamente sostenuta,
durata sufficiente, stabilità fra finestre distinte e assenza di conflitti
metrici non risolti (2:1, 3:2, 3:1). Riferire il punteggio come misura di segnale,
non probabilità. Fermare / scartare risultato e risorse con le guardie esistenti.

## Corpus e separazione

1. Sviluppo: errore controllato di risoluzione temporale; registrazione Josh;
   materiale WaivOps già visto, nella sua durata originale.
2. Pilot indipendente: cercare audio con diritti verificati e riferimento
   acquisito indipendentemente dal detector. Candidato GMD di Google (CC BY 4.0):
   esecuzioni umane su batteria elettronica, registrate con metronomo indipendente
   e tempo MIDI di acquisizione. Non è un corpus di mix techno/hardgroove.
   Se accessibile, selezionare solo `beat`, 4/4, durata almeno 30 s, senza
   esaminare risultati: fino a 12 train per sviluppo, 12 validation per
   calibrazione e 30 test per un controllo finale. Selezione deterministica
   ordinata per SHA-256 dell'identità. Non condividere famiglie di groove
   `eval-session/groove1-10` fra le partizioni. Riferire correlazioni per
   batterista/sessione; il numero di finestre non aumenta il numero di brani.
3. ARTBeaT (CC BY 4.0), se acquisibile: esempi con cambi di tempo, inganni ritmici
   e poliritmia per valutare l'astensione; brevi esempi costruiti, separati dai
   brani e dalle esecuzioni umane. Non inventare annotazioni umane assenti.
4. Restano necessari almeno 100 registrazioni target distinte in holdout con
   riferimenti indipendenti e intervalli adeguati per una validazione del
   prodotto. Un pilot può giustificare il prototipo, non la promessa 98% / 80%.

Per ogni registrazione e medesima finestra: top-1 entro ±1 BPM; errore assoluto;
rapporti metà/doppio, 3:2 e 3:1 separati; assegnazioni, astensioni, precisione
(non definita con zero assegnazioni), copertura corretta sull'intero insieme,
disponibilità / decode, tempo e memoria osservati. Beatgrid: matching uno a uno,
tolleranza 70 ms, precisione/recall/F1; niente perdono degli errori metrici.
Intervalli binomiali Wilson 95% descrittivi, senza fingere indipendenza di
sessioni o artisti. Dati sfruttati per correggere il candidato diventano sviluppo.

Fonte e detector rimangono filoni separati: non si può promettere copertura del
catalogo commerciale sulla base dei dataset. Nessun audio/PCM nei commit.

## Revisione dopo il solo sviluppo train

La prima integrazione BeatRoot, ordinata per somma dei punteggi degli agenti,
ha fallito: su 11 esecuzioni train con audio, 5 proposte utilizzabili ma solo
3 corrette; due doppi tempi accettati. Non viene promossa. I file diagnostici
e il sorgente di questa variante sono conservati nei checkpoint privati.

Diagnosi: la somma premia percorsi più densi anche quando interpretano le
suddivisioni deboli come battiti. Il confronto successivo, ancora su train,
ordina i percorsi con un F-score di sostegno degli onset: massa saliente
effettivamente seguita, numero di battiti attesi e massa totale degli onset.
La salienza viene limitata rispetto al 90° percentile locale; beat interpolati
non contano come onset osservati. Nessuna preferenza per un BPM assoluto.
Restano i controlli di fase, copertura e conflitto. Validation e test non sono
stati valutati durante questa revisione.

## Alternativa indipendente di beat tracking appresa

BeatRoot con ranking corretto migliora il top-1 train da 4/11 V1 e 6/11 V2 a
8/11; propone 2 stime corrette su 11. Validation, senza ulteriori regolazioni:
8/11 top-1 e 2/11 proposte corrette. È troppo poco per risolvere il prodotto.
Nessuna rivendicazione 98% o copertura utile su questa base.

Prima di aprire il test: confrontare Beat This! `small0`, codice e pesi MIT,
checkpoint SHA-256 `6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b`.
La libreria apprende beat/downbeat da uno spettrogramma log-mel; non legge i BPM
del corpus. Il modello non diventa riferimento: gli stessi MIDI di acquisizione
e gli stessi timestamp ARTBeaT rimangono i riferimenti indipendenti.

Regola scalare iniziale, prima del confronto: almeno 24 s di audio; due finestre
distinte di 12–24 s (tre sopra 72 s); almeno 12 beat osservati, almeno 85% dei
beat attesi presenti, span almeno 65%, errore di fase p90 <=70 ms; spread dei BPM
fittati <=1. Un fit usa indici temporali con i soli salti interi osservati,
senza correggere il livello metrico verso un genere. Astensione su disaccordo.
Riferire anche F1 uno-a-uno dei beat ARTBeaT, senza correggere la fase a posteriori.
L'esportazione ONNX e il preprocessing browser richiedono un confronto numerico
con l'implementazione PyTorch prima di qualsiasi integrazione.

## Congelamento prima del test GMD

La versione PyTorch su 180 s ha proposto 22/22 valori corretti nei soli split
train/validation disponibili. Per non assumere la parità del port, il confronto
finale usa **il codice JavaScript/WebAssembly del prodotto**, PCM comune a tutti
i comparatori a 22.050 Hz mono, senza ripetizioni. I risultati precedenti a
12 kHz restano separati e non sono riscritti.

Il prototipo ONNX con contesto 1500 frame ha osservato circa 907 MiB di RSS Node:
scartato come configurazione della preview. Contesto ridotto a 768 frame
(<=15,36 s), evidenza scalare da finestre disgiunte di 12 s: due agli estremi,
più una centrale per audio >=72 s. Gli stessi criteri di fase/beat restano;
una finestra debole con almeno 12 beat e fit distante >3 BPM dalle sezioni
coerenti impedisce l'assegnazione. Non si ignorano così grandi cambiamenti
osservati soltanto perché due altre sezioni concordano.

Con questa implementazione reale: train 10 assegnazioni corrette /11 audio,
1 review; validation 11/11 assegnazioni corrette. Zero errori metrici accettati
in questi due piccoli insiemi. Nessuna soglia modificata dopo validation.
Prima del test si registrano hash dei moduli d'inferenza/policy e modello nei
checkpoint. Il test contiene 30 identità selezionate a priori, di cui 3 senza
audio nel dataset: 27 valutabili. Non sostituire le assenze con altri brani.
L'eventuale riuscita non certificherà 98% su techno/hardgroove: dominio e numero
sono insufficienti, e batteristi/sessioni rimangono correlati.

### Correzione della qualificazione GMD, prima del test neurale

La lettura integrale della sezione 4.1 del paper Beat This! ha mostrato che
Groove MIDI (>20 s) è incluso nell'addestramento del modello pubblicato.
**I riferimenti MIDI sono indipendenti dal detector, ma il corpus non è un
holdout indipendente di small0.** Le precedenti 21/22 proposte JS corrette
(train10/11, validation11/11) rimangono diagnostica di port/regressione su un
dominio noto. Nessuna validazione o generalizzazione viene dedotta da esse.
Non è stato ancora eseguito small0 sui 27 audio della selezione test.

Il test GMD del candidato BeatRoot, che non ha pesi preaddestrati, resta distinto.
Per small0 usare invece il corpus ARTBeaT 2024 non elencato nel training e un
pilot BabySlakh con mix polifonici e tempo MIDI indipendente; dataset non elencato
nel training documentato, ma senza poter escludere composizioni sovrapposte
ad altri dataset. Entrambi sono diagnostica esterna, non 100 brani target.
Nessuna soglia si sceglie sui loro risultati. Classificare prima le famiglie,
le copie MIDI e i tempi variabili; non omettere gli errori.

Prima di queste prove, correggere il solo perimetro delle finestre brevi:
16–24 s usa due finestre di 8–12 s; sotto 16 s una finestra di massimo 12 s,
sempre review perché sotto il minimo scalare di 24 s. Nessun intervallo può
essere dichiarato analizzato se il contesto del modello non lo copre.

## Studio elettronico e veto metrico finale

mshoxxDB v1.1: 18 composizioni elettroniche originali, clock MIDI esportati
dalla DAW, un compositore, licenza CC BY-NC-SA 4.0. Uso limitato allo studio MIR
privato non commerciale, mai catalogo automatico del prodotto o audio distribuito.
12 clock scalari e 6 variabili nei primi <=180 s. small0 da solo propone 4/12
scalari, 3 corretti e **un mezzo tempo errato**; 1/6 variabili riceve una proposta.
Questo fallimento è conservato. Il corpus diventa sviluppo dopo questa diagnosi.

Il criterio finale aggiunge soltanto un veto: V2 immutato sugli stessi segmenti
forti del modello. Se almeno due segmenti V2 indicano coerentemente entro 1 BPM
un livello alternativo in relazione 2:1, 3:2 o 3:1 (tolleranza relativa 2,5%),
il risultato è ambiguo. Il consenso non dà punti, non sostituisce i riferimenti
e non alza la confidenza. Stesso decoder/worker e stessi byte, nessuna API BPM.
L'ablation riusa le predizioni neurali congelate: conserva le tre proposte
scalari corrette e blocca l'errore 190 ->94,88 grazie a una pulsazione V2 63,31
stabile (relazione 3:2 con la proposta). **3/3 non certifica 98%**; copertura
corretta 3/12 =25%, molto inferiore all'80% richiesto. Il limite rimane esplicito.
BabySlakh resta sviluppo con riferimenti di tactus insufficienti; il veto
elimina anche una proposta corretta e non risolve il disaccordo Track00009.
Non si rivendica un holdout musicale riuscito su questi campioni riutilizzati.
