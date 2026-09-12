<div align="center">

# DaProdFinanza

**Controllo di gestione per chi segue più aziende insieme.**

Un gestionale desktop per consulenti finanziari aziendali: riclassifica il bilancio,
calcola gli indici che contano, previene le tensioni di cassa prima che arrivino,
e risponde a "cosa succede se" senza toccare un foglio Excel.

![stato](https://img.shields.io/badge/stato-in%20sviluppo%20%C2%B7%20fase%204%2F10-3ddbff)
![piattaforma](https://img.shields.io/badge/Windows-x64-3ddbff)
[![licenza](https://img.shields.io/badge/licenza-MIT-5cff9d)](LICENSE)

</div>

---

## Il problema

Un consulente finanziario segue dieci, venti aziende contemporaneamente. Per ognuna
deve rispondere alle stesse domande: **quanto margina davvero?** **quanto tempo ha
prima di un problema di cassa?** **quanto valgono i soldi fermi in magazzino?**
**cosa cambia se assume una persona, o se chiede un altro finanziamento?**

Oggi quelle risposte arrivano da un foglio Excel costruito negli anni: bravissimo,
ma da rifare a mano per ogni cliente e per ogni mese. Un errore in una formula non
si vede finché non è troppo tardi, e i numeri vivono sul computer del consulente,
lontani dall'imprenditore che dovrebbe leggerli.

## Cosa fa DaProdFinanza

Prende quel metodo e lo trasforma in un programma.

Il consulente carica il piano dei conti dell'azienda — lo stesso file Excel che usa
già — e il programma fa il resto: **riclassifica il bilancio**, cioè riordina i conti
grezzi in un prospetto leggibile che mostra dove nascono i margini e dove si perdono;
**calcola gli indici** che misurano redditività, solidità e liquidità; **prevede la
cassa** delle prossime settimane incrociando incassi attesi, pagamenti e rate dei
finanziamenti; e **simula gli scenari**, per vedere l'effetto di una decisione prima
di prenderla.

Tutto senza dipendere da internet, senza un abbonamento a un servizio esterno, e
senza che i numeri di un'azienda escano dal computer di chi ha il diritto di vederli.

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

## Come nasce

Il motore di calcolo non è teoria da manuale: è l'estrazione di uno strumento Excel
che un consulente finanziario usa già oggi con i propri clienti — piano dei conti
classificato, tre modi alternativi di riclassificare il bilancio, indici con le soglie
che lui stesso applica.

Quel metodo è stato letto riga per riga, generalizzato e reso anonimo, e vive in
[`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md): formula per formula,
liberamente consultabile. I file originali dei clienti restano fuori da qui.

---

## A che punto siamo

Il programma si avvia, riconosce chi entra, gestisce l'anagrafica dei clienti e delle
loro aziende, importa il piano dei conti da Excel e ne calcola il bilancio
riclassificato con tutti gli indici — e adesso lo **mostra**: panoramica con avvisi
automatici, conto economico riclassificato e stato patrimoniale con tutti gli indici.
Quello che manca è la parte di cassa: previsione, scadenziario, banche, simulazioni.

| | Fase | Stato |
|---|---|---|
| 0 | Impalcatura del programma | ✅ Fatta |
| 1 | Accesso, ruoli, anagrafica clienti e aziende | ✅ Fatta |
| 2 | Struttura dati del motore di calcolo | ✅ Fatta |
| 3 | Riclassificazione, indici, import Excel | 🟡 Quasi — serve un file cliente **con i saldi** per la verifica finale |
| 4 | Le prime tre schermate di analisi | ✅ Fatta |
| 5-7 | Cassa, banche, simulazioni | ⬜ Prossima |
| 8-9 | Collegamento fra i due programmi | ⬜ |
| 10 | Installatori | 🟡 Già disponibili, da rifinire |

La roadmap completa, con il dettaglio di cosa c'è dentro ogni fase, è in
[`AGENTS.md` §13](./AGENTS.md).

## Provarlo

Gli eseguibili sono nella pagina **[Releases](https://github.com/cammo22/DaProdFinanza/releases)**:
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
