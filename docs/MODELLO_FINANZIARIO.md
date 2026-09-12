# Modello Finanziario — Motore di Riclassificazione e Indici

> Fonte: file di lavoro Excel del consulente (piano dei conti + riclassificazioni + indici di
> bilancio), analizzato ed estratto in forma generalizzata — nomi di clienti reali e valori
> rimossi. Il file originale **non** è incluso in questa repo (vedi [`AGENTS.md`](../AGENTS.md) §0).
> Questo documento è la fonte di verità per ogni formula usata dall'app: prima di implementare
> un calcolo diverso da quanto scritto qui, verificare col cliente.

---

## 1. Tipi di conto

Ogni riga del piano dei conti ha un `TIPO`:

| Tipo | Significato |
|---|---|
| `RICAVO` | Componente positiva di conto economico |
| `COSTO` | Componente negativa di conto economico |
| `ATTIVITA'` | Voce dell'attivo di stato patrimoniale |
| `ATTIVITA' NEGATIVO` | Voce rettificativa dell'attivo (es. fondo ammortamento, fondo svalutazione) |
| `PASSIVITA'` | Voce del passivo/patrimonio netto |

`PERIODO` di un conto è quasi sempre `Anno` (dato annuale/di periodo), ma il dizionario prevede anche periodi mensili (`Gennaio anno corrente` … `Dicembre anno corrente`) per i piani di budget/consuntivo mese per mese.

---

## 2. Schema di classificazione del Piano dei Conti

Il piano dei conti è organizzato in **sezioni**; ogni conto appartiene a una sezione e **eredita automaticamente** un insieme di tag di riclassificazione. Questo è il cuore dell'automatismo richiesto dal cliente ("il sistema deve popolarsi in automatico"): classificare un conto = scegliere la sua sezione, tutto il resto (a che riga del conto economico/stato patrimoniale riclassificato contribuisce, se è EBITDA/EBIT/ecc.) segue da qui.

### 2.1 Sezioni Ricavi (`TIPO = RICAVO`)

| Sezione | Tag applicati |
|---|---|
| Ricavi Operativi | Ricavi Totali, Ricavi Operativi, contribuisce a EBITDA/EBIT/Gross Profit/Utile, Vendite |
| Rimanenze Finali (di ricavo/rettifica) | Ricavi Totali, Rimanenze Finali, Variazione Rimanenze |
| Proventi Straordinari | Ricavi Totali, Proventi Straordinari, Vendite |
| Proventi Finanziari | Ricavi Totali, Proventi Finanziari |

### 2.2 Sezioni Costi (`TIPO = COSTO`)

Ogni sezione costo ha anche una **% di costo diretto di default** (quanta parte del costo è imputabile direttamente al prodotto/servizio venduto vs. indiretta/struttura). Sono le percentuali di partenza suggerite dal consulente — **sovrascrivibili per Azienda** in base al Tipo di attività (vedi §7):

| Sezione | Tag applicati | % Costo Diretto (default) |
|---|---|---|
| Esistenze Iniziali | Costi Variabili, Rimanenze Iniziali | 100% |
| Costi Materie Prime | Costi Variabili, Costi Materie Prime | 100% |
| Costi Produzione | Costi Variabili, Costi Produzione | 100% |
| Ammortamenti Operativi | Costi Fissi, Ammortamenti Operativi | 0% |
| Costi Personale | Costi Fissi, Costi Personale | **70%** |
| Costi Commerciali | Costi Fissi, Costi Commerciali | 0% |
| Costi Generali e Amministrativi | Costi Fissi, Costi G&A | 0% |
| Ammortamenti Non Operativi | Costi Fissi, Ammortamenti Non Operativi | 0% |
| Oneri Straordinari | Costi Fissi, Oneri Straordinari | 0% |
| Oneri Finanziari | Costi Fissi, Oneri Finanziari | 0% |
| Imposte | Costi Variabili, Imposte | 0% |

Ogni sezione costo contribuisce anche, a cascata, a: Margine Operativo Lordo (EBITDA) → Reddito Operativo (EBIT) → Gross Profit → Utile/Perdita di esercizio, secondo lo schema di riclassificazione scelto (§3).

### 2.3 Sezioni Stato Patrimoniale — Attivo (`TIPO = ATTIVITA'` / `ATTIVITA' NEGATIVO`)

| Sezione | Tag applicati |
|---|---|
| Immobilizzazioni Immateriali | Attivo Fisso Netto, Capitale Investito |
| Immobilizzazioni Materiali | Attivo Fisso Netto, Capitale Investito |
| Immobilizzazioni Finanziarie | Attivo Fisso Netto, Capitale Investito |
| Rimanenze Finali (di magazzino) | Attivo Circolante, Capitale Investito, **Magazzino** (pianificazione finanziaria) |
| Liquidità Differite | Attivo Circolante, Capitale Investito, **Crediti Commerciali / Crediti Diversi / Erario c/IVA** |
| Liquidità Immediate | Attivo Circolante, Capitale Investito, **Cassa/cc Banca** |

