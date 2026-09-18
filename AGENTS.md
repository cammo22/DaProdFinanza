# DaProdFinanza — Project Brief per Claude Code

> Documento master di progetto — generato da sessione di analisi e pianificazione DaProdProduzioni
> Settore: software di controllo di gestione per consulenti finanziari aziendali (commercialisti, advisor, temporary manager)
> Stato: **in sviluppo — Fasi 0, 1, 2 e 4 completate, Fase 3 quasi** (impalcatura, auth, anagrafica, motore di calcolo, prime tre schermate). Prossima: Fase 5. Dettaglio in §13-bis.
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
| Database | **SQLite cifrato** — `better-sqlite3-multiple-ciphers` (SQLCipher) ✅ *deciso, §14.9* | dati finanziari (saldi banca, fidi, ricavi) più sensibili dei dati IRIS: DB cifrato a riposo fin dalla Fase 0, non solo DPAPI sui segreti |
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
- **Novità rispetto a IRIS — decisa e implementata in Fase 0**: dati finanziari (saldi banca, fidi, utili) sono più sensibili di un CRM fotografico → **SQLite cifrato** con `better-sqlite3-multiple-ciphers` (SQLCipher) invece di `better-sqlite3` in chiaro. La chiave a 256 bit è generata al primo avvio e protetta da DPAPI; i backup ereditano la stessa cifratura.
- Comunicazione Consulente↔Azienda solo su rete privata Tailscale (mai esposto su internet pubblico).
- File importati (XML/Excel) conservati come originali in `import/` per audit — mai solo il dato estratto.

---

## 13. Fasi di sviluppo (roadmap proposta — da validare con Opus/cliente)

| Fase | Obiettivo | Output testabile | Stato |
|---|---|---|---|
| **0** | Setup repo, scaffolding Electron+React+Tailwind+Express+SQLite | App che si avvia, finestra vuota | ✅ **Fatta** (sessione 1) |
| **1** | Auth JWT + ruoli Consulente/Azienda + anagrafica Clienti/Aziende (§10.1) | Login + CRUD Clienti/Aziende | ✅ **Fatta** (sessione 1) |
| **2** | Schema DB completo del motore finanziario (piano dei conti, tag, saldi, periodi) | Schema applicato, migrazioni versionate | ✅ **Fatta** (sessione 1) |
| **3** | Motore di riclassificazione + indici (da `docs/MODELLO_FINANZIARIO.md`), **import Excel §11.1** | Import di un vero file cliente → Conto Economico riclassificato corretto | 🟡 **Quasi**: motore, indici e import fatti e verificati. Manca il file di un cliente **con i saldi**: quello consegnato è un modello vuoto (vedi `docs/MODELLO_FINANZIARIO.md` §8-bis) |
| **4** | UI Business: Panoramica + Conto Economico + Stato Patrimoniale (§10.2-10.4) | Le 3 schermate con dati reali importati | ✅ **Fatta** (sessione 1) — menu laterale e grafici compresi |
| **5** | UI Capitale Circolante + Tesoreria/Cash Flow + Scadenziario (§10.5-10.6) | Previsione di cassa funzionante su dati reali | ✅ **Fatta** (sessione 2) |
| **6** | UI Banche e Finanziamenti (§10.7) + collegamento rate→Cash Flow | Fidi/finanziamenti con impatto visibile in Tesoreria | ✅ **Fatta** (sessione 2) |
| **7** | Analisi & Simulazioni (§10.8) | Scenario what-if salvabile e confrontabile | ✅ **Fatta** (sessione 2) |
| **8** | Sync Consulente↔Azienda via Tailscale (§6) + status bar (§7) | Due installazioni reali che si scambiano dati | ⬜ Prossima |
| **9** | Import Excel avanzato: tolleranza a varianti di formato tra clienti/periodi (§11.1) | Import robusto su più file Excel reali diversi tra loro | ⬜ |
| **10** | Installer offline (electron-builder) per Consulente e Azienda | `.exe` funzionanti, Tailscale bundled | 🟡 **Parziale**: `.exe` installabile, portable e demo funzionanti. Mancano le due varianti separate e Tailscale bundled, che hanno senso solo dopo la Fase 8. **Regola del cliente (2026-09-16): una release a ogni aggiornamento importante, sempre con i tre eseguibili — installer, portable e demo** (`npm run dist` e `npm run dist:demo`). La prima così è la v0.0.5, con le Fasi 5 e 6 |
| **11+** | Integrazioni Fase futura: connettore IRIS, Cassetto Fiscale, Open Banking, pianificazione fiscale, marginalità multi-dimensionale, assistente numeri | Una alla volta, dopo validazione col cliente | ⬜ |

### 13-bis. Stato alla fine della sessione 1 (Fasi 0 → 4)

**Struttura del progetto** — `electron-vite` + TypeScript, come da §2:

```
src/
├── main/          processo Electron: finestra, DB cifrato, server Express
│   ├── db/        apertura DB + migrazioni versionate (user_version)
│   ├── lib/       percorsi su disco (§8), segreti DPAPI, scrypt, JWT, UUID
│   └── server/    REST: routes/ + services/ + middleware di auth
├── preload/       unico ponte main↔renderer (contextIsolation attivo)
├── renderer/      React + Tailwind v4
└── shared/        tipi ed enum condivisi (dizionario §8 del modello)
```

**Cosa funziona oggi**

