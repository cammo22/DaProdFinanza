<div align="center">

# DaProdFinanza

**Controllo di gestione per chi segue più aziende insieme.**

Un gestionale desktop per consulenti finanziari aziendali: riclassifica il bilancio,
calcola gli indici che contano, previene le tensioni di cassa prima che arrivino,
e risponde a "cosa succede se" senza toccare un foglio Excel.

![stato](https://img.shields.io/badge/stato-in%20sviluppo%20%C2%B7%20fase%202%2F10-3ddbff)
![piattaforma](https://img.shields.io/badge/Windows-x64-3ddbff)
[![licenza](https://img.shields.io/badge/licenza-MIT-5cff9d)](LICENSE)

</div>

---

## Stato del progetto

🚧 **In sviluppo — fasi 0, 1 e 2 completate su 10.**

L'applicazione si avvia, autentica, gestisce l'anagrafica dei clienti e delle loro
aziende, e il database sa già rappresentare piano dei conti, tag di riclassificazione,
periodi e saldi. Quello che manca è il calcolo: riclassificare e produrre gli indici. La roadmap
completa, fase per fase, è in [`AGENTS.md` §13](./AGENTS.md); le formule e lo schema
dati del motore in [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md).

| Fatto | In arrivo |
|---|---|
| Scaffolding Electron + React + Tailwind + Express + SQLite cifrato | Schema dati del piano dei conti |
| Scelta del ruolo all'avvio, login JWT, ruoli Consulente / Azienda | Riclassificazione e indici di bilancio |
| Anagrafica Clienti e Aziende, con archiviazione e rimozione | Import Excel del piano dei conti |
| Schema dati del motore: conti, tag, periodi, saldi | Le sette viste di analisi |
| Backup del database e status bar di servizio | Sincronizzazione Consulente ↔ Azienda |

### Per svilupparlo

```bash
npm install
npm run dev
```

Al primo avvio l'app chiede di creare l'account del Consulente. Il database è cifrato
a riposo (SQLCipher) e la chiave è protetta da DPAPI: vive in `%APPDATA%/daprodfinanza`,
i dati di lavoro in `Documenti/DaProdFinanza`.

In sviluppo un seed crea due account di prova — `cammo` / `1234` (Consulente) e
`Pizzeria DaProd` / `1234` (Azienda) — mostrati direttamente sulle card di accesso.
Per provarli sulla build compilata: `npm run demo`. Il seed non gira mai in
un'installazione normale.

## Cos'è

Un consulente segue più **aziende clienti** in parallelo. Per ognuna vuole sapere, senza
rifare ogni volta lo stesso Excel: quanto margina davvero, quanto tempo ha prima di un
problema di cassa, quanto vale il magazzino che tiene fermo i soldi, e cosa cambia se
assume una persona o chiede un altro finanziamento.

DaProdFinanza è pensato in **due parti**, sullo stesso principio già in produzione su
[IrideeCRM](https://github.com/cammo22/DaProd-IRIS) (stesso studio, altro prodotto):

| | **DaProdFinanza** (il consulente) | **DaProdFinanza Cliente** (l'azienda) |
|---|---|---|
| Chi lo usa | Il professionista | Ogni azienda seguita |
| Cosa vede | Tutti i clienti e le loro aziende, vista aggregata | Solo i propri numeri |
| Cosa fa | Configura, riclassifica, simula scenari | Carica dati (fatture, estratti conto), consulta i propri KPI |
| Dati | Tutto, su tutte le aziende | Solo i propri, anche offline |

Le due app si parlano in rete privata via **Tailscale** (con un trasporto di riserva per
quando un'azienda non riesce a configurarlo) — nessun server pubblico necessario, nessun
dominio, nessun dato che passa da terzi per l'uso quotidiano.

## I moduli

Sette viste, tutte già disegnate nella fase di analisi (dettaglio completo in `AGENTS.md` §10):

- **Panoramica** — la situazione del mese in un colpo d'occhio, con alert automatici
- **Conto Economico** — riclassificato a margine di contribuzione, con budget e anno precedente a confronto
- **Stato Patrimoniale** — attivo/passivo riclassificati, indici patrimoniali e finanziari
- **Capitale Circolante** — DSO, DIO, DPO, Cash Conversion Cycle, con trend e alert
- **Tesoreria / Cash Flow** — previsione di liquidità su 7/30/60/90 giorni e 6 mesi, scadenziario
- **Banche e Finanziamenti** — fidi, mutui, leasing e il loro impatto sulla cassa futura
- **Analisi & Simulazioni** — "cosa succede se": scenari what-if su ricavi, costi, investimenti, finanziamenti

## Come nasce

Il motore di calcolo non è teoria: è l'estrazione e generalizzazione di uno strumento
Excel che un consulente finanziario usa già oggi con i propri clienti (piano dei conti
taggato, tre schemi di riclassificazione, indici di bilancio con soglie). Il dettaglio
completo, formula per formula, è in [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md).

## Licenza

[MIT](LICENSE) — codice e metodologia di calcolo liberamente riutilizzabili.