`Attivo Fisso Netto` + `Attivo Circolante` = **Capitale Investito** = **Totale Attivo**.

### 2.4 Sezioni Stato Patrimoniale — Passivo (`TIPO = PASSIVITA'`)

| Sezione | Tag applicati |
|---|---|
| Patrimonio Netto | Totale Passivo, **Utile a nuovo / Utile** (riserve + risultato) |
| Debiti a Medio/Lungo Termine | Totale Passivo, **Fondo TFR / Debiti Diversi** |
| Debiti a Breve Termine | Totale Passivo, **Debiti Diversi / Debiti v/Fornitori (costi variabili o fissi) / Debiti v/Enti Previdenziali** |

`Patrimonio Netto` + `Debiti M/L` + `Debiti a Breve` = **Totale Passivo** (= Totale Attivo).

---

## 3. Riclassificazione del Conto Economico — 3 schemi alternativi

Il file del consulente definisce **tre schemi classici** della dottrina italiana di bilancio riclassificato, tutti calcolabili dagli stessi conti taggati (§2). L'app userà **il Margine di Contribuzione (3.2)** come schema principale/di default (è quello degli screenshot analizzati), ma vale la pena esporre anche gli altri due come "vista alternativa" nel Conto Economico: sono dati che derivano dagli stessi tag, il costo di calcolarli è basso.

### 3.1 A Valore Aggiunto

```
  Ricavi Operativi + Rimanenze Finali
− Costi Materie Prime + Rimanenze Iniziali
− Costi Produzione
− Costi Generali e Amministrativi
− Costi Commerciali
= VALORE AGGIUNTO
− Costi Personale
= MARGINE OPERATIVO LORDO (EBITDA)
− Ammortamenti Operativi e Non Operativi
= REDDITO OPERATIVO (EBIT)
− Oneri Finanziari
+ Proventi Finanziari
− Oneri Straordinari
+ Proventi Straordinari
= UTILE ANTE IMPOSTE
− Imposte
= UTILE/PERDITA
```

### 3.2 A Margine di Contribuzione (schema principale — usato negli screenshot)

```
  Ricavi Operativi + Rimanenze Finali
− Costi Variabili (esclusi oneri finanziari, straordinari e imposte)
= MARGINE DI CONTRIBUZIONE
− Costi Fissi (esclusi oneri finanziari, straordinari e imposte, esclusi ammortamenti)
= MARGINE OPERATIVO LORDO (EBITDA / MOL)
− Ammortamenti (operativi + non operativi)
= REDDITO OPERATIVO (EBIT)
− Oneri Finanziari
+ Proventi Finanziari
− Oneri Straordinari
+ Proventi Straordinari
= UTILE ANTE IMPOSTE
− Imposte
= UTILE/PERDITA
```

> Nota di implementazione: il file sorgente colloca gli Ammortamenti dentro "Costi Fissi" e salta direttamente a EBIT; **la UI mostrata negli screenshot separa esplicitamente EBITDA/MOL da EBIT** con gli Ammortamenti in mezzo. Le due cose sono conciliabili: basta calcolare "Costi Fissi" **al netto degli Ammortamenti Operativi** per fermarsi a EBITDA, poi sottrarre gli Ammortamenti Operativi per ottenere EBIT — è il comportamento da implementare, verificato contro lo screenshot `Conto Economico.png` riga per riga (Personale, Affitti, Utenze, Marketing, Software, Consulenze, Assicurazioni, Altri costi fissi → EBITDA/MOL; poi − Ammortamenti → EBIT).

### 3.3 A Costo del Venduto

```
  Ricavi Operativi + Rimanenze Finali
− Costi Materie Prime + Rimanenze Iniziali
− Costi Produzione
− Ammortamenti Operativi
− Costi Personale
= COSTO DEL VENDUTO
GROSS PROFIT = Ricavi Operativi − Costo del Venduto
− Costi Generali e Amministrativi
− Costi Commerciali
− Ammortamenti Non Operativi
= REDDITO OPERATIVO (EBIT)
− Oneri Finanziari
+ Proventi Finanziari
− Oneri Straordinari
+ Proventi Straordinari
= UTILE ANTE IMPOSTE
− Imposte
= UTILE/PERDITA
```

### 3.4 Variante Budget/Consuntivo/Forecast (etichette internazionali)