- App Electron che si avvia con finestra funzionante (`npm run dev`, `npm run build` + `npx electron .`).
- **Database cifrato a riposo** con `better-sqlite3-multiple-ciphers` (SQLCipher) — vedi §14 punto 9. Chiave a 256 bit generata al primo avvio e custodita con `safeStorage`/DPAPI, mai in chiaro su disco. Verificato: il file `.db` non ha l'header `SQLite format 3`.
- Migrazione `001_initial`: tabelle `clients`, `companies`, `users`, tutte con i campi di sync di §6 (`uuid`, `created_at`, `updated_at`, `synced`, `deleted`) già previsti, pur senza sync attivo.
- **Auth JWT** con password scrypt (§12) e segreto JWT per-installazione. Primo avvio → creazione dell'account Consulente; poi login normale.
- **Selettore di ruolo all'avvio**: due card, *Consulente* e *Azienda*, che rendono esplicito il modello a due varianti di §1 prima ancora del login. La scelta non dà alcun potere di per sé — determina solo quale login viene mostrato — ma il server rifiuta con un messaggio esplicito un account che non corrisponde alla porta scelta ("Questo è un account Azienda. Torna indietro e scegli Azienda."). Uscendo si torna alle card, non al login dell'ultimo ruolo usato.
- **I due ruoli di §4**: il Consulente gestisce tutti i clienti e le aziende; l'operatore Azienda entra direttamente nella propria azienda e riceve 403 su clienti e su ogni scrittura. Gating applicato lato server, non solo in UI.
- **Anagrafica Clienti/Aziende (§10.1)**: elenco clienti con le rispettive aziende, wizard "+ Nuovo cliente" e "+ Nuova azienda" (ragione sociale, P.IVA/CF, forma giuridica, tipo di attività, data inizio collaborazione), archiviazione e rimozione (soft delete di §6), ricerca, creazione delle credenziali per l'app Azienda.
- Codici leggibili progressivi di §5: `CLI-0001`, `CLI-0001-AZ-01`. P.IVA univoca quando presente.
- Cartelle di lavoro di §8 create automaticamente alla nascita di un'azienda (`import/`, `export/`, `backup/`).
- **Status bar di §7** con indicatori Database/Server/Tailscale e i pulsanti Backup e ↻ Aggiorna. Il backup produce un file cifrato in `Documenti/DaProdFinanza/backup/`.

**Account dimostrativi (`src/main/db/seed.ts`)**

| Ruolo | Username | Password |
|---|---|---|
| Consulente | `cammo` | `1234` |
| Azienda | `Pizzeria DaProd` | `1234` |

Insieme creano il cliente *Gruppo DaProd* e l'azienda *Pizzeria DaProd S.r.l.*, e le credenziali sono mostrate direttamente sulle card di scelta ruolo (con un pulsante che compila e accede).

⚠️ **Il seed non deve finire in un'installazione reale**: sono credenziali note, con password sotto la policy degli 8 caratteri. Gira solo con `npm run dev` oppure `npm run demo` (che imposta `DAPROD_DEMO=1`), e solo su un database ancora vuoto. Le password create dalla UI restano soggette alla policy. **Da rimuovere prima della Fase 10 (installer).**

**Eseguibili (anticipo parziale della Fase 10)**

`npm run dist` produce due file in `release/`, entrambi x64:

| File | A cosa serve |
|---|---|
| `DaProdFinanza-Setup-<versione>.exe` | Installer NSIS: sceglie la cartella, crea i collegamenti. Disinstallando **non** cancella i dati (restano in `%APPDATA%` e in Documenti). |
| `DaProdFinanza-<versione>-portable.exe` | Nessuna installazione: si lancia e basta. Utile per provarla su una macchina senza toccare il sistema. |

Il binding nativo del database cifrato sta fuori dall'archivio `asar` (`asarUnpack`), altrimenti non sarebbe caricabile a runtime. Verificato sull'eseguibile pacchettizzato: apre il database, autentica e mostra l'anagrafica; il seed dimostrativo resta correttamente spento.

⚠️ **Gli eseguibili non sono firmati**: al primo avvio Windows SmartScreen mostra "PC protetto da Windows" e serve *Ulteriori informazioni → Esegui comunque*. Per toglierlo serve un certificato di code signing (OV o EV), che è un acquisto, non una riga di configurazione. Da decidere prima della distribuzione vera.

**Una sola variante, per ora.** §13 prevede due installer, Consulente e Azienda. Oggi il selettore di ruolo (§10.1) copre entrambi con lo stesso eseguibile: separarli ha senso quando l'app Azienda avrà davvero un comportamento diverso, cioè dopo la Fase 8 (sync). Anticiparlo adesso vorrebbe dire mantenere due build che fanno la stessa cosa.

**Versione**: si parte da `0.0.1`. Il numero è mostrato nella status bar e nelle schermate di accesso.

**Cosa è volutamente un segnaposto**

- Le sette viste Business (§10.2-§10.8) mostrano solo l'elenco dei moduli con la fase in cui arriveranno: senza motore di riclassificazione, riempirle di dati finti su un gestionale contabile sarebbe fuorviante.
- L'indicatore Tailscale resta grigio: il trasporto Consulente↔Azienda è Fase 8. Il server Express ascolta oggi **solo su 127.0.0.1** con porta effimera.

**Fase 2 — schema del motore finanziario** (migrazione `002_financial_model`)

Traduce in tabelle `docs/MODELLO_FINANZIARIO.md` §1 e §2. Nessuna formula: il calcolo è Fase 3.

| Tabella | Cosa tiene |
|---|---|
| `account_sections` | Le 24 sezioni di §2, con prospetto (CE/SP), TIPO prevalente, comportamento variabile/fisso e % di costo diretto di default |
| `section_tags` | I tag applicati a ogni conto della sezione |
| `section_detail_tags` | Le alternative fra cui il singolo conto ne sceglie una — le voci separate da "/" in §2.3-§2.4 |
| `accounts` | Il piano dei conti di una singola azienda |
| `company_section_settings` | La % di costo diretto per azienda (§2.2, §7: "il tornitore e la pizzeria") |
| `fiscal_periods` | Anno oppure mese (§1); il conto economico è mensile, lo stato patrimoniale annuale (§10.4) |
| `account_balances` | I saldi, per conto × periodo × scenario (consuntivo/budget/forecast, §3.4) |
| `import_documents` | Nome e impronta SHA-256 dei file importati (§5, §12): tracciabilità e blocco dei doppioni |

Tre scelte di modellazione da conoscere:

1. **Gli importi sono interi in centesimi** (`amount_cents`), non numeri in virgola mobile. Su un bilancio riclassificato si sommano centinaia di righe: con i float una somma può sfalsare di 0,01 e far "non quadrare" attivo e passivo — l'errore che toglie fiducia a uno strumento di controllo di gestione. La conversione a euro avviene al bordo (import, UI, export). *(Non è specificato nel modello finanziario: è una decisione di implementazione.)*
2. **I tag sono di due specie.** Quelli di `section_tags` valgono per ogni conto della sezione; quelli di `section_detail_tags` sono alternative fra cui scegliere. La distinzione viene dalle tabelle §2.3-§2.4, dove le voci separate da "/" non sono cumulative: un conto di Liquidità Differite è crediti commerciali *oppure* crediti diversi *oppure* erario c/IVA. Senza questa distinzione il DSO (§6), che vuole i soli crediti commerciali, non sarebbe calcolabile.
3. **`ATTIVITA' NEGATIVO` sta sul conto, non sulla sezione.** Un fondo ammortamento vive dentro Immobilizzazioni Materiali: è il singolo conto a essere rettificativo, non la sezione.

