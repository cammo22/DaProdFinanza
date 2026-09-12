<div align="center">

# DaProdFinanza

**Controllo di gestione per chi segue più aziende insieme.**

Un gestionale desktop per consulenti finanziari aziendali: riclassifica il bilancio,
calcola gli indici che contano, previene le tensioni di cassa prima che arrivino,
e risponde a "cosa succede se" senza toccare un foglio Excel.

![stato](https://img.shields.io/badge/stato-in%20progettazione-orange)
![piattaforma](https://img.shields.io/badge/Windows-x64-3ddbff)
[![licenza](https://img.shields.io/badge/licenza-MIT-5cff9d)](LICENSE)

</div>

---

## Stato del progetto

📋 **In fase di specifica — nessun codice ancora scritto.**

Questa repo contiene oggi il *brief* di progetto, non l'applicazione: la specifica
funzionale e tecnica completa vive in [`AGENTS.md`](./AGENTS.md), il motore di calcolo
(formule, indici, schema del piano dei conti) in [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md).
Lo sviluppo vero e proprio parte da lì.

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