Stessa sostanza di 3.3, con nomenclatura anglosassone (`GROSS PROFIT`, `TOTAL EXPENSES`, `EARNING BEFORE INTEREST AND TAXES`, `EARNING BEFORE TAXES`, `NET EARNINGS`) — usata nel file per le viste Budget/Consuntivo mensili. Da tenere presente se in futuro serve un export in inglese, ma non introduce logica nuova.

---

## 4. Riclassificazione dello Stato Patrimoniale

```
ATTIVO
  Immobilizzazioni Immateriali
+ Immobilizzazioni Materiali
+ Immobilizzazioni Finanziarie
= ATTIVO FISSO NETTO
  Rimanenze Finali (magazzino)
+ Liquidità Differite (crediti)
+ Liquidità Immediate (cassa/banca)
= CAPITALE CIRCOLANTE (lordo, lato attivo)
ATTIVO FISSO NETTO + CAPITALE CIRCOLANTE = TOTALE ATTIVO

PASSIVO
  Patrimonio Netto
+ Debiti a Medio/Lungo Termine
+ Debiti a Breve Termine
= TOTALE PASSIVO (= TOTALE ATTIVO)
```

**Capitale Circolante Netto (CCN)**, come mostrato nel tab dedicato, è invece la versione "netta" usata per l'analisi di liquidità:

```
CCN = (Crediti Commerciali + Magazzino + Altri Crediti) − (Debiti Fornitori + Altri Debiti Correnti)
```

---

## 5. Indici di bilancio — formule esatte

Tutte le formule seguenti sono quelle definite dal consulente nel foglio `INDICI DI BILANCIO`, con le soglie di interpretazione indicate (dove presenti nel file originale).

| Indice | Formula | Interpretazione |
|---|---|---|
| **ROE** (Return on Equity) | `Utile/Perdita di esercizio ÷ Patrimonio Netto × 100` | Nessuna soglia standard: si confronta col rendimento di investimenti alternativi a basso rischio + premio per il rischio |
| **ROI** (Return on Investment) | `Reddito Operativo (EBIT) ÷ Capitale Investito × 100` | Idem — confronto con investimenti alternativi |
| **ROS** (Return on Sales) | `Reddito Operativo (EBIT) ÷ (Ricavi Operativi ± Variazione Rimanenze) × 100` | Positivo da **10%** in su |
| **MOL %** (EBITDA margin) | `EBITDA ÷ Ricavi Operativi × 100` | Positivo da **15%** in su |
| **Indipendenza Finanziaria** | `Patrimonio Netto ÷ Totale Passivo × 100` | Positivo se **> 30%** |
| **Margine di struttura primario** | `Patrimonio Netto − Attivo Fisso Netto` | Se negativo non è per forza un allarme (es. startup): significa che servono anche debiti consolidati a coprire le immobilizzazioni |
| **Margine di struttura secondario** | `(Patrimonio Netto + Debiti M/L Termine) − Attivo Fisso Netto` | Deve essere **> 0**: altrimenti le immobilizzazioni sono finanziate anche da debiti a breve (squilibrio finanziario) |
| **Indice di disponibilità** (Current Ratio) | `Attivo Circolante ÷ Debiti a Breve Termine` | **> 1** è positivo; sotto 1 l'attivo circolante non copre i debiti a breve |
| **Indice di liquidità** (Quick Ratio) | `(Attivo Circolante − Rimanenze Finali) ÷ Debiti a Breve Termine` | **> 1** è positivo |
| **Break-Even Point (BEP)** | `Costi Fissi ÷ (Ricavi Operativi + Rimanenze Finali − Costi Variabili + Rimanenze Iniziali)` — rapporto, da moltiplicare per i Ricavi per ottenere il BEP in €/periodo | Il BEP in € si ha quando Ricavi Totali = Costi Totali (fissi + variabili) |
| **DSO** (giorni medi di incasso) | `Crediti Commerciali ÷ Ricavi Giornalieri Medi` | In aumento = i clienti pagano più tardi |
| **DIO** (giorni medi di magazzino) | `Magazzino ÷ Costo del Venduto Giornaliero Medio` | In calo = rotazione di magazzino migliorata |
| **DPO** (giorni medi di pagamento) | `Debiti Fornitori ÷ Acquisti Giornalieri Medi` | — |
| **CCC** (Cash Conversion Cycle) | `DSO + DIO − DPO` | Più basso = migliore gestione del capitale circolante |
| **PFN** (Posizione Finanziaria Netta) | `Debiti Finanziari (breve + lungo) − Liquidità (immediate + differite finanziarie)` | Indebitamento netto |
| **PFN / EBITDA** | `PFN ÷ EBITDA (ultimi 12 mesi)` | Multiplo di indebitamento: più basso è meglio |
| **Debt / Equity** | `Debiti Finanziari ÷ Patrimonio Netto` | — |
| **DSCR** (Debt Service Coverage Ratio) | `EBITDA (ultimi 12 mesi) ÷ Rate di finanziamento (quota capitale + interessi) attese nei prossimi 12 mesi` | **> 1,25x** generalmente richiesto dalle banche; **< 1,0x** segnala che il reddito operativo non copre il debito |