Il catalogo delle sezioni è **dato scritto nella migrazione**, non costanti nel codice: a runtime la fonte di verità è il database, e cambiare la metodologia richiede una nuova migrazione. Si legge da `GET /api/reference/sections`.

`npm run verify:schema` apre il database reale, prova 20 inserimenti che devono essere accettati o rifiutati e chiude con ROLLBACK: verifica i CHECK, le chiavi esterne e gli indici univoci senza lasciare traccia.

**Fase 3 — motore di calcolo e import Excel**

Il motore vive in `src/shared/engine/` ed è fatto di **funzioni pure**: non sa che esiste un database. Riceve una lista di conti con i loro saldi e restituisce prospetti e indici. È una scelta deliberata — le formule sono la parte più delicata del prodotto, e così sono verificabili in isolamento, senza montare mezza applicazione attorno.

| Modulo | Cosa fa |
|---|---|
| `aggregates.ts` | Somma i saldi per sezione. I fondi (`ATTIVITA' NEGATIVO`) si sottraggono dentro la loro sezione |
| `income-statement.ts` | I tre schemi di §3, con il Margine di Contribuzione come predefinito |
| `balance-sheet.ts` | Lo stato patrimoniale di §4, più il capitale circolante netto |
| `ratios.ts` | Gli indici di §5 e il ciclo del circolante di §6 |

**Convenzione di segno**: i costi sono positivi, e sono le formule a sottrarli. Vale anche per i debiti nel passivo.

**Un indice indefinito vale `null`, non zero.** Un rapporto con denominatore zero non è zero: mostrarlo come "0%" racconterebbe una bugia su un bilancio. La UI deve scrivere "—".

**Import Excel (§11.1)**: `src/main/import/chart-of-accounts.ts` legge il file riconoscendo le sezioni dalle intestazioni di categoria e le colonne dai nomi in prima riga — mai da numeri di riga fissi. Produce un **riepilogo pre-conferma** (righe riconosciute, righe da mappare a mano, doppioni, impronta del file) e non scrive nulla: la scrittura è una chiamata separata, in una sola transazione, che rifiuta di sovrascrivere un periodo già caricato senza conferma esplicita e un periodo chiuso in ogni caso. L'originale viene archiviato in `aziende/<codice>/import/` prima di toccare il database.

**Come è stato verificato**

- **34 test** (`npm run test`), fra cui la prova che conta: i tre schemi di §3 arrivano allo stesso EBIT e allo stesso utile. Se una formula viene trascritta male, lì si spacca.
- Due test girano sul **file vero del consulente**, quando è presente in locale: riconosce tutte e 24 le sezioni, zero righe da mappare a mano.
- La **catena completa** (Excel → parser → database → motore → REST) è stata percorsa con un piano dei conti costruito sugli stessi numeri della fixture dei test: conto economico, stato patrimoniale e tutti gli indici coincidono con i valori verificati in isolamento.

⚠️ **Tre punti aperti emersi leggendo il file, dettagliati in [`docs/MODELLO_FINANZIARIO.md` §8-bis](./docs/MODELLO_FINANZIARIO.md)**: il file consegnato è un **modello vuoto** (nessun saldo), il Gross Profit di §3.3 non torna con la riga di partenza dello stesso schema, e due grandezze (Acquisti, Debiti finanziari) non hanno una fonte esplicita nel modello.

**Fase 4 — le schermate di analisi**

Navigazione a **menu laterale**, come nei mockup: in alto l'anagrafica, sotto le viste dell'azienda aperta, in fondo quelle non ancora costruite — elencate e spente, con la fase accanto. Un menu che si allunga a sorpresa disorienta più di uno che dichiara cosa manca. La navigazione vive nel guscio dell'applicazione e non dentro le pagine, così resta ferma mentre il contenuto cambia.

| Vista | Cosa mostra |
|---|---|
| **Panoramica** (§10.2) | Avvisi automatici sulle soglie di §5, KPI economici e finanziari, quattro grafici |
| **Conto Economico** (§10.3) | Prospetto a quattro colonne, selettore fra i tre schemi di §3, grafici |
| **Stato Patrimoniale** (§10.4) | Attivo, passivo, capitale circolante netto e tutti gli indici con le loro soglie |
| **Import dati** (§10.9) | Scelta del file, riepilogo pre-conferma, scrittura |

Le viste leggono **lo stesso payload di analisi**: un solo calcolo per periodo, tre modi di guardarlo.

**Conto economico a quattro colonne**: periodo, progressivo da inizio anno, budget e stesso periodo dell'anno precedente, ognuna con valore e % sui ricavi. Le colonne senza dati non compaiono — una colonna di trattini occupa spazio senza dire niente, una di zeri racconterebbe un'azienda a fatturato zero. `schemeLines()` è separata da `incomeStatement()` proprio per questo: le colonne di confronto hanno gli aggregati di altri periodi ma non i loro conti.

**Gli avvisi della Panoramica sono regole esplicite**, non un modello che indovina: confronti sulle soglie del foglio del consulente, e ognuno dice da quale numero arriva ("Margine operativo al 12,3% — positivo dal 15% in su"). È il primo tassello dell'idea di §11.8.

**Grafici** (Recharts): serie ricavi/costi/EBITDA, barre di EBITDA e utile, andamento della liquidità, composizione dei costi a ciambella, barra del break-even col margine di sicurezza. Le serie leggono l'endpoint `/series`, che calcola gli aggregati di ogni periodo caricato; sotto i due periodi il riquadro dice perché è vuoto invece di disegnare una linea piatta che sembrerebbe un dato. Donut e break-even bastano di un periodo solo.

Nella serie, "costi totali" sono i costi operativi **prima degli ammortamenti**: così `ricavi − costi = EBITDA` esattamente, e le tre linee si leggono senza doverci credere sulla parola.

