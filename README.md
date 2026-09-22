<div align="center">

# DaProdFinanza

**Controllo di gestione per chi segue più aziende insieme.**

Un gestionale desktop per consulenti finanziari aziendali: riclassifica il bilancio,
calcola gli indici che contano, previene le tensioni di cassa prima che arrivino,
e risponde a "cosa succede se" senza toccare un foglio Excel.

![stato](https://img.shields.io/badge/versione-1.3.1-3ddbff)
![piattaforma](https://img.shields.io/badge/Windows-x64-3ddbff)
![demo mac](https://img.shields.io/badge/demo-macOS-3ddbff)
![demo android](https://img.shields.io/badge/demo-Android-3ddbff)
[![release](https://img.shields.io/github/v/release/cammo22/DaProdFinanza?label=scarica&color=5cff9d)](https://github.com/cammo22/DaProdFinanza/releases/latest)
[![licenza](https://img.shields.io/badge/licenza-MIT-5cff9d)](LICENSE)

</div>

---

## Il metodo di calcolo

Il motore di DaProdFinanza non è teoria da manuale: è l'estrazione di uno strumento
Excel che un consulente finanziario usa già oggi con i propri clienti. Vale la pena
conoscerlo, perché spiega come mai i numeri escono da soli.

### 1. Ogni conto viene classificato una volta sola

Il piano dei conti di un'azienda è un elenco lungo e grezzo: *Vendite Italia*,
*Stipendi*, *Fondo ammortamento impianti*, *Fornitori materie prime*. Preso così non
racconta niente.

Il metodo assegna ogni conto a una **sezione** — ventiquattro in tutto, dai Ricavi
Operativi ai Debiti a Breve Termine. Da quella singola scelta discende tutto il resto:
dove il conto finisce nel bilancio riclassificato, se pesa sul margine o sulla
struttura, se entra nel calcolo dell'EBITDA o solo in quello dell'utile finale.

Classificare un conto è l'unico lavoro manuale. Tutto quello che segue è conseguenza.

### 2. I costi si dividono fra variabili e fissi, azienda per azienda

Un costo variabile cresce insieme alle vendite; uno fisso c'è comunque. La differenza
è tutto: decide il margine di contribuzione e il punto di pareggio.

Ogni sezione di costo parte con una percentuale suggerita — le materie prime sono
dirette al 100%, il personale al 70%, l'affitto allo 0% — ma **la percentuale si
cambia azienda per azienda**. Un tornitore e una pizzeria hanno strutture di costo
diverse, e il programma non finge il contrario.

### 3. Il bilancio si riclassifica in tre modi, che devono dare lo stesso utile

Riclassificare significa riordinare i conti grezzi in un prospetto che mostra dove
nascono i margini e dove si perdono. La dottrina italiana ne prevede tre modi:

- **a margine di contribuzione** — quanto resta dopo i costi che seguono le vendite
- **a valore aggiunto** — quanta ricchezza l'azienda crea prima di pagare le persone
- **a costo del venduto** — quanto costa davvero ciò che è stato venduto

Sono **tre letture dello stesso risultato**: cambiano i passaggi intermedi, l'utile
finale no. Il programma li calcola tutti e tre e li mostra affiancati — se non
coincidessero, ci sarebbe un errore da qualche parte, ed è esattamente così che il
motore viene collaudato.

### 4. Lo stato patrimoniale dice con quali soldi

Da una parte cosa possiede l'azienda: immobilizzazioni, magazzino, crediti, cassa.
Dall'altra con quali soldi lo ha pagato: capitale proprio, debiti a lungo termine,
debiti a breve. I due lati devono quadrare, e se non quadrano il programma lo dice
invece di far finta di niente.

### 5. Gli indici, con le soglie di chi li usa davvero

Dal bilancio riclassificato nascono gli indici: **ROE**, **ROI**, **ROS**, **MOL%**
per la redditività; indipendenza finanziaria e margini di struttura per la solidità;
indici di disponibilità e liquidità per la capacità di far fronte agli impegni.

Accanto a ognuno c'è la soglia che il consulente applica nel proprio foglio — *"ROS
positivo dal 10% in su"*, *"indipendenza finanziaria sopra il 30%"* — non un giudizio
inventato dal programma.

### 6. Il ciclo del circolante: dove la cassa si blocca

Quattro numeri raccontano perché un'azienda che guadagna può restare senza soldi:

| | |
|---|---|
| **DSO** | quanti giorni passano prima che i clienti paghino |
| **DIO** | quanti giorni la merce resta ferma in magazzino |
| **DPO** | quanti giorni l'azienda si prende per pagare i fornitori |
| **CCC** | i primi due meno il terzo: **i giorni in cui i soldi sono fuori** |

Se i clienti pagano a 90 giorni e i fornitori vanno pagati a 30, l'azienda finanzia i
propri clienti per due mesi — con i propri soldi, o con quelli della banca.

### 7. Il punto di pareggio

Quanti ricavi servono perché i conti tornino in pari, e quanto margine c'è fra i
ricavi di oggi e quella soglia. È la domanda che un imprenditore fa per prima.

---

Il metodo completo, formula per formula, è in
[`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md): liberamente
consultabile. I file originali dei clienti da cui è stato estratto restano fuori
da qui.

## Cosa fa DaProdFinanza

Prende quel metodo e lo trasforma in un programma.

Il consulente scrive i saldi dell'azienda direttamente nel programma (o carica un
file Excel che ha già) e il resto viene da sé: il bilancio riclassificato, gli indici
con le loro soglie, la previsione di cassa delle prossime settimane, le simulazioni
per vedere l'effetto di una decisione prima di prenderla, e un **report PDF** da
consegnare al cliente.

Tutto senza dipendere da internet, senza un abbonamento a un servizio esterno, e senza
che i numeri di un'azienda escano dal computer di chi ha il diritto di vederli.

## Due programmi, due punti di vista

| | **DaProdFinanza** | **DaProdFinanza Cliente** |
|---|---|---|
| Chi lo usa | Il consulente, nel suo studio | Ogni azienda seguita |
| Cosa vede | Tutti i clienti e tutte le loro aziende | Solo i propri numeri |
| Cosa fa | Configura, riclassifica, simula scenari | Carica i propri dati, consulta i propri KPI |
| Se salta la rete | Continua a funzionare | Continua a funzionare |

I due programmi si parlano su una rete privata (Tailscale, con un collegamento di
riserva per quando un'azienda non riesce a configurarlo). Nessun server pubblico,
nessun dominio da comprare, nessun dato che passa da terzi per l'uso quotidiano.

## Novità della 1.3.1

- **Avvio più sicuro.** Il programma si apre una volta sola: un secondo doppio clic
  riporta davanti la finestra già aperta invece di aprire un'altra copia sullo stesso
  database. Quando si chiude, si chiude davvero (niente processi rimasti in
  background), e dopo un aggiornamento la versione nuova aspetta che la vecchia abbia
  finito.

## Novità della 1.3.0

- **Più semplice, su Windows e sul telefono.** Da qualsiasi schermata **Ctrl+K** (o la
  lente in alto) cerca un'azienda, una sezione o un'azione e la esegue: "carica un
  documento", "registra ore", "report PDF", "nuova azienda". Il pulsante **Nuovo** ha
  le azioni della schermata in cui si è; l'azienda si cambia dall'intestazione, fra
  le recenti. Il menu laterale si richiude a icone (Ctrl+B) e si allarga trascinando
  il bordo; ogni pannello si comprime o si nasconde. Colore d'accento a scelta.
- **Sul telefono** una barra delle sezioni in basso come le app, le sezioni vicine a
  portata di pollice, periodo e scenario in un foglio che sale dal basso, le
  simulazioni in due schede (Leve e Risultati) con il riassunto sempre in vista.
- **Personale**, **Area fiscale e contributi**, **Marginalità**: tre sezioni nuove,
  qui sotto.
- **Cassetto documenti**: studio e azienda ci mettono file e li aprono al volo dentro
  il programma — PDF, Excel, Word, PowerPoint — anche dove Office non c'è.
- **Richieste e chiamate**: l'azienda chiede una chiamata, fa una domanda o manda
  documenti e vede se lo studio l'ha presa in carico; lo studio risponde anche solo
  per scritto e ha i pulsanti per la chiamata (*Chiamo ora*, *Richiamo*, *Chiamata
  fatta*…).
- **L'azienda come utente**: entra su un riepilogo con i suoi numeri principali, chi
  la segue e le sue richieste, e vede solo le sezioni che il consulente le ha
  condiviso. I consulenti sono gli amministratori: **Impostazioni** con interruttori
  per moduli, accessi, backup automatico, aggiornamenti, tema.

## Le viste

- **Panoramica** — la situazione del mese in un colpo d'occhio, con gli avvisi che si
  accendono da soli quando qualcosa peggiora
- **Conto Economico** — dove nascono e dove finiscono i soldi, con budget e anno
  precedente a confronto
- **Stato Patrimoniale** — cosa possiede l'azienda, e con quali soldi lo ha pagato
- **Capitale Circolante** — quanto tempo passa fra il pagare i fornitori e l'incassare
  dai clienti: è lì che la cassa si blocca
- **Tesoreria** — quanti soldi ci saranno in banca fra una settimana, un mese, tre mesi
- **Banche e Finanziamenti** — fidi, mutui e leasing, e quanto pesano sulla cassa futura
- **Analisi & Simulazioni** — "cosa succede se": assumo, investo, alzo i prezzi
- **Marginalità** *(1.3.0)* — quanto costa fare ciò che si vende e quanto resta: il
  food cost delle ricette, la distinta base dei prodotti, il costo di una commessa a
  preventivo e a consuntivo
- **Personale** *(1.3.0)* — quanto costa davvero ogni persona e un'ora del suo lavoro
- **Area fiscale e contributi** *(1.3.0)* — imposte e contributi dell'anno, quanto
  mettere da parte ogni mese, quando si paga
- **Documenti** e **Richieste e chiamate** *(1.3.0)* — il cassetto dei file e il filo
  diretto fra azienda e studio
- **Attività e Tempi** *(1.2.0)* — il lavoro del consulente su ogni azienda: le cose
  da fare, il tempo che ci si spende e quanto vale

In più, su ogni schermata:

- **Cruscotto a widget** in cima alla Panoramica: indicatori con le barre di
  avanzamento, scadenze in arrivo, dove vanno i ricavi, salute dell'azienda. Si
  sceglie quali widget vedere e si può attivare l'aggiornamento automatico.
- **Pannelli liberi**: ogni riquadro è un pannello indipendente. Si sposta dalla
  maniglia a pallini, si ridimensiona trascinando i bordi (che si illuminano), e gli
  altri si incastrano da soli senza lasciare buchi. Ogni schermata si riapre come la
  si è lasciata, con una disposizione per ogni tipo di schermo (1080p, 2K, 5K). Dal
  menu *Pannelli* si ripristina la disposizione o si bloccano i pannelli.
- **Zoom regolabile**: parte adatto allo schermo e si cambia dalla barra in basso o con
  Ctrl + / Ctrl − / Ctrl 0.
- **Scenari pronti** in Analisi & Simulazioni: 14 ipotesi con un clic — positive,
  negative, imprevisti — più due scenari estremi segnati "solo per test".
- **Report PDF** del periodo scelto: copertina, sintesi con i punti di attenzione,
  conto economico, stato patrimoniale e indici, circolante, tesoreria, banche.
- **Aggiornamenti con un clic**: il programma controlla da solo se su GitHub c'è una
  versione nuova, la scarica, la verifica e si aggiorna.

## Marginalità, Personale, Area fiscale

**Marginalità** prende la forma dell'attività. Per un ristorante sono **ricette e
ingredienti**: ogni pizza con i suoi grammi di farina e mozzarella (con lo scarto), i
minuti del pizzaiolo, e subito il **food cost**, quanto resta, il **prezzo consigliato**
per stare nell'obiettivo; il **menu engineering** divide il menu in stelle, cavalli da
lavoro, enigmi e cani, con cosa fare per ognuno. Per chi lavora **a commessa**
(edilizia, impianti, servizi) sono commesse con **preventivo e consuntivo** di
materiali, ore e lavorazioni esterne, e lo scostamento fra i due. Per produzione e
commercio, **distinta base** e **ricarico**.

**Personale**: per ogni persona contratto, ore, retribuzione annua lorda e mensilità;
il programma calcola il **costo aziendale** (retribuzione, contributi, INAIL, TFR, altri
costi) e il **costo di un'ora di lavoro** — che è la manodopera usata dalla
Marginalità. Per reparto, diretti e indiretti, e il confronto col costo del personale
scritto nel bilancio. Stipendi, F24 e INAIL possono entrare nella previsione di cassa.

**Area fiscale e contributi**: una **stima** (non la dichiarazione) di IRES, IRAP,
IRPEF, addizionali e contributi INPS — o dell'imposta sostitutiva del forfettario —
partendo dall'utile degli ultimi dodici mesi. Dice **quanto mettere da parte ogni
mese** e le **scadenze** di acconti e saldi, che possono entrare nella tesoreria.

## Attività e Tempi

Una schermata per il lavoro **del consulente**, non per i conti dell'azienda: la vede
solo lui. L'idea viene da [Ever Teams](https://github.com/ever-co/ever-teams), un
programma open source per organizzare il lavoro di un gruppo; qui è ridotta a quello
che serve a uno studio.

- **Timer** — un tasto grande per partire, l'attività si sceglie a pastiglie; resta
  visibile in alto in ogni schermata e se ne avvii un altro, il primo si ferma da solo.
- **Registra ore** — oggi o ieri, 15 minuti, mezz'ora, un'ora, due: due tocchi. Le voci
  del registro si correggono con un clic.
- **Bacheca a colonne** — *Da fare, In corso, Da verificare, Fatto*: ogni attività ha
  priorità, scadenza (rossa quando è passata), una stima e il tempo già speso. Si
  sposta trascinandola o con i pulsanti *Inizia / Da rivedere / Fatta*; sul telefono
  una colonna alla volta.
- **Quanto vale** — con la tariffa oraria dell'azienda, le ore fatturabili del mese
  diventano un importo. Più il grafico delle ultime otto settimane e il registro giorno
  per giorno.

## Come entrano i dati

**Il bilancio, nel programma.** Dentro un'azienda, alla voce *Dati contabili*:

- **Piano dei conti**: si crea con un clic il *piano di partenza* (un conto per ogni
  sezione del metodo, da rinominare e dettagliare), poi si aggiungono, modificano o
  disattivano i conti.
- **Saldi**: si sceglie il mese (o l'anno) e lo scenario — consuntivo, budget,
  forecast — e si scrivono gli importi conto per conto, come su un foglio, con i
  totali che si aggiornano mentre si scrive. *Mese successivo* apre il mese nuovo,
  *Copia dal periodo precedente* riempie i campi vuoti. Un periodo si può chiudere,
  così nessuno lo modifica più per sbaglio.

**Da Excel, se il file c'è già.** Nella stessa voce, *Importa da Excel* legge il
piano dei conti del consulente (o il modello scaricabile), mostra un riepilogo di
quello che ha letto e solo dopo scrive. Da lì in poi tutto si modifica nel programma.

**Le scadenze e le previsioni, a mano.** Nella *Tesoreria* si inseriscono le fatture da
incassare e da pagare, con le condizioni di pagamento (*30 giorni fine mese* e simili:
la scadenza si calcola da sola), e le voci che si ripetono — stipendi, affitto, incassi
di cassa. Quando una fattura viene pagata, anche solo in parte, lo si registra con un
clic, e la liquidità di oggi si aggiorna.

**Banche e finanziamenti, a mano.** Per ogni istituto si registrano i fidi (quanto è
accordato, quanto è usato) e i finanziamenti: importo, tasso, numero di rate. Il piano
di ammortamento si calcola da solo, e le rate finiscono nella previsione di cassa senza
doverle scrivere una per una.

---

## A che punto siamo

Il programma si avvia, riconosce chi entra, gestisce l'anagrafica dei clienti e delle
loro aziende, importa il piano dei conti da Excel e ne calcola il bilancio
riclassificato con tutti gli indici, e lo mostra in cinque schermate: panoramica con
avvisi automatici, conto economico, stato patrimoniale, capitale circolante con le sue
note automatiche, e tesoreria con scadenziario e previsione di cassa a sei mesi.
C'è anche la parte bancaria: fidi, mutui e leasing con il loro piano di ammortamento,
le rate che entrano da sole nella previsione di cassa. E ci sono le **simulazioni**:
si muovono le leve (ricavi, costi, dipendenti, giorni di incasso, un investimento, un
finanziamento) e si vede subito l'effetto su utile, cassa e debito, scenario salvabile
ed esportabile in Excel. Tutte e sette le viste esistono. Dalla versione 1.0.0 i dati si
inseriscono direttamente nel programma, c'è il report PDF, il cruscotto a widget con i
riquadri spostabili e l'aggiornamento automatico da GitHub. Con la 1.2.0 arrivano
**Attività e Tempi** e la **demo per telefoni Android**; con la 1.3.0 un'interfaccia
più semplice, le impostazioni, il cassetto documenti, richieste e chiamate fra azienda
e studio, **Personale**, **Area fiscale** e **Marginalità**. Manca il collegamento fra i
due programmi.

| | Fase | Stato |
|---|---|---|
| 0 | Impalcatura del programma | ✅ Fatta |
| 1 | Accesso, ruoli, anagrafica clienti e aziende | ✅ Fatta |
| 2 | Struttura dati del motore di calcolo | ✅ Fatta |
| 3 | Riclassificazione, indici, import Excel | 🟡 Quasi — serve un file cliente **con i saldi** per la verifica finale |
| 4 | Le prime tre schermate di analisi | ✅ Fatta |
| 5 | Capitale circolante, tesoreria, scadenziario | ✅ Fatta |
| 6 | Banche e finanziamenti | ✅ Fatta |
| 7 | Analisi e simulazioni | ✅ Fatta |
| 1.0 | Aggiornamenti automatici, dati nel programma, report PDF, cruscotto, riquadri spostabili | ✅ Versione 1.0.0 |
| 1.1 | Pannelli liberi e ridimensionabili, zoom, scenari pronti, demo per Mac | ✅ Versione 1.1.0 |
| 1.2 | Attività e Tempi (bacheca, timer, ore), demo per Android | ✅ Versione 1.2.0 |
| 1.3 | Interfaccia più semplice (Ctrl+K, telefono), impostazioni, documenti, richieste e chiamate, Personale, Area fiscale, Marginalità | ✅ Versione 1.3.1 |
| 8-9 | Collegamento fra i due programmi (senza account), import Excel più tollerante | ⬜ Prossima |
| 10 | Eseguibili: installer, portable, demo | 🟡 Pubblicati a ogni aggiornamento importante; mancano le varianti Consulente/Azienda |

La roadmap viva sta su GitHub, nell'issue fissata
**[Roadmap](https://github.com/cammo22/DaProdFinanza/issues/39)**; il dettaglio di
cosa c'è dentro ogni fase è in [`AGENTS.md` §13](./AGENTS.md).

## Provarlo

Il modo più rapido per vederlo all'opera è la **versione demo**:
`DaProdFinanza-Demo-x.y.z-portable.exe`. Si lancia senza installare niente e parte
già con una pizzeria di esempio, due anni di bilanci, lo scadenziario, le previsioni
di cassa, le banche e i finanziamenti, il personale, le ricette col food cost, i
documenti e una chiamata in arrivo. Si entra come
consulente con **`cammo` / `1234`**, oppure come azienda con **`Pizzeria DaProd` /
`1234`**. I suoi dati restano in una cartella a parte e non si mescolano mai con
quelli di un'installazione vera.

Ogni versione sulla pagina **[Releases](https://github.com/cammo22/DaProdFinanza/releases)**
ha tre file per Windows a 64 bit, e la demo per Mac e per Android:

| File | A cosa serve |
|---|---|
| `DaProdFinanza-Demo-x.y.z-portable.exe` | Provarlo con i dati di esempio |
| `DaProdFinanza-Setup-x.y.z.exe` | Installarlo per usarlo davvero |
| `DaProdFinanza-x.y.z-portable.exe` | Usarlo davvero senza installare niente |
| `DaProdFinanza-Demo-x.y.z-mac-arm64.dmg` | La demo su un Mac con chip Apple (M1 e successivi) |
| `DaProdFinanza-Demo-x.y.z-mac-x64.dmg` | La demo su un Mac con processore Intel |
| `DaProdFinanza-Demo-x.y.z-android.apk` | La demo su un telefono o tablet Android |

**Sul Mac c'è solo la demo.** Si apre il DMG e si trascina il programma in
Applicazioni (o lo si avvia direttamente dal DMG). Non è firmato da Apple: al primo
avvio macOS lo blocca; si apre *Impostazioni di Sistema → Privacy e sicurezza* e si
sceglie *Apri comunque* (oppure clic destro sul programma → *Apri*). Per aggiornarla,
il pulsante *Aggiornamenti* apre la pagina da cui scaricare il DMG nuovo.

**Su Android c'è solo la demo.** Si scarica l'APK dal telefono e lo si apre: Android
chiede il permesso di installare app da quella fonte (il browser o *File*), si
concede e si installa. È lo stesso programma, con gli stessi dati di esempio, lo
stesso accesso (`cammo` / `1234`), le sezioni nella barra in basso e il resto nel
menu. Periodo, scenario e report si aprono dal pulsante col calendario in alto; il
tondo in basso a destra ha le azioni rapide; l'avviso della demo si chiude con la ×. I
pannelli partono **bloccati**, così scorrendo col dito non si ridimensionano per
sbaglio: il lucchetto in alto li sblocca con un tocco. Sul telefono non ci sono
import/export Excel, report PDF e backup, e i documenti si aprono solo dentro il
programma. Per aggiornarla si installa l'APK
nuovo sopra quello vecchio: i dati di esempio restano.

Dalla 1.0.0 non serve più scaricarli a mano: il pulsante **Aggiornamenti** (in basso
a destra, e nella schermata d'ingresso) trova la versione nuova e si aggiorna da solo,
ognuno con il suo file — l'installato con l'installer, il portatile con il portatile,
la demo con la demo.

Non sono ancora firmati con un certificato, quindi al primo avvio Windows mostra un
avviso: *Ulteriori informazioni → Esegui comunque*. Poi il programma chiede di creare
l'account del consulente e si parte.

I dati restano sul computer: il database sta in `%APPDATA%\DaProdFinanza` ed è
**cifrato**, con la chiave protetta dal sistema operativo. Le cartelle di lavoro e i
backup stanno in `Documenti\DaProdFinanza`.

<br>

---

<br>

# Parte tecnica

Da qui in giù serve solo a chi mette le mani nel codice.

## Stack

| Layer | Tecnologia |
|---|---|
| Desktop | Electron 44 |
| Interfaccia | React 19 + Tailwind CSS 4 |
| Backend | Node.js + Express 5, embedded nel processo main |
| Database | SQLite **cifrato** (`better-sqlite3-multiple-ciphers`, SQLCipher) |
| Autenticazione | JWT, password con scrypt |
| Build | electron-vite + TypeScript, electron-builder per gli installatori |
| Grafici | Recharts |
| Test | Vitest |
| Demo Android | Capacitor 8 + sql.js (SQLite in WebAssembly), stesso codice |

Convenzione di progetto: **identificatori in inglese, interfaccia in italiano**.

## Architettura

```
[Azienda 1] ──┐
[Azienda 2] ──┼── REST su rete privata ──► [CONSULENTE]
[Azienda N] ──┘                            Express + SQLite cifrato
```

Ogni installazione ha il proprio SQLite locale e funziona offline. Il consulente è la
fonte di verità per la configurazione, l'azienda per i propri dati grezzi. Il
collegamento fra i due arriva in fase 8: oggi il server Express ascolta **solo su
127.0.0.1**, con porta effimera, e non è esposto verso la rete.

## Struttura

```
src/
├── main/            processo Electron
│   ├── db/          apertura del database cifrato e migrazioni versionate
│   ├── import/      lettura dei file Excel
│   ├── lib/         percorsi su disco, segreti (DPAPI), scrypt, JWT
│   └── server/      REST: routes/ → services/
├── preload/         unico ponte main ↔ renderer (contextIsolation attivo)
├── renderer/        React + Tailwind
├── web/             versione Android: backend in pagina, sql.js, sostituti di Node/Electron
└── shared/
    ├── engine/      il motore di calcolo: funzioni pure, zero dipendenze
    │                (bilancio, indici, tesoreria, finanziamenti, simulazioni,
    │                attività, personale, fiscale, marginalità)
    ├── settings.ts  impostazioni di programma, utente e azienda
    ├── documents.ts documenti e richieste
    └── types.ts     tipi condivisi
```

### Il motore di calcolo

`src/shared/engine/` non sa che esiste un database: riceve una lista di conti con i
loro saldi e restituisce prospetti e indici. Le formule sono la parte più delicata del
prodotto, e così si verificano in isolamento.

Due convenzioni da conoscere prima di leggerlo:

- **I costi sono positivi**, e sono le formule a sottrarli. Vale anche per i debiti.
- **Un indice indefinito vale `null`, non zero.** Un rapporto con denominatore zero non
  è zero: scrivere "0%" su un bilancio racconterebbe una bugia.

E una scelta di modellazione: **gli importi sono interi in centesimi**, mai numeri in
virgola mobile. Su un bilancio riclassificato si sommano centinaia di righe, e un
errore di un centesimo farebbe "non quadrare" attivo e passivo.

### L'import Excel

`src/main/import/chart-of-accounts.ts` riconosce le sezioni dalle intestazioni di
categoria e le colonne dai nomi in prima riga — **mai da numeri di riga fissi**, perché
file di clienti e periodi diversi non sono identici.

L'anteprima non scrive niente: elenca righe riconosciute, righe da mappare a mano,
doppioni e impronta SHA-256 del file. Scrivere è una chiamata separata, in una sola
transazione, che rifiuta di sovrascrivere un periodo già caricato senza conferma
esplicita, e un periodo chiuso in ogni caso.

### La demo per Android

Non è un'app a parte: `vite.android.config.ts` mette in una sola pagina web
l'interfaccia **e il backend** (Express, rotte, servizi, migrazioni, seed, motore),
sostituendo solo i moduli che su un telefono non esistono. Il database è sql.js con
un adattatore che parla come `better-sqlite3` (`src/web/sqlite.ts`), salvato
nell'IndexedDB; Express è un piccolo router compatibile (`src/web/shims/express.ts`)
e le chiamate `fetch` all'indirizzo del backend restano nella pagina
(`src/web/bridge.ts`). Capacitor la impacchetta in un APK sulla CI di GitHub
(`.github/workflows/android-demo.yml`), a ogni release. Dettagli in
[`AGENTS.md`](./AGENTS.md), versione 1.2.0.

### L'interfaccia (1.3.0)

- **Comandi rapidi** (`renderer/src/lib/comandi.tsx`): chi sa fare qualcosa lo
  dichiara con `useRegistraComandi`; la tavolozza (Ctrl+K) e il pulsante *Nuovo* li
  leggono. Un'azione che vive in una schermata non ancora aperta si chiede con
  `richiediAzione` e la schermata la raccoglie con `useAzione`.
- **Guscio** (`components/Guscio.tsx`, `Sidebar.tsx`): menu richiudibile e
  ridimensionabile, cambio d'azienda con le recenti, barra delle sezioni del telefono.
- **Pannelli**: nascosti e compressi per schermata, in `localStorage`.
- **Anteprime dei documenti** (`components/viewer/`): PDF.js, ExcelJS, docx-preview in
  un iframe senza script, pptx-glimpse con i caratteri Carlito e Arimo inclusi.
  Caricate solo quando servono.
- Le sezioni pesanti si caricano alla prima apertura (`React.lazy`); i dati già letti
  si mostrano subito mentre si aggiornano (`lib/memoria.ts`).

## Comandi

```bash
npm install            # installa e ricompila il modulo nativo per Electron
npm run dev            # avvio in sviluppo, con ricarica a caldo
npm run test           # i test del motore e dell'import
npm run build          # controllo dei tipi + test + build
npm run dist           # installatore e portable in release/
npm run dist:demo      # versione demo portable, con dati di esempio, in release/demo/
npm run demo           # build compilata, con gli account di prova attivi
npm run verify:schema  # prova i vincoli del database e fa rollback
npm run android:web    # la demo Android come pagina web, in out/web/
npm run android:preview  # la serve su http://localhost:4173 (per provarla nel browser)
```

In sviluppo un seed crea due account di prova — `cammo` / `1234` (consulente) e
`Pizzeria DaProd` / `1234` (azienda) — mostrati sulle card di accesso. **Il seed non
gira mai in un'installazione normale** e va rimosso prima della distribuzione vera.

## Test

I test più importanti non verificano che il codice giri, ma che i conti tornino. Il
principale: **i tre schemi di riclassificazione devono arrivare allo stesso EBIT e allo
stesso utile**, perché sono tre presentazioni dello stesso risultato. Se una formula
viene trascritta male, lì si spacca.

Lo stesso vale per le sezioni della 1.3.0: costo aziendale e orario del personale,
imposte e contributi di ogni regime, acconti e saldi, food cost e menu engineering
sono verificati su **conti fatti a mano** (`src/shared/engine/*.test.ts`).

Due test girano sul file Excel reale del consulente quando è presente nella cartella di
lavoro; in CI vengono saltati, perché quel file non sta nella repo.

## Documenti di progetto

- [`AGENTS.md`](./AGENTS.md) — prodotto, architettura, moduli, roadmap fase per fase
- [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md) — il motore di calcolo:
  schema dei conti, tre riclassificazioni, tutte le formule degli indici

## Licenza

[MIT](LICENSE) — codice e metodologia di calcolo liberamente riutilizzabili.