---

## 6. Ciclo del capitale circolante — dettaglio (tab "Capitale Circolante")

Riepilogo delle relazioni già coperte sopra, isolate perché sono un tab a sé nell'app:

```
DSO = Crediti Commerciali / Ricavi Giornalieri Medi
DIO = Magazzino / Costo del Venduto Giornaliero Medio
DPO = Debiti Fornitori / Acquisti Giornalieri Medi
CCC = DSO + DIO − DPO
```

L'app deve mostrare, per ciascun indicatore: valore periodo corrente, valore stesso periodo anno precedente, variazione assoluta e %, trend a 12/24 mesi con media mobile. Le "note automatiche" osservate negli screenshot (es. *"Aumento scaduti > 60gg"*, *"Rotazione migliorata"*, *"Credit tributari in calo"*) sono generabili con regole semplici su soglie di variazione — non serve un modello AI per la prima versione, ma è il primo tassello dell'idea di "assistente numeri" (`AGENTS.md` §11.8).

---

## 7. Costo diretto/indiretto per Tipo di attività

Le percentuali di default in §2.2 sono un punto di partenza generico. La richiesta esplicita del cliente ("*se io sono un tornitore ho esigenze diverse rispetto a una pizzeria*") implica che ogni **Tipo di attività** (settore/modello di business, `AGENTS.md` §1-bis) dovrebbe poter avere un proprio set di default. Esempio illustrativo (da validare col cliente, non nel file originale):

| Tipo di attività | Costi Personale — % diretto tipico | Note |
|---|---|---|
| Produzione/Manifattura (es. tornitore) | Alto (operai diretti in produzione) | Materie prime quasi sempre 100% dirette |
| Ristorazione (es. pizzeria) | Misto (cuochi diretti, sala più indiretta) | Materie prime 100% dirette, affitto quasi sempre indiretto |
| Servizi/Consulenza | Alto se a commessa (ore fatturabili), basso se strutturale | Spesso non c'è "magazzino" |
| Commercio | Basso (personale di vendita spesso indiretto salvo commissioni) | Costo merci quasi sempre diretto al 100% |

Questa tabella **non è nel file del consulente** ed è un'ipotesi di lavoro: va costruita/validata insieme a lui azienda per azienda, ma l'architettura (% configurabile per sezione-conto, con default per Tipo di attività) è già supportata dallo schema in §2.2.

---

## 8. Vocabolari di riferimento (enum)

Dal foglio `DICTIONARY` del file originale — questi valori alimentano le liste a discesa dell'app:

- **Modalità di pagamento**: Assegno, Bonifico, Carta di credito, Compensazione, Contanti, F24, MAV, Pagamento da definire, RI.BA., Rid Bancario, Bollettino postale, Rimessa diretta.
- **Condizioni di pagamento** (sigle): RD, DF, FM *(verosimilmente Rimessa Diretta / Data Fattura / Fine Mese — da confermare col cliente, non spiegate nel file)*.
- **Giorni a scadenza**: 0, 30, 60, 90, 120.
- **Stato del pagamento**: Pagata, Non pagata, Pagamento parziale.
- **Forme giuridiche**: SPA, SRL, SAPA, SCPA, SNC, SAS, SS, Società consortile, Società cooperativa, Ditta individuale, Istituzione, Fondazione, Da costituire, Altro. *(Guida il regime fiscale — vedi `AGENTS.md` §11.6.)*
- **Tipo Conto**: RICAVO, COSTO, ATTIVITA', ATTIVITA' NEGATIVO, PASSIVITA' (vedi §1).
- **Periodo**: Anno, oppure Gennaio…Dicembre "anno corrente" (per budget/consuntivo mensile).

---

## 9. Cosa manca in questo modello (da chiarire, non presente nel file originale)

- Aliquote fiscali per forma giuridica/regione (per la pianificazione fiscale, `AGENTS.md` §11.6).
- Soglie di alert per la Panoramica (es. a che punto "Margine operativo -22%" diventa un alert rosso) — negli screenshot i valori sono plausibili ma le soglie esatte non sono documentate nel file Excel.
- Schema esatto delle "note automatiche" nel tab Capitale Circolante (§6) — dedotto dagli screenshot, non specificato nel file.
- Formato del file XML di fatture elettroniche da importare (vedi `AGENTS.md` §11.2 e §14).