**Due dettagli di formattazione che su un bilancio contano**: un indice indefinito si scrive "—", mai "0%"; e il raggruppamento delle migliaia resta sempre attivo anche a quattro cifre, perché in colonna "2000 €" sopra "1.050.000 €" sembra un errore di battitura.

**Migrazione 003 — correzione di un vincolo della 002.** L'indice univoco su `(company_uuid, sha256)` di `import_documents` nasceva da §5, che chiede di *riconoscere* le doppie importazioni: ma riconoscere non è vietare. Lo stesso identico file si importa legittimamente più volte — come budget e come consuntivo, o su due periodi quando si riusa un modello — e il vincolo lo impediva con un errore di database invece di una spiegazione. Il riconoscimento resta nell'anteprima, dove serve. `npm run verify:schema` contiene ora il controllo di regressione, e usa anni e codici che non possono scontrarsi con dati veri.

**Versione dimostrativa** (`npm run dist:demo` → `release/demo/DaProdFinanza-Demo-<versione>-portable.exe`)

Un eseguibile portable che parte già con la Pizzeria DaProd e i suoi bilanci caricati: 2025 mese per mese più il bilancio annuale, 2026 fino ad agosto, budget 2026. Serve a far provare il programma a pieno regime senza dover preparare un file Excel. I numeri sono inventati ma coerenti — stagionalità da pizzeria, imposte che seguono l'utile, stato patrimoniale che quadra per costruzione — e stanno in `src/main/db/demo-data.ts`.

Tre garanzie, perché una demo con credenziali note non deve mai confondersi con l'app vera:

1. **Flag di build, non di runtime.** `__DEMO_BUILD__` è sostituito da electron-vite: nella build normale vale `false` e il codice che ne dipende sparisce dal pacchetto. Lo accende solo `dist:demo`, che alla fine ricompila `out/` senza flag.
2. **Dati separati.** La demo usa `%APPDATA%\DaProdFinanza Demo` e `Documenti\DaProdFinanza Demo`, con un proprio appId: può convivere con l'app vera sulla stessa macchina senza toccarne database né chiave.
3. **Striscia sempre visibile** in cima a ogni schermata: "Versione dimostrativa — i dati sono di esempio".

**La vista si apre sul periodo più recente con dati a consuntivo**, non sul più recente in assoluto. È emerso collaudando l'eseguibile demo: il budget copre tutto il 2026, quindi il periodo più recente era dicembre — un mese senza consuntivo — e la prima schermata che un tester vedeva era vuota. L'elenco dei periodi porta ora gli scenari che hanno saldi, e nel menu un periodo senza lo scenario scelto lo dichiara ("Dicembre 2026 · solo budget") invece di farlo scoprire aprendolo.

**PFN/EBITDA e DSCR sull'EBITDA degli ultimi 12 mesi.** §5 li definisce così, ma il motore usava l'EBITDA del periodo: su un mese il debito sembrava dodici volte più pesante, e con dati realistici la Panoramica accendeva un allarme rosso sull'indebitamento che non esisteva. Ora su un periodo mensile si sommano i dodici mesi che terminano con quello scelto; se ne manca anche uno l'indice resta indefinito. È emerso costruendo i bilanci della demo — la fixture dei test era annuale, e lì le due cose coincidono.

⚠️ **Resta aperto, da chiarire col consulente**: ROE e ROI confrontano un flusso (utile, EBIT) con uno stock (patrimonio, capitale investito). §5 non dice di annualizzarli, quindi su un mese valgono circa un dodicesimo del valore annuale. Il bilancio annuale li mostra corretti.

### 13-ter. Sessione 2 — modello Excel e Fase 5

