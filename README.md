<div align="center">

# DaProdFinanza

**Controllo di gestione per chi segue più aziende insieme.**

Un gestionale desktop per consulenti finanziari aziendali: riclassifica il bilancio,
calcola gli indici che contano, previene le tensioni di cassa prima che arrivino,
e risponde a "cosa succede se" senza toccare un foglio Excel.

![stato](https://img.shields.io/badge/stato-in%20sviluppo%20%C2%B7%20fase%205%2F10-3ddbff)
![piattaforma](https://img.shields.io/badge/Windows-x64-3ddbff)
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

Il consulente carica il piano dei conti dell'azienda — lo stesso file Excel che usa
già — e il resto viene da sé: il bilancio riclassificato, gli indici con le loro
soglie, la previsione di cassa delle prossime settimane, e le simulazioni per vedere
l'effetto di una decisione prima di prenderla.

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

## Le sette viste

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

## Come entrano i dati

Due strade, che si usano insieme.

**Il bilancio, da Excel.** Dentro un'azienda, alla voce *Import dati*, c'è il pulsante
**Scarica il modello Excel**: un file con tutte le sezioni già pronte, e i conti
dell'azienda se ce ne sono già. Si scrive il saldo di ogni conto, si ricarica il file,
si sceglie a quale mese e a quale scenario appartiene (consuntivo, budget, forecast).
Prima di scrivere qualsiasi cosa, il programma mostra un riepilogo di quello che ha
letto. Il consulente che ha già il suo file può caricare direttamente quello.

**Le scadenze e le previsioni, a mano.** Nella *Tesoreria* si inseriscono le fatture da
incassare e da pagare, con le condizioni di pagamento (*30 giorni fine mese* e simili:
la scadenza si calcola da sola), e le voci che si ripetono — stipendi, affitto, incassi
di cassa. Quando una fattura viene pagata, anche solo in parte, lo si registra con un
clic, e la liquidità di oggi si aggiorna.

---

## A che punto siamo

Il programma si avvia, riconosce chi entra, gestisce l'anagrafica dei clienti e delle
loro aziende, importa il piano dei conti da Excel e ne calcola il bilancio
riclassificato con tutti gli indici, e lo mostra in cinque schermate: panoramica con
avvisi automatici, conto economico, stato patrimoniale, capitale circolante con le sue
note automatiche, e tesoreria con scadenziario e previsione di cassa a sei mesi.
Mancano banche e finanziamenti, le simulazioni e il collegamento fra i due programmi.

| | Fase | Stato |
|---|---|---|
| 0 | Impalcatura del programma | ✅ Fatta |
| 1 | Accesso, ruoli, anagrafica clienti e aziende | ✅ Fatta |
| 2 | Struttura dati del motore di calcolo | ✅ Fatta |
| 3 | Riclassificazione, indici, import Excel | 🟡 Quasi — serve un file cliente **con i saldi** per la verifica finale |
| 4 | Le prime tre schermate di analisi | ✅ Fatta |
| 5 | Capitale circolante, tesoreria, scadenziario | ✅ Fatta |
| 6 | Banche e finanziamenti | ⬜ Prossima |
| 7 | Analisi e simulazioni | ⬜ |
| 8-9 | Collegamento fra i due programmi | ⬜ |
| 10 | I tre eseguibili finali: installer, portable, demo | 🟡 Già provati, si pubblicano a codice finito |

La roadmap completa, con il dettaglio di cosa c'è dentro ogni fase, è in
[`AGENTS.md` §13](./AGENTS.md).

## Provarlo

Il modo più rapido per vederlo all'opera è la **versione demo**:
`DaProdFinanza-Demo-x.y.z-portable.exe`. Si lancia senza installare niente e parte
già con una pizzeria di esempio, due anni di bilanci, lo scadenziario e le previsioni
di cassa. Si entra come
consulente con **`cammo` / `1234`**, oppure come azienda con **`Pizzeria DaProd` /
`1234`**. I suoi dati restano in una cartella a parte e non si mescolano mai con
quelli di un'installazione vera.

Per usarlo davvero, sempre dalla pagina **[Releases](https://github.com/cammo22/DaProdFinanza/releases)**:
`DaProdFinanza-Setup-x.y.z.exe` per installarlo, oppure la versione *portable* che si
lancia e basta. Windows a 64 bit.

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
└── shared/
    ├── engine/      il motore di calcolo: funzioni pure, zero dipendenze
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
```

In sviluppo un seed crea due account di prova — `cammo` / `1234` (consulente) e
`Pizzeria DaProd` / `1234` (azienda) — mostrati sulle card di accesso. **Il seed non
gira mai in un'installazione normale** e va rimosso prima della distribuzione vera.

## Test

I test più importanti non verificano che il codice giri, ma che i conti tornino. Il
principale: **i tre schemi di riclassificazione devono arrivare allo stesso EBIT e allo
stesso utile**, perché sono tre presentazioni dello stesso risultato. Se una formula
viene trascritta male, lì si spacca.

Due test girano sul file Excel reale del consulente quando è presente nella cartella di
lavoro; in CI vengono saltati, perché quel file non sta nella repo.

## Documenti di progetto

- [`AGENTS.md`](./AGENTS.md) — prodotto, architettura, moduli, roadmap fase per fase
- [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md) — il motore di calcolo:
  schema dei conti, tre riclassificazioni, tutte le formule degli indici

## Licenza

[MIT](LICENSE) — codice e metodologia di calcolo liberamente riutilizzabili.
