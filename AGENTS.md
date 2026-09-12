# DaProdFinanza — Project Brief per Claude Code

> Documento master di progetto — generato da sessione di analisi e pianificazione DaProdProduzioni
> Settore: software di controllo di gestione per consulenti finanziari aziendali (commercialisti, advisor, temporary manager)
> Stato: **fase di specifica — nessun codice ancora scritto**, pronto per l'inizio sviluppo (assegnato a Opus)
> Lingua progetto: codice EN, UI IT (convenzione DaProd, come IrideeCRM)

---

## ⚠️ ISTRUZIONI PER L'AGENTE — LEGGERE PRIMA DI TUTTO

- Questo è un progetto **multi-sessione**. Procedi **per fasi** (vedi §13). Non tentare di costruire tutto in una volta.
- Ogni fase deve produrre codice **funzionante e testabile** prima di passare alla successiva.
- Configura **step by step in dettaglio**: non saltare passaggi, non assumere configurazioni. In caso di ambiguità, **chiedi prima di procedere**.
- Mantieni questo file aggiornato come fonte di verità. Quando completi una fase, segna lo stato (vedi lo stile già usato in `docs/RIPRESA.md` di IrideeCRM per il progetto gemello).
- Questo documento **non è stato validato riga per riga col cliente** (a differenza dell'AGENTS.md di IrideeCRM): è il risultato di un'analisi di materiali grezzi (screenshot, un Excel di lavoro, note sparse). Le assunzioni fatte sono segnate esplicitamente e vanno confermate — vedi **§14 Punti aperti**.
- Non riusare il codice di IrideeCRM (repo diversa, dominio diverso), ma **il pattern architetturale sì** (§2-§7): è già in produzione, validato, e il cliente lo conosce.

---

## 0. Materiali di origine — e cosa NON va mai nella repo pubblica

Questo progetto nasce da 3 tipi di materiale grezzo fornito dal cliente in locale (cartella di lavoro, non nella repo git):

1. **7 screenshot** dell'interfaccia — mockup generati con AI a partire dalla grafica reale di **DaProd IRIS** (altro prodotto DaProdProduzioni), rifiniti a mano per mostrare *solo* un modulo "Business" che in IRIS non esiste ancora così. Servono **solo come riferimento di stile/UX** — DaProdFinanza non dipende da IRIS.
2. **1 file Excel** (`Piano Dei Conti Indy Gennaio 2026.xlsx`) — il vero e proprio **motore di calcolo** del controllo di gestione che il consulente usa oggi manualmente: piano dei conti con tag di riclassificazione, tre schemi di riclassificazione del conto economico, riclassificazione dello stato patrimoniale, indici di bilancio con formule. È la fonte più importante di tutto questo documento. **"Indy" è (presumibilmente) il nome di un cliente reale del consulente** — il file va tenuto fuori dalla repo pubblica.
3. **1 file di testo** con note libere del cliente, in ordine sparso, sui comportamenti desiderati.

**Regola pratica**: questi file restano nella cartella di lavoro locale e sono in `.gitignore`. Tutto ciò che serve per sviluppare è stato estratto, generalizzato e reso anonimo in questo file e in [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md). Se in una sessione futura questi file non sono più presenti in locale, **non è un problema**: il loro contenuto utile è già qui.

⚠️ **Non committare mai**: screenshot con branding "I.R.I.S." / "DaProdProduzioni" così come sono, il file Excel originale, il file di note originale.

---

## 1. Cos'è DaProdFinanza

Gestionale desktop Windows di **controllo di gestione** (management accounting) per consulenti finanziari aziendali che seguono **più aziende clienti** in parallelo: riclassifica bilanci, calcola indici, previsione di cassa, gestione fidi bancari, simulazioni "what-if".

Punti fermi dati dal cliente (testuali, dal brief):
- Dev'essere uno **standalone**: non dipende da DaProd IRIS. Deve però potersi **collegare opzionalmente** a IRIS o ad altri gestionali come fonte dati (vedi §11.3).
- Due varianti dallo stesso principio di IrideeCRM (**stessa idea, non stesso codice**):
  - **DaProdFinanza** (Consulente / *Master*) — l'app del professionista: gestisce tutti i clienti/aziende, tutta la suite Business, configurazione, import, simulazioni, vista aggregata multi-azienda.
  - **DaProdFinanza Cliente** (Azienda / *Satellite*) — app leggera installata presso ogni azienda cliente: serve a **caricare i dati** (fatture XML, estratti conto, inserimenti manuali) e a **tenere traccia** dei propri numeri (dashboard di sola lettura). Nessun accesso alla configurazione del piano dei conti né ai dati di altre aziende.
- Interfaccia: un menu iniziale per **aggiungere/rimuovere Clienti e Aziende**, creazione rapida di una nuova azienda, poi dentro l'azienda la suite "Business" (screenshot analizzati, §10).
- Scambio dati **Consulente ↔ Azienda** sempre via **Tailscale** (da confermare "Tailscale" vs "Tailcat" — §14).

---

## 1-bis. Glossario

- **Consulente** = il professionista che usa l'app Master (l'"operatore" principale, o il suo studio).
- **Cliente** = un cliente dello studio: una persona o un gruppo che può possedere **più Aziende** (es. un imprenditore con 3 società).
- **Azienda** = la singola società/partita IVA analizzata: è l'unità su cui gira tutto il modulo Business (ha un proprio piano dei conti, un proprio bilancio, una propria cassa). Corrisponde concettualmente alla "sede/Point" di IrideeCRM, ma qui è **l'azienda del cliente**, non una sede in franchising.
- **Operatore** = account di login (staff del Consulente sul Master, oppure l'utente lato Azienda sul Cliente).
- **Tipo di attività** (o "modello di business") = template di settore (Produzione/Manifattura, Commercio, Servizi, Ristorazione, Edilizia, Studio professionale, ...) che precompila le % di costo diretto/indiretto e un piano dei conti di partenza. Risponde alla nota del cliente: *"se io sono un tornitore ho esigenze diverse rispetto ad una pizzeria"*.
- **Piano dei Conti** = elenco dei conti mastro (codice + descrizione) con relativo saldo.
- **Riclassificazione** = trasformazione dei conti grezzi in un bilancio "gestionale" leggibile (Conto Economico e Stato Patrimoniale riclassificati). Tre schemi alternativi esistono (§ in `docs/MODELLO_FINANZIARIO.md`): **a Margine di Contribuzione** è quello mostrato negli screenshot e lo schema di default.
- **CCN** = Capitale Circolante Netto. **DSO/DIO/DPO/CCC** = indicatori del ciclo del capitale circolante (formule in `docs/MODELLO_FINANZIARIO.md` §6).
- **PFN** = Posizione Finanziaria Netta. **DSCR** = Debt Service Coverage Ratio.

📄 **Riferimento dati/formule completo**: [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md) — è la fonte di verità per ogni calcolo. Questo file (`AGENTS.md`) descrive prodotto e architettura; quello descrive matematica e schema dati.

---

## 2. Stack Tecnologico (proposto)

Stesso pattern validato in produzione su **IrideeCRM** — non ripartiamo da zero su decisioni già prese e testate col cliente:

| Layer | Tecnologia | Note |
|---|---|---|
| Desktop wrapper | **Electron** | EXE installabile, target Win11 (compat Win10 64-bit) |
| Frontend | **React + Tailwind CSS** | Unica codebase per le due varianti |
| Backend interno | **Node.js + Express** | Embedded nell'app Electron (REST sul Master) |
| Database | **SQLite** — valutare **SQLCipher** al posto di `better-sqlite3` puro | dati finanziari (saldi banca, fidi, ricavi) più sensibili dei dati IRIS: DB cifrato a riposo è un buon investimento, non solo DPAPI sui segreti |
| Auth | **JWT** | Token con ruolo embedded |
| Networking | **Tailscale** (primario) + **fallback** (es. Cloudflare Tunnel) | Tailscale come rete privata di default (come IrideeCRM); se l'azienda cliente non riesce a configurarlo, un secondo trasporto di riserva — pattern già usato sul telefono di DaProdSuite ("si fa trovare dalla rete di casa, dal tunnel di Cloudflare o da Tailscale, e il client tiene quello che risponde") |
| Installer | **electron-builder** | Installer `.exe` offline, Tailscale bundled come in IRIS |
| Grafici | **Recharts** o **ECharts** | Per le viste a barre/linee/donut viste negli screenshot (12 grafici diversi tra le 7 schermate) |
| Import Excel | **exceljs** o **SheetJS (xlsx)** | Deve leggere il formato "Piano dei Conti" del cliente (§11.1) |
| Import XML | **fast-xml-parser** | Fatture elettroniche FatturaPA (§11.2) — schema da confermare appena arriva un file reale |

**Differenza voluta rispetto a IRIS**: dati più sensibili (bilanci, fidi bancari, cassa) → vale la pena valutare cifratura del DB a riposo fin dalla Fase 2, non solo cifratura delle credenziali.

---

## 3. Architettura di rete

```
[Azienda Cliente 1 - EXE]  ──┐
[Azienda Cliente 2 - EXE]  ──┤── REST via Tailscale (o fallback) ──►  [CONSULENTE - EXE + Express + SQLite centrale]
[Azienda Cliente N - EXE]  ──┘                                          PC/studio del consulente · archivio completo
```

- Ogni Azienda ha SQLite locale → può inserire dati e consultare i propri KPI **anche offline**.
- Direzione prevalente del traffico: **Azienda → Consulente** (invio Excel/fatture, estratti conto, inserimenti manuali, chart of accounts aggiornato). Il Consulente elabora (riclassifica, configura le % dirette/indirette, lancia simulazioni) e i risultati elaborati sono visibili all'Azienda in sola lettura sul proprio Cliente.
- **Aggiornamenti software**: come IRIS, il Master può distribuire l'installer aggiornato dell'app Cliente alle Aziende (stessa meccanica della cartella "aggiornamenti" scoperta in automatico) — risponde a "*app... per caricare aggiornamenti*" nel senso di "ricevere l'ultima versione", che coesiste con il senso di "caricare i propri dati" (assunzione, da confermare — §14).
- **Trasporto — deciso col cliente**: **Tailscale primario + fallback** (es. Cloudflare Tunnel, stesso pattern del telefono DaProdSuite). L'app Cliente prova Tailscale per primo (IP fisso, più sicuro, coerente con IRIS); se non raggiungibile (azienda che non ha/non sa configurare Tailscale) usa il trasporto di riserva. La status bar (§7) deve indicare **quale dei due è attivo**, non solo "connesso/offline". Tailscale resta comunque un prerequisito installato dall'installer, come in IrideeCRM; il fallback va progettato in Fase 8 insieme al resto del sync — non è detto serva fin dalla Fase 0.

---

## 4. Ruoli e permessi

| Funzionalità | Consulente (Master) | Azienda (Cliente) |
|---|---|---|
| Creare/rimuovere Clienti e Aziende | ✅ | ❌ |
| Vedere tutte le Aziende | ✅ | ❌ (solo la propria) |
| Vista aggregata multi-azienda ("Tutta la rete") | ✅ | ❌ |
| Configurare piano dei conti / % dirette-indirette | ✅ | ❌ (sola lettura, se visibile) |
| Import Excel piano dei conti | ✅ | ❌ |
| Import fatture XML / estratti conto | ✅ | ✅ (per la propria azienda) |
| Inserimento manuale previsioni tesoreria | ✅ | ✅ (proposte; il consulente valida?) — **da chiarire** |
| Dashboard Panoramica / Tesoreria (lettura) | ✅ | ✅ (solo propria azienda) |
| Analisi & Simulazioni (what-if) | ✅ | ❌ |
| Banche e Finanziamenti (gestione fidi) | ✅ | 👁️ sola lettura, forse |
| Ricevere aggiornamenti software | — | ✅ (push dal Master) |

*(tabella da rivedere in Fase 1 col cliente: quanta autonomia dare all'Azienda è una decisione di prodotto, non tecnica)*

---

## 5. Identificatori univoci

- **Cliente**: codice tipo `CLI-{progressivo}`.
- **Azienda**: codice tipo `{CLIENTE}-AZ-{progressivo}` o semplicemente Partita IVA/Codice Fiscale come chiave naturale (**consigliato**: la P.IVA è già un identificativo univoco reale e utile per l'eventuale futura integrazione con Cassetto Fiscale/fatturazione elettronica, che identificano i soggetti per P.IVA/CF).
- Chiave primaria interna di ogni record: **UUID v4**, come in IrideeCRM (il sync usa l'UUID, il codice resta leggibile).
- Ogni movimento importato (riga fattura XML, riga estratto conto) porta anche il riferimento al **documento di origine** (nome file, hash) per tracciabilità e per evitare doppie importazioni.

---

## 6. Sincronizzazione

- Direzione: Azienda ↔ Consulente (il Consulente è la fonte di verità per la configurazione; l'Azienda è la fonte di verità per i propri dati grezzi appena inseriti/importati).
- Strategia: delta dall'ultima sync (come IRIS: `updated_at` + flag `synced`).
- **Attenzione — differenza importante rispetto a IRIS**: in IRIS un conflitto si risolve "vince la Madre" senza troppi rischi (dati operativi di CRM). Qui, un conto economico riclassificato manualmente dal consulente **non deve mai essere sovrascritto silenziosamente** da un nuovo import dell'azienda. Servono conferme esplicite o un log delle modifiche quando due fonti toccano lo stesso periodo/conto. Da progettare con più cura in Fase 6 (vedi §14).
- Ogni record porta: `uuid`, `azienda_id`, `created_at`, `updated_at`, `synced`, `deleted` (soft delete) — come IRIS.

---

## 7. Status bar (sempre visibile, in basso — pattern IRIS confermato dagli screenshot)

Negli screenshot analizzati è già presente in basso: `v1.5.0 · ● Database · ● Server · ● Tailscale · [prodotto] · [Backup] [↻ Aggiorna]`. Riprendiamo lo stesso pattern:

| Indicatore | Verde | Giallo | Rosso |
|---|---|---|---|
| Database locale | Connesso | — | Errore |
| Connessione Consulente (solo lato Azienda) | Online (specificare **via Tailscale** o **via fallback**) | Lenta | Offline |
| Tailscale | Attivo | Non attivo ma fallback in uso | Non attivo, nessun fallback disponibile |
| Ultima sync | Timestamp | — | Mai sincronizzato |

Pulsanti sempre presenti in basso a destra: **Backup** e **↻ Aggiorna** (refresh dati / pull aggiornamenti) — confermato identico in tutti e 7 gli screenshot.

---

## 8. Struttura dati su disco (proposta)

```
Documenti/DaProdFinanza/
├── aziende/[codice-azienda]/
│   ├── import/            (XML fatture, estratti conto, excel caricati — archivio originali)
│   ├── export/             (PDF/Excel esportati: conto economico, SP, scenari)
│   └── backup/
└── backup/                 (backup DB completo, come IRIS: giornaliero, ultimi N conservati)
```

---

## 9. Il motore finanziario (riassunto — dettaglio in `docs/MODELLO_FINANZIARIO.md`)

Estratto dal file Excel del consulente, che è di fatto la specifica funzionale del "cervello" dell'app:

1. **Ogni conto del piano dei conti** ha un TIPO (Ricavo/Costo/Attività/Attività Negativo/Passività) e viene **taggato** in una o più categorie (Ricavi Operativi, Costi Materie Prime, Costi Personale, Immobilizzazioni, Debiti a Breve, ecc.) — il tag determina automaticamente dove il conto finisce nel bilancio riclassificato.
2. **Ogni categoria di costo ha una % di "costo diretto" di default** (es. Costi Materie Prime 100% diretto, Costi Personale 70% diretto, Costi Commerciali/G&A 0% diretto) **ma è configurabile per Azienda** in base al **Tipo di attività** — è la richiesta esplicita del cliente sul tornitore vs pizzeria.
3. **Tre schemi di riclassificazione del Conto Economico** sono definiti (Valore Aggiunto / Margine di Contribuzione / Costo del Venduto) — l'app userà **Margine di Contribuzione** come schema principale (è quello degli screenshot) ma vale la pena esporre anche gli altri due come vista alternativa: sono già specificati, costerebbe poco.
4. **Gli indici di bilancio** (ROE, ROI, ROS, MOL%, indici di liquidità/disponibilità, margini di struttura, BEP, DSO/DIO/DPO/CCC, PFN/EBITDA, DSCR) hanno formule precise ed **entrano tutti nella Fase 3-4** (motore di calcolo) prima ancora della UI.
5. Import previsto in due modalità (§11): **Excel** (il formato che il consulente già usa) è la via più rapida e a basso rischio per il MVP; **XML fatture elettroniche** arricchisce i dati (ricavi/costi puntuali, scadenze) ma richiede un file di esempio reale non ancora fornito.

---

## 10. Moduli funzionali (dagli screenshot — solo la parte "Business", generalizzata da IRIS)

Nota: negli screenshot il modulo vive dentro IRIS con altre tab (Calendario, Camera, Iridologia, Voucher, Magazzino-fotografico, Marketing...) che **non fanno parte di DaProdFinanza**: qui li sostituiamo con anagrafica Clienti/Aziende. Le 7 tab del modulo Business, invece, **sono** DaProdFinanza.

### 10.1 Menu principale / Anagrafica Clienti e Aziende
Schermata iniziale all'apertura dell'app (solo Consulente): elenco Clienti, ognuno con le proprie Aziende; azioni "+ Nuovo cliente", "+ Nuova azienda" (wizard rapido: ragione sociale, P.IVA/CF, forma giuridica — dal dizionario §8 di `docs/MODELLO_FINANZIARIO.md` —, tipo di attività/settore, data inizio collaborazione); rimozione/archiviazione cliente/azienda. Click su un'azienda → entra nella suite Business con selettore "Tutta la rete" per vista aggregata (visto negli screenshot, dropdown in alto a destra su ogni tab).

### 10.2 Panoramica
4 alert card in evidenza (es. "Risultato mese negativo", "Tensione finanziaria tra N giorni", "Margine operativo in calo", "Affidamenti utilizzati oltre soglia") — logica: soglie configurabili che generano avvisi automatici. KPI economici (Ricavi mese/YTD, Margine lordo %, EBITDA/MOL, Utile netto, Break-even) e KPI finanziari (Liquidità, Cash flow mese/30gg, Affidamenti disponibili). 4 grafici: Ricavi vs Costi 12 mesi, EBITDA/MOL 12 mesi, Utile netto 12 mesi, Liquidità storico+previsione con marcatore "OGGI".

### 10.3 Conto Economico
Selettore periodo (Mese/YTD/Anno/Budget/Anno precedente) + selettore mese. 6 KPI card in testa (Ricavi Totali, Margine Lordo, Margine Contribuzione, EBITDA/MOL, Utile Netto, Break-even) ognuna con confronto vs periodo precedente. Tabella "Conto Economico Gestionale Riclassificato" a 4 colonne (mese corrente, YTD, Budget, anno precedente) × (valore €, % sui ricavi) — righe = lo schema a Margine di Contribuzione di `docs/MODELLO_FINANZIARIO.md` §3.2. A lato: grafico 12 mesi Ricavi/Costi/EBITDA, donut composizione costi, barra Break-even vs Ricavi con margine di sicurezza.

### 10.4 Stato Patrimoniale
⚠️ Negli screenshot compare l'avviso *"Lo Stato Patrimoniale è stato caricato manualmente. È possibile modificarlo e aggiornarlo anno per anno"* con pulsante "Modifica dati" — a differenza del Conto Economico (mensile, presumibilmente alimentato da import ricorrenti), lo **Stato Patrimoniale è a cadenza annuale e a inserimento/import manuale**. Due tabelle (Attivo; Passivo e Patrimonio Netto) con confronto anno corrente vs anno precedente (valore + variazione €/%.) secondo lo schema di `docs/MODELLO_FINANZIARIO.md` §4. Pannello indicatori: CCN, PFN, PFN/EBITDA, Current Ratio, Quick Ratio, Debt/Equity, DSCR. Grafici: andamento CCN, composizione attivo (donut), composizione passivo+PN (donut). Pulsante "Esporta dettaglio SP".

### 10.5 Capitale Circolante
KPI: Crediti Commerciali, Magazzino, Debiti Fornitori, CCN (ognuno vs fine anno precedente) + card di alert testuale generata automaticamente (es. "i clienti pagano mediamente N giorni più tardi rispetto allo scorso anno" quando il DSO peggiora oltre soglia). Tabella indicatori DSO/DIO/DPO/CCC con definizione, valore periodo corrente vs stesso periodo anno precedente, variazione, sparkline 12 mesi. Grafico andamento CCC 24 mesi con media mobile. Tabella dettaglio componenti (Crediti commerciali, Magazzino, Altri crediti, Debiti fornitori, Altri debiti correnti) con variazioni e note automatiche ("Aumento scaduti > 60gg", "Rotazione migliorata", ...) — **queste note sembrano generate da regole automatiche sulle variazioni, non scritte a mano: da progettare come motore di "insight" testuali**, prima cosa "intelligente" del prodotto, anche senza AI vera e propria. Grafico trend 12 mesi DSO/DIO/DPO/CCC sovrapposti.

### 10.6 Tesoreria / Cash Flow (+ Scadenziario)
6 KPI: Liquidità oggi, Incassi prossimi 30gg, Pagamenti prossimi 30gg, Cash Flow previsto 30gg, Liquidità prevista tra 30gg, Affidamenti disponibili. Tabella "Previsione di Tesoreria" a orizzonti multipli (7/30/60/90gg, 6 mesi) con Liquidità iniziale → Entrate per categoria → Uscite per categoria → Cash Flow → Liquidità finale prevista. Grafico Consuntivo + Previsione + soglia minima di liquidità, marcatore "OGGI". Tabella "Previsioni manuali inserite" (editabile: data, descrizione, categoria, importo, tipo, azioni) accanto alle previsioni automatiche. **Nota dal file di note del cliente**: la previsione deve combinare storico + previsioni manuali + un orizzonte di 12-18 mesi per capire "se i numeri sono questi cosa devo fare per crescere" — questo secondo pezzo (raccomandazioni) non è negli screenshot, è un'estensione proposta (§11.5). Sotto-tab: Cash Flow (Previsione), Incassi (Corrispettivi), Pagamenti, Altre Entrate/Uscite, **Scadenziario** (il nome composto del file immagine suggerisce che Tesoreria e Scadenziario sono la stessa area — lo scadenziario clienti/fornitori alimenta le previsioni di incasso/pagamento).

### 10.7 Banche e Finanziamenti
5 KPI: Affidamenti totali accordati/utilizzati/disponibili, N. istituti di credito, Rata mensile complessiva. Tabella "Situazione Bancaria" per banca (accordato/utilizzato/disponibile/utilizzo%) + donut "Utilizzo affidamenti per tipologia" (Fido di cassa, Anticipo fatture/SBF, Carte, Leasing, Mutui, Finanziamenti). Sotto-tab per tipologia di linea di credito, ognuno con tabella di dettaglio (es. "Fido di Cassa" per banca/linea/scadenza). Tabella "Finanziamenti Attivi" (importo originario, debito residuo, rata, tasso, scadenza, prossima rata). Nota di collegamento esplicito: *"Le rate dei finanziamenti e dei leasing vengono automaticamente considerate nel Cash Flow previsionale"* → §10.6 e §10.7 condividono dati (le rate finanziamento alimentano le uscite previste in Tesoreria).

### 10.8 Analisi & Simulazioni ("Cosa succede se...")
Il modulo più sofisticato: selettore di scenario (salvabile/nominabile), pannello variabili modificabili in 3 gruppi — **Economiche** (Ricavi %, Costo merci %, Costi variabili %, Personale ± dipendenti con relativo costo, Altri costi fissi %), **Capitale Circolante** (DSO/DIO/DPO target), **Investimenti e Finanziamenti** (nuovo investimento, nuovo finanziamento con durata/tasso/preammortamento) — con pulsante "Ripristina valori attuali". Output: card di confronto Situazione Attuale vs Scenario Simulato su 8 indicatori chiave (Ricavi, Margine Lordo %, EBITDA/MOL, Utile Netto, Break-even, Cash Flow annuo, Liquidità finale 12 mesi, Indebitamento/PFN), grafico a barre di confronto Conto Economico, grafico linea cash flow attuale vs simulato con soglia di liquidità minima, tabella dettaglio impatti con note automatiche, riepilogo investimento/finanziamento (rata mensile, totale interessi, impatto su ammortamenti). Pulsanti "Esporta scenario" e "Vai alla Tesoreria/Cash Flow". Questo modulo è **puro calcolo derivato** dagli altri moduli (nessun dato nuovo, solo un layer di "what-if" sopra Conto Economico + Tesoreria + Banche) — conviene costruirlo per ultimo, quando gli altri motori di calcolo sono stabili.

### 10.9 Import dati (nuovo, non in uno screenshot dedicato ma richiesto esplicitamente)
- Import Excel "Piano dei Conti" (formato cliente, §11.1) → popola/aggiorna piano dei conti + saldi di un'Azienda per un periodo.
- Import XML fatture elettroniche (§11.2) → righe di ricavo/costo puntuali + scadenziario (date di incasso/pagamento attese).
- Import CSV/Excel estratto conto bancario → movimenti di cassa consuntivi (alternativa manuale all'open banking, disponibile da subito).
- Ogni import produce un **riepilogo pre-conferma** (righe riconosciute, righe da mappare manualmente, eventuali duplicati) prima di scrivere sul database — mai import "silenzioso" su dati contabili.

### 10.10 Configura (Piano dei Conti & Regole)
Dietro il pulsante "Configura" visto in alto a destra su ogni tab: mapping conto → categoria di riclassificazione, % costo diretto/indiretto per conto (con default dal Tipo di attività, sovrascrivibile), soglie per gli alert di Panoramica, soglia minima di liquidità per Tesoreria, parametri di scadenza/pagamento di default per lo Scadenziario.

---

## 11. Import e integrazioni dati

### 11.1 Import Excel "Piano dei Conti" — confermato dal cliente, priorità massima
**Chiarito col cliente (non era un file XML come nel brief iniziale, era un refuso: intendeva proprio questo Excel):** *"devono potersi integrare anche i file excel"* — l'import Excel non è un'ipotesi di lavoro, è **il meccanismo di caricamento dati confermato e ricorrente**. Il consulente userà file **simili** a `Piano Dei Conti Indy Gennaio 2026.xlsx` (6 fogli: `PIANO DEI CONTI`, `Costi Diretti Indiretti`, `INDICI DI BILANCIO`, `RICLASSIFICAZIONI C.E.`, `RICLASSIFICA S.P.`, `DICTIONARY` — schema completo in `docs/MODELLO_FINANZIARIO.md`) per ogni cliente e periodo.

⚠️ **"Simili" implica variabilità** — file di clienti/periodi diversi non saranno byte-identici (righe compilate diverse, forse qualche colonna in più/meno, intestazioni leggermente diverse). L'importer **non deve fare affidamento su numeri di riga fissi**: deve riconoscere le sezioni dalle intestazioni di categoria (colonna `Descrizione`, es. "RICAVI OPERATIVI", "COSTI MATERIE PRIME"...) e dai nomi di colonna in riga 1, con un **riepilogo pre-conferma** (righe riconosciute / non riconosciute / da mappare a mano) prima di scrivere sul database — mai un import "silenzioso" su dati contabili. Questo è ora un requisito, non solo una buona pratica.

### 11.2 Import XML fatture elettroniche (FatturaPA) — non richiesto ora, resta come idea futura
Il "file XML" annunciato nel brief iniziale **non esisteva**: il cliente ha confermato che si trattava di un refuso e intendeva l'Excel (§11.1). Non c'è quindi, al momento, una richiesta reale di import FatturaPA — la ricerca fatta sul tracciato (blocchi `FatturaElettronicaHeader`/`FatturaElettronicaBody`, `TipoDocumento` TD01/TD04/TD05, oltre 200 campi) resta valida **se e quando** servirà, ma va trattata come idea di Fase futura (collegata al Cassetto Fiscale, §11.4) e non come requisito MVP. Non investire tempo di progettazione qui finché non arriva una richiesta esplicita con un file reale.

### 11.3 Collegamento opzionale a DaProd IRIS o altri gestionali
Richiesta esplicita: *"standalone... che volendo si può collegare a DaProd IRIS oppure ad altri programmi"*. Architettura proposta: un layer di **connettori** (interfaccia comune, implementazioni intercambiabili) — Excel import, XML import, e in Fase successiva un **connettore IRIS** (IRIS espone già un server REST embedded sulla Madre per il proprio sync interno; un connettore di sola lettura potrebbe leggere ricavi/costi aggregati da lì via Tailscale, per un'azienda che usa anche IRIS) e connettori futuri per altri gestionali. Nessun collegamento è mai obbligatorio: l'Excel/import manuale deve sempre funzionare da solo.

### 11.4 Cassetto Fiscale — Agenzia delle Entrate (Fase futura, non MVP)
Ricerca aggiornata (2026): l'Agenzia delle Entrate ha **da poco reso disponibili API ufficiali di interoperabilità** per il cassetto fiscale (D.Lgs. 1/2024), accessibili a contribuenti e intermediari abilitati registrati su Entratel/Fisconline, con adesione a condizioni di utilizzo (durata 5 anni) e credenziali tecniche dedicate. **Ad oggi il primo (e unico) servizio attivo è lo scarico massivo delle Certificazioni Uniche 2024/2025**: nuovi servizi sono annunciati "progressivamente" ma non ancora specificati. Implicazione pratica: la richiesta del cliente ("collegamento diretto all'Agenzia delle Entrate", "il sistema deve popolarsi in automatico") è **oggi tecnicamente parziale**, non un collegamento completo a fatture/F24/dichiarazioni. Da trattare come roadmap a medio termine, monitorando l'ampliamento dei servizi, non come funzione MVP.

### 11.5 Open Banking (Fase futura, non MVP)
Per "automatismi open banking" la strada realistica **non è** che DaProdFinanza diventi un soggetto AISP autorizzato (regolamentazione pesante, sproporzionata per questo prodotto), ma **integrare un aggregatore PSD2 già autorizzato** (es. CBI Globe — il consorzio interbancario italiano, oppure player come Fabrick, Tink, Salt Edge) che espone un'unica API su più banche italiane. Da valutare costi/contratti con l'aggregatore prima di impegnarsi: è un'integrazione commerciale, non solo tecnica.

### 11.6 Pianificazione fiscale (Fase futura)
Nota cliente: *"pianificazione fiscale per sapere quante tasse si pagano indicativamente"*. Il calcolo dipende dalla **forma giuridica** dell'Azienda (già nel dizionario del cliente: SRL/SPA → IRES 24% + IRAP regionale ~3,9%; Ditta individuale/società di persone → IRPEF a scaglioni + contributi). Proposta: un modulo di stima (non una dichiarazione fiscale vera) agganciato al Conto Economico riclassificato e alle Analisi & Simulazioni, con aliquote configurabili per anno/regione.

### 11.7 Marginalità multi-dimensionale (Fase futura)
Nota cliente: *"pianificazione del margine per cliente, per commessa, per sede operativa, per linea di business"*. Richiede tag a livello di singola registrazione (non solo di conto) — commessa/cliente/sede/linea — e un Conto Economico "analitico" filtrabile per ciascuna dimensione. Va oltre il controllo di gestione classico per conto: è **contabilità analitica**, modulo separato e sostanzioso, da pianificare come fase dedicata dopo che il motore base è solido.

### 11.8 Assistente numeri (idea, da validare col cliente)
La nota *"se i numeri sono questi cosa devo fare per crescere?"* suggerisce un layer di suggerimenti, non solo di numeri. IRIS ha già un modulo `ai/` con ChatGPT OAuth + LM Studio locale, e DaProdSuite integra LM Studio per i testi: stesso pattern qui — un pannello che, leggendo KPI/trend/simulazioni, genera un commento testuale (mai un consiglio di investimento vincolante: solo lettura dei dati, "il margine di sicurezza si è ridotto di X, il DSO è peggiorato di Y giorni"). Da proporre al cliente come possibile elemento "sorpresa" del prodotto, non da costruire prima che il resto sia stabile.

---

## 12. Sicurezza

- Password: **scrypt** (come IRIS). Sessione: **JWT** con segreto per-installazione.
- Credenziali di sync cifrate con **DPAPI** (`safeStorage` Electron), mai in chiaro su disco — come IRIS.
- **Novità proposta rispetto a IRIS**: dati finanziari (saldi banca, fidi, utili) sono più sensibili di un CRM fotografico → valutare **SQLite cifrato (SQLCipher)** invece di `better-sqlite3` in chiaro, fin dalla Fase 2 (è una scelta di libreria iniziale, costosa da cambiare dopo).
- Comunicazione Consulente↔Azienda solo su rete privata Tailscale (mai esposto su internet pubblico).
- File importati (XML/Excel) conservati come originali in `import/` per audit — mai solo il dato estratto.

---

## 13. Fasi di sviluppo (roadmap proposta — da validare con Opus/cliente)

| Fase | Obiettivo | Output testabile | Stato |
|---|---|---|---|
| **0** | Setup repo, scaffolding Electron+React+Tailwind+Express+SQLite | App che si avvia, finestra vuota | ⬜ Da iniziare |
| **1** | Auth JWT + ruoli Consulente/Azienda + anagrafica Clienti/Aziende (§10.1) | Login + CRUD Clienti/Aziende | ⬜ |
| **2** | Schema DB completo del motore finanziario (piano dei conti, tag, saldi, periodi) | Schema applicato, migrazioni versionate | ⬜ |
| **3** | Motore di riclassificazione + indici (da `docs/MODELLO_FINANZIARIO.md`), **import Excel §11.1** | Import di un vero file cliente → Conto Economico riclassificato corretto | ⬜ |
| **4** | UI Business: Panoramica + Conto Economico + Stato Patrimoniale (§10.2-10.4) | Le 3 schermate con dati reali importati | ⬜ |
| **5** | UI Capitale Circolante + Tesoreria/Cash Flow + Scadenziario (§10.5-10.6) | Previsione di cassa funzionante su dati reali | ⬜ |
| **6** | UI Banche e Finanziamenti (§10.7) + collegamento rate→Cash Flow | Fidi/finanziamenti con impatto visibile in Tesoreria | ⬜ |
| **7** | Analisi & Simulazioni (§10.8) | Scenario what-if salvabile e confrontabile | ⬜ |
| **8** | Sync Consulente↔Azienda via Tailscale (§6) + status bar (§7) | Due installazioni reali che si scambiano dati | ⬜ |
| **9** | Import Excel avanzato: tolleranza a varianti di formato tra clienti/periodi (§11.1) | Import robusto su più file Excel reali diversi tra loro | ⬜ |
| **10** | Installer offline (electron-builder) per Consulente e Azienda | `.exe` funzionanti, Tailscale bundled | ⬜ |
| **11+** | Integrazioni Fase futura: connettore IRIS, Cassetto Fiscale, Open Banking, pianificazione fiscale, marginalità multi-dimensionale, assistente numeri | Una alla volta, dopo validazione col cliente | ⬜ |

---

## 14. Punti aperti

**Risolti (sessione di analisi iniziale):**

1. ~~File XML di esempio mancante~~ → **chiarito**: era un refuso, il cliente intendeva l'Excel (§11.1). Nessun file XML esiste o è richiesto ora; FatturaPA resta solo un'idea di fase futura (§11.2).
2. ~~"Tailscale" o "Tailcat"?~~ → **deciso**: Tailscale primario + trasporto di fallback (tipo Cloudflare Tunnel). Dettaglio in §2/§3/§7.
3. ~~Licenza e visibilità della repo pubblica~~ → **deciso**: repo pubblica, licenza **MIT**, metodologia inclusa senza restrizioni in `docs/MODELLO_FINANZIARIO.md`. Resta comunque valida la regola di §0: i **file originali** (screenshot con branding IRIS, Excel col nome del cliente reale "Indy") non vanno mai committati — è una questione di riservatezza del singolo cliente del consulente, non di apertura della metodologia in sé.

**Ancora aperti (da chiarire col cliente durante lo sviluppo):**

4. **Autonomia dell'app Azienda**: può inserire previsioni di tesoreria manuali da sola, o sono sempre proposte che il Consulente valida? Cambia il modello di sync (§6).
5. **Multi-utente per Azienda**: un solo operatore per azienda cliente o più persone con ruoli diversi (es. titolare + suo commercialista interno)?
6. **Magazzino**: serve solo la "valorizzazione contabile" (rimanenze iniziali/finali per il conto economico e il DIO) o anche gestione scorte operativa (SKU, giacenze fisiche, carico/scarico)? La nota cliente su "logiche di controllo gestione di magazzino" e "calcolo rimanenze" sembra puntare alla prima, più semplice; ma va confermato.
7. **Nome/branding definitivo**: confermare "DaProdFinanza" come nome finale prodotto + repo.
8. **Nome dell'app Cliente**: per coerenza con `IrideeCRM` / `IrideeCRM Satellite`, proposta `DaProdFinanza` / `DaProdFinanza Cliente` — confermare.

---

*File master — da tenere aggiornato ad ogni fase, come `AGENTS.md` di IrideeCRM. Il dettaglio matematico/schema-dati vive in [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md), non qui.*