**Modello Excel scaricabile.** Provando la versione portatile, un'azienda appena creata restava bloccata: l'unica porta d'ingresso dei dati è l'import, che vuole il file del consulente. Ora *Import dati* (e la schermata vuota di un'azienda senza bilancio) offre **Scarica il modello Excel**: stesse intestazioni e sezioni che l'import riconosce, TIPO a tendina, sotto-classificazioni a "X" solo dove la sezione le prevede, un foglio ISTRUZIONI, e i conti già presenti dell'azienda. Un test genera il modello dalle 24 sezioni della migrazione 002, lo compila e lo reimporta senza perdite (`src/main/import/template.test.ts`).

**Fase 5 — Capitale Circolante (§10.5)**

| Pezzo | Dove |
|---|---|
| Componenti, variazioni, media mobile, note automatiche | `src/shared/engine/working-capital.ts` |
| Confronti e storia a 24 mesi | `src/main/server/services/working-capital.service.ts` |
| Schermata | `src/renderer/src/pages/business/WorkingCapitalView.tsx` |

Le card confrontano con **la fine dell'anno precedente** (dicembre, o il bilancio annuale se dicembre manca), la tabella degli indici con **lo stesso periodo dell'anno prima**: sono i due confronti dei mockup. La media mobile del CCC è a **3 mesi** e si calcola solo su mesi consecutivi.

Le **note automatiche** sono regole, come chiede §6 del modello, con soglie che il modello non fissa (§9): un indice di ciclo si segnala da **5 giorni** di differenza, una componente da **±10%**, i crediti scaduti da oltre 60 giorni quando pesano almeno il **10%** dei crediti aperti. Sono in `SOGLIE_NOTE`, un punto solo. ⚠️ Da validare col consulente. Un aumento di DPO è una nota **neutra**: pagare più tardi aiuta la cassa ma può essere un segnale di tensione.

**Fase 5 — Tesoreria / Cash Flow e Scadenziario (§10.6)**

Migrazione `004_treasury`:

| Tabella | Cosa tiene |
|---|---|
| `treasury_items` | Ogni movimento atteso. `source` distingue le fatture dello **scadenziario**, le **previsioni manuali** (anche mensili ricorrenti) e — dalla Fase 6 — le rate dei **finanziamenti**. Documento, condizioni e modalità di pagamento dal DICTIONARY (§8 del modello). Incassi parziali in `paid_cents`: lo stato "Pagata / Non pagata / Pagamento parziale" si ricava, non si memorizza |
| `company_treasury_settings` | Soglia minima di liquidità e ultimo saldo di banca noto |

`docs/MODELLO_FINANZIARIO.md` **non definisce la previsione di cassa**: le regole di `src/shared/engine/treasury.ts` sono scelte di implementazione, dichiarate nel codice e da validare col consulente.

1. **La previsione è una somma di movimenti datati**, nessuna proiezione statistica: ogni euro si ritrova in una riga.
2. **Liquidità di partenza** = il più recente fra il saldo inserito a mano e le liquidità immediate dell'ultimo bilancio a consuntivo, più incassi e pagamenti registrati dopo quella data.
3. **Le scadenze passate e non saldate entrano oggi**, marcate come scadute: un credito scaduto è ancora un incasso atteso. **Le previsioni manuali passate invece si scartano**: erano stime, il consuntivo le ha superate.
4. **Condizioni di pagamento** (RD, DF, FM — il file non le spiega): RD e DF = data documento + giorni; FM = data documento + giorni, poi a fine mese. È la lettura d'uso comune.
5. **Orizzonti** 7, 30, 60, 90 giorni e 6 mesi, cumulati da oggi. La **tensione finanziaria** è il primo giorno in cui la liquidità prevista scende sotto la soglia minima (sotto zero, se la soglia non c'è), cercato giorno per giorno: un campionamento settimanale potrebbe saltarlo. È anche l'avviso "Tensione finanziaria tra N giorni" della Panoramica (§10.2), insieme a quello sui pagamenti scaduti.

La **Panoramica** ora mostra liquidità di oggi, cash flow a 30 giorni e il grafico con storico e previsione, soglia minima e marcatore OGGI. "Affidamenti disponibili" resta un trattino fino alla Fase 6.

**Permessi**: l'operatore Azienda vede tesoreria e scadenziario ma non li modifica. È la scelta prudente finché resta aperto §14 punto 4 (autonomia dell'app Azienda), che cambia il modello di sync.

**Dati della demo**: scadenziario e previsioni della Pizzeria DaProd hanno **date relative al giorno del primo avvio** (`src/main/db/demo-treasury.ts`): una previsione guarda avanti da oggi, e una demo aperta fra sei mesi con tutte le scadenze nel passato mostrerebbe solo arretrati. Ci sono di proposito un credito scaduto da oltre 60 giorni, un incasso parziale e un pagamento scaduto. Un database demo creato da una versione precedente riceve la tesoreria al primo avvio, una volta sola. La **rata del mutuo** è per ora una previsione manuale: col modulo Banche diventerà un finanziamento vero.

**Due correzioni emerse lungo la strada**

- **Serie storica**: mescolava mesi e bilancio annuale sullo stesso asse (un punto annuale in mezzo ai mesi vale dodici volte gli altri), e applicava il limite di 24 punti prima di scartare i periodi senza saldi, così i mesi di solo budget rubavano posto alla storia.
- **Palette**: alcune tonalità usate dall'interfaccia (`ink-500`, `ink-200`, `brand-200`) non erano definite, e i testi secondari uscivano bianchi.

**Verifiche**: 54 test (`npm run test`), fra cui la previsione di cassa calcolata a mano giorno per giorno; `npm run verify:schema` passa da 22 a 35 controlli con i vincoli della 004; percorso completo provato nell'app: incasso parziale che aggiorna liquidità e previsione, fattura "60 giorni fine mese" con scadenza calcolata, aggiornamento di un database demo della 0.0.4.

**Fase 6 — Banche e Finanziamenti (§10.7)**

Migrazione `005_banks`:

| Tabella | Cosa tiene |
|---|---|
| `banks` | Gli istituti dell'azienda, società di leasing comprese. Nome univoco per azienda, senza distinguere le maiuscole |
| `credit_lines` | Linee a revoca: fido di cassa, anticipo fatture/SBF, carte, altre. Accordato e utilizzato a una data; l'utilizzato può superare l'accordato (uno sconfinamento è un dato, non un errore) |
| `loans` | Mutui, finanziamenti e leasing: **i parametri del piano, non le rate** |

**Le rate non si copiano da nessuna parte.** Il piano di ammortamento si ricalcola sempre dagli stessi parametri (`src/shared/engine/loans.ts`) e le rate entrano nella previsione di cassa come movimenti `source = 'finanziamento'` generati al volo. Una sola fonte: modificare un mutuo aggiorna subito la tesoreria, senza righe orfane. Per lo stesso motivo la demo non ha più la "rata del mutuo" come previsione manuale: un database demo della Fase 5 la perde al primo avvio, altrimenti la rata si conterebbe due volte.

Il modello del consulente non tratta i piani di ammortamento: la matematica è quella standard, con queste scelte dichiarate.

1. **Francese** (rata costante) o **italiano** (quota capitale costante), con **preammortamento** di soli interessi.
2. **Tasso nominale annuo** diviso per il numero di rate dell'anno, come nei piani bancari italiani.
3. **Leasing**: rata costante con **riscatto** pagato una rata dopo l'ultima; il valore attuale di rate e riscatto dà il capitale. Un maxi-canone iniziale si registra come movimento a parte.
4. **Arrotondamento al centesimo** rata per rata; l'ultima assorbe i residui e chiude il debito esattamente (a zero, o al riscatto).
5. **Le rate già scadute si considerano pagate**: in Italia sono quasi sempre addebitate in automatico. Il debito residuo è quello dopo l'ultima rata scaduta.

Verificato con i numeri da manuale: 12.000 € al 6% in 12 rate mensili danno la rata francese di 1.032,80 €.

**DSCR finalmente calcolato** (§5): EBITDA degli ultimi 12 mesi ÷ rate dei 12 mesi successivi alla **fine del periodo analizzato**, riscatti compresi. Legarlo alla fine del periodo e non a oggi rende il valore di un periodo stabile, qualunque giorno lo si guardi. Senza finanziamenti resta un trattino.

**Situazione per istituto**: per i finanziamenti accordato e utilizzato coincidono col debito residuo, come nella Centrale Rischi. **Disponibile e percentuale di utilizzo guardano solo le linee a revoca**: un finanziamento è utilizzato al 100% per definizione, e una società di leasing sarebbe sempre "in allarme". Il disponibile si somma linea per linea: lo sconfinamento di una carta non toglie disponibilità al fido di un'altra linea.

**Collegamenti con le altre viste**: la Tesoreria mostra gli affidamenti disponibili (senza contarli come liquidità) e le rate nella categoria "Rate finanziamenti"; la Panoramica avvisa quando gli affidamenti sono utilizzati **dall'80%** in su (rosso dal 95%) — l'avviso "Affidamenti utilizzati oltre soglia" dei mockup, con una soglia che il modello non fissa; lo Stato Patrimoniale mostra il DSCR con la soglia di 1,25x.

**Il modulo di inserimento mostra la rata mentre lo si compila**, calcolata dallo stesso motore del server: è il modo più rapido per accorgersi di un tasso o di un numero di rate sbagliato. Ogni finanziamento ha il suo piano completo consultabile.

**Dati della demo**: tre istituti, quattro linee (una quasi esaurita, da rinegoziare), un mutuo francese, un leasing col riscatto e un finanziamento trimestrale all'italiana ancora in preammortamento, tutti con date relative al primo avvio.

**Verifiche**: 68 test (14 sul motore dei finanziamenti); `npm run verify:schema` a 48 controlli; nell'app: finanziamento creato e modificato dal modulo con la rata ricalcolata (leasing 24.000 € al 6,1% con riscatto 2.400 € → 520,47 €), rate dentro la previsione di cassa, DSCR sullo stato patrimoniale, aggiornamento di un database demo della Fase 5.

**Da fare in Fase 7**: Analisi & Simulazioni (§10.8), che ora ha tutti i motori sotto: conto economico, circolante, tesoreria e finanziamenti.

**Versione 0.0.5 — Fasi 5 e 6 pubblicate** con i tre eseguibili. Collaudo fatto sugli eseguibili, non sul codice:

- **Demo da zero**: `DaProdFinanza-Demo-0.0.5-portable.exe --user-data-dir=<cartella temporanea>`. Il flag di build della demo ora cede a uno `--user-data-dir` esplicito (switch standard di Chromium), così un primo avvio si prova senza toccare la demo già presente. Verificati 25 periodi, 23 scadenze, 3 istituti, 4 linee, 3 finanziamenti, DSCR, note del circolante.
- **Demo aggiornata**: una demo della 0.0.4 riceve migrazioni 004-005, tesoreria e banche al primo avvio, con i bilanci invariati.
- **Portable normale da zero**: parte dal primo avvio, nessun dato di esempio, nessuna striscia demo; un'azienda senza bilancio ha tesoreria e banche vuote ma funzionanti.

⚠️ **Nota per chi sviluppa da Claude desktop su Windows**: l'app è un pacchetto MSIX, e i processi che lancia vedono `%APPDATA%` *virtualizzata* (`%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming`) sovrapposta a quella vera. Una cartella "DaProdFinanza Demo" può quindi esistere due volte, con chiavi diverse, e rinominarla da lì non fa quello che sembra. Per le prove da zero si usa `--user-data-dir`, mai rinominare le cartelle dati.

Corretta anche la grammatica delle note automatiche ("Magazzino in calo…: libera liquidità").

**Fase 7 — Analisi & Simulazioni (§10.8)**

| Pezzo | Dove |
|---|---|
| Motore dello scenario e dettaglio impatti | `src/shared/engine/simulation.ts` |
| Base (12 mesi, patrimonio, liquidità, finanziamenti), scenari, esportazione Excel | `src/main/server/services/simulation.service.ts` |
| Schermata | `src/renderer/src/pages/business/SimulationView.tsx` |
| Scenari salvati | migrazione `006_simulation_scenarios` |

**Il calcolo gira nella schermata.** Il server prepara la base; lo scenario lo calcola lo stesso motore condiviso direttamente nel renderer, così ogni leva mossa aggiorna i risultati all'istante. L'esportazione Excel usa lo stesso motore sul server: schermata e file non possono divergere.

**Uno scenario salvato è solo l'elenco delle variazioni**, in JSON. I risultati si ricalcolano sempre sulla base corrente: uno scenario di marzo riaperto a settembre ragiona sui numeri di settembre. Salvare è del Consulente; simulare ed esportare anche dell'operatore Azienda, perché non cambia nessun dato.

**La base** sono i 12 mesi che terminano col periodo scelto (tutti obbligatori: altrimenti la schermata dice quali mancano) oppure un bilancio annuale. Un mese solo porterebbe dentro la sua stagionalità.

**Il confronto è fra due proiezioni fatte allo stesso modo**: la situazione attuale è lo stesso calcolo con le leve a zero, sui 12 mesi da oggi.

Il modello del consulente non tratta le simulazioni: le regole sono scelte dichiarate nel codice, da validare con lui.

1. **I costi variabili seguono i ricavi** (materie prime e produzione); "prezzo merci" e "costi di produzione" sono variazioni di prezzo sopra l'effetto volume. Rimanenze ferme.
2. **"Altri costi fissi"** = commerciali + generali. Il personale ha la sua leva (dipendenti × costo annuo), gli ammortamenti seguono gli investimenti.
3. **Imposte** all'aliquota effettiva della base; 24% (IRES) se la base non ha utile.
4. **Circolante**: i crediti seguono i ricavi, magazzino e fornitori gli **acquisti**. Il magazzino non segue il costo del venduto perché nel modello questo comprende personale diretto e ammortamenti, e un forno nuovo farebbe crescere le scorte. Un obiettivo di giorni sposta la voce in proporzione. La variazione assorbe (o libera) cassa nei primi tre mesi.
5. **Cash flow annuo** = EBITDA − imposte − variazione del circolante − investimenti + nuovi finanziamenti − rate dei 12 mesi (esistenti e nuove). Straordinari esclusi.
6. **Investimento** pagato subito e ammortizzato a quote costanti; **finanziamento** incassato subito, francese, prima rata dopo un mese.
7. **PFN fra 12 mesi** = debiti finanziari di oggi − capitale rimborsato + nuovo debito residuo − liquidità finale.

Otto indicatori a confronto (ricavi, margine lordo, EBITDA, utile, break-even, cash flow, liquidità e PFN fra 12 mesi), grafico a barre del conto economico, liquidità mese per mese con la soglia minima, dettaglio degli impatti con la nota che dice da dove arriva ogni differenza, riepilogo di investimento e finanziamento, **Esporta scenario** in Excel e **Vai alla Tesoreria**.

**Verifiche**: 80 test (11 sulle simulazioni: +10% di ricavi calcolato a mano, dipendenti, investimento con lo scudo fiscale dell'ammortamento, finanziamento con la PFN che torna al centesimo, giorni obiettivo, leve fuori scala); `npm run verify:schema` a 51 controlli; nell'app: leve mosse, scenario salvato e riaperto, esportazione Excel riletta, base rifiutata con i mesi mancanti elencati.

**Il menu non ha più voci "in arrivo"**: tutte le sette viste di §10 esistono.

### Sessione 3 — versione 1.0.0 (pubblicata prima come 0.1.0)

Richieste dell'utente: tasto di aggiornamento da GitHub, dati inseriti nel programma
invece che in Excel, report PDF, grafica e idee da Ever Gauzy senza stravolgere il
concept, riquadri spostabili con la disposizione ricordata. Nulla di quello che
c'era è stato tolto.

| Pezzo | Dove |
|---|---|
| Aggiornamenti (controllo, download verificato, installazione) | `src/main/updates.ts`, `src/shared/updates.ts`, `components/UpdateDialog.tsx` |
| Piano dei conti e saldi nel programma | `services/ledger.service.ts`, `routes/ledger.routes.ts`, `pages/business/{DataView,BalancesEditor,AccountsEditor}.tsx` |
| Report PDF | `src/main/report.ts`, `pages/report/ReportPage.tsx` |
| Cruscotto a widget e strisce di indicatori | `pages/business/Dashboard.tsx`, `components/widgets.tsx` |
| Riquadri spostabili | `components/Disposizione.tsx` |

**Aggiornamenti.** Un solo meccanismo per le tre copie, senza electron-updater e senza
file in più da pubblicare: si legge `releases/latest` dall'API di GitHub, si sceglie
l'eseguibile per nome (installer / portable / demo: la demo non diventa mai la
versione vera), lo si scarica verificando l'impronta **SHA-256 che GitHub calcola**
(campo `digest` dell'asset: senza impronta non si scarica), si fa un backup del
database e si installa. L'installer va in modalità silenziosa di aggiornamento
(`--updated /S --force-run`, stessa cartella dal registro); il portable salva il nuovo
file accanto al vecchio, lo avvia (passando l'eventuale `--user-data-dir`) e al primo
avvio la versione nuova toglie la copia superata. Controllo all'avvio e ogni 6 ore; in
sviluppo solo a mano. **Conseguenza per le release: i nomi dei tre file non vanno
cambiati**, e le release devono restare non-prerelease.

**Dati contabili.** L'import Excel resta, ma la strada normale è scrivere nel
programma. `saveBalances` riceve solo i conti toccati e aggiorna riga per riga (un
importo `null` toglie il saldo): i saldi non cambiati restano com'erano, con la loro
origine, e alla sincronizzazione (Fase 8) viaggeranno solo le differenze. Le regole
sono quelle dell'import: periodo chiuso intoccabile, codice unico, tipo coerente con
la sezione (nell'attivo si può scegliere `ATTIVITA' NEGATIVO`), dettaglio fra le voci
della sezione. Un conto con saldi non si elimina, si disattiva. Il *piano di partenza*
crea un conto per sezione e, nelle sezioni con voci di dettaglio (crediti, debiti,
utili), un conto per voce con il nome della voce del modello: nessuna classificazione
inventata.

**Report PDF.** Una pagina React impaginata per A4, aperta in una finestra nascosta
larga 794 px (`#report` nell'URL, parametri e token passati via IPC, mai nell'URL) e
stampata con `printToPDF` e i numeri di pagina. Legge le stesse API delle schermate
con i permessi di chi esporta; le sezioni senza dati non compaiono; grafici a misura
fissa e senza animazioni. In sviluppo `DAPROD_REPORT_TEST_DIR` salta il dialogo (solo
con `app.isPackaged === false`).

**Ever Gauzy.** È AGPL-3.0 (e Angular): copiarne codice obbligherebbe a rilasciare
tutto DaProdFinanza sotto AGPL. Se ne sono prese **solo idee** — striscia di indicatori
con barre a segmenti, schede scorrevoli, elenchi con barrette di proporzione, "Gestisci
widget", aggiornamento automatico, menu ⋮ per widget — riscritte da zero.

**Riquadri spostabili.** `Disposizione` avvolge il contenitore di una schermata (e le
griglie al suo interno): ogni figlio diretto ha una maniglia. Eventi del puntatore,
non il drag and drop HTML5 (partiva male da un pulsante e perdeva la maniglia uscendo
dal riquadro): l'ordine cambia mentre si trascina, scambiando solo oltre la metà del
bersaglio, e vicino ai bordi del contenitore che scorre la pagina scorre da sola. Un
clic sulla maniglia (movimento sotto i 5 px) apre invece il menu In cima / Su / Giù /
In fondo: chi fatica a trascinare sposta con precisione. Le chiavi dei blocchi sono quelle che `Children.toArray` assegna per
posizione nel codice, quindi stabili anche se un blocco condizionale sparisce.
L'ordine sta in `localStorage` per schermata: è una comodità di chi guarda, non un
dato da sincronizzare.

### Versione 1.1.0 — pannelli liberi, zoom, scenari pronti, demo Mac

| Pezzo | Dove |
|---|---|
| Griglia a pannelli (incastro, spostamento, ridimensionamento) | `components/Pannelli.tsx` (sostituisce `Disposizione`) |
| Zoom | `lib/zoom.ts`, `webFrame` nel preload, controllo in `StatusBar.tsx` |
| Scenari pronti | `shared/engine/scenari-pronti.ts` (+ test), `SimulationView.tsx` |
| Demo per Mac | `electron-builder.demo.yml` (sezioni `mac`/`dmg`), `.github/workflows/mac-demo.yml` |

**Pannelli.** Griglia a 12 colonne, righe da 10 px. Un pannello è `{x, y, w, h, auto}`.
Dopo ogni cambiamento c'è la compattazione verticale ("incastro"): i pannelli salgono
al primo posto libero; durante un'operazione il pannello mosso è fisso e gli altri si
adattano. Altezza automatica (misurata con `ResizeObserver`) finché non la si cambia a
mano; dopo il contenuto scorre dentro. Figli diretti di `<Pannelli>` = pannelli a
tutta larghezza; `<Griglia colonne={2|3}>` si scioglie in pannelli affiancati (un
figlio con `col-span-N` resta largo N colonne della griglia). Il cruscotto è diventato
l'hook `useCruscotto`: intestazione sopra la griglia, widget come pannelli.
Disposizione in `localStorage` per schermata **e per fascia di larghezza** (stretto
< 1100 px, standard < 2000, ampio): 1080p, 2K e 5K hanno ognuno la propria. Menu
*Pannelli* nell'intestazione: ripristina (evento `daprod:ripristina-pannelli`) e
blocca. Motore scritto da zero, senza librerie: serviva il controllo pieno su
scorrimento automatico e bordi illuminati.

**Scorrimento automatico.** La prima versione partiva anche con il mouse fermo vicino
al bordo e superava i 1000 px in mezzo secondo. Ora: solo dopo 12 px di movimento,
accelerazione quadratica nella fascia di 70 px, massimo 14 px per fotogramma, mai
durante un ridimensionamento laterale. Le posizioni si ricalcolano a ogni fotogramma
dal puntatore e dal rettangolo della griglia, quindi lo scorrimento non fa saltare il
pannello.

**Zoom.** `webFrame.setZoomFactor`, salvato in `localStorage`. Senza scelta:
`min(1, screen.width / 1920)` arrotondato al 5% — un 1080p al 125% (1536 px logici)
va all'80%, 2K e 5K Apple (2560 logici) al 100%. In Chromium lo zoom vale per origine,
quindi anche per la finestra nascosta del report: verificato che il PDF esce identico
con lo zoom all'80% (`printToPDF` impagina sulla carta, non sulla finestra).

**Scenari pronti.** 14 ipotesi scelte da noi (6 positive, 3 negative, 3 imprevisti, 2
estreme). Importi in proporzione ai ricavi annui della base, giorni a partire da
quelli attuali. I due estremi (ricavi +300% / −80%…) servono solo al collaudo: nome
"ESTREMO … (solo test)" e avviso rosso sopra i risultati. Da validare col consulente
come le altre regole della simulazione.

**Demo per Mac.** Solo demo, solo DMG, arm64 e x64. Si costruisce sul runner
`macos-latest` di GitHub (il modulo nativo del database va compilato per macOS),
automaticamente a ogni release pubblicata o a mano con il tag; i DMG si aggiungono
alla release. Firma ad-hoc (`identity: '-'`, necessaria sui chip Apple), niente
notarizzazione: al primo avvio serve *Apri comunque*. Gli aggiornamenti sul Mac
(`kind: 'mac'`) aprono la pagina della release: senza firma Apple il programma non
può sostituirsi da solo. **Non è stata provata su un Mac vero**: serve un tester.

**Collegamento Consulente↔Azienda (Fase 8) — decisione presa con l'utente:** niente
account Tailscale. Si valuta **Tailcat** (Tailscale, BSD-3, agosto 2026): nessun
account, il consulente mostra un indirizzo-codice che l'azienda inserisce, canale
WireGuard cifrato, porte TCP inoltrate (`tailcat serve` / `tailcat forward`), chiave
salvata per un indirizzo stabile e `--allow` per le chiavi client. Limiti da tenere
presenti: passa dai relay DERP gratuiti di Tailscale (senza garanzie; si può
installare un relay proprio), progetto giovane senza stabilità di API. Il trasporto
va isolato dietro un'interfaccia, così da poterlo sostituire.

---

## 14. Punti aperti

**Risolti (sessione di analisi iniziale):**

1. ~~File XML di esempio mancante~~ → **chiarito**: era un refuso, il cliente intendeva l'Excel (§11.1). Nessun file XML esiste o è richiesto ora; FatturaPA resta solo un'idea di fase futura (§11.2).
2. ~~"Tailscale" o "Tailcat"?~~ → **deciso**: Tailscale primario + trasporto di fallback (tipo Cloudflare Tunnel). Dettaglio in §2/§3/§7.
3. ~~Licenza e visibilità della repo pubblica~~ → **deciso**: repo pubblica, licenza **MIT**, metodologia inclusa senza restrizioni in `docs/MODELLO_FINANZIARIO.md`. Resta comunque valida la regola di §0: i **file originali** (screenshot con branding IRIS, Excel col nome del cliente reale "Indy") non vanno mai committati — è una questione di riservatezza del singolo cliente del consulente, non di apertura della metodologia in sé.

**Risolti (sessione 1 — Fasi 0/1):**

9. ~~SQLCipher o `better-sqlite3` puro?~~ (§2, §12) → **deciso col cliente**: database **cifrato fin dalla Fase 0**, con `better-sqlite3-multiple-ciphers` (API drop-in di `better-sqlite3`, cifratura SQLCipher-compatibile). Motivo: è una scelta di libreria costosa da cambiare dopo, e rimandarla avrebbe significato migrare DB già popolati. Chiave a 256 bit protetta da DPAPI (`safeStorage`), come per i segreti di sync.

**Ancora aperti (da chiarire col cliente durante lo sviluppo):**

4. **Autonomia dell'app Azienda**: può inserire previsioni di tesoreria manuali da sola, o sono sempre proposte che il Consulente valida? Cambia il modello di sync (§6).
5. **Multi-utente per Azienda**: un solo operatore per azienda cliente o più persone con ruoli diversi (es. titolare + suo commercialista interno)?
6. **Magazzino**: serve solo la "valorizzazione contabile" (rimanenze iniziali/finali per il conto economico e il DIO) o anche gestione scorte operativa (SKU, giacenze fisiche, carico/scarico)? La nota cliente su "logiche di controllo gestione di magazzino" e "calcolo rimanenze" sembra puntare alla prima, più semplice; ma va confermato.
7. **Nome/branding definitivo**: confermare "DaProdFinanza" come nome finale prodotto + repo.
8. **Nome dell'app Cliente**: per coerenza con `IrideeCRM` / `IrideeCRM Satellite`, proposta `DaProdFinanza` / `DaProdFinanza Cliente` — confermare.

---

*File master — da tenere aggiornato ad ogni fase, come `AGENTS.md` di IrideeCRM. Il dettaglio matematico/schema-dati vive in [`docs/MODELLO_FINANZIARIO.md`](./docs/MODELLO_FINANZIARIO.md), non qui.*
