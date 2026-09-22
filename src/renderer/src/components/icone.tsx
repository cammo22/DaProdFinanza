/**
 * Le icone del programma, tutte dello stesso disegno (tratto 1,7, angoli
 * arrotondati, 24×24): al posto delle emoji, che cambiano aspetto da Windows
 * ad Android e non prendono il colore del testo.
 *
 * `<Icona nome="cerca" />` eredita colore e dimensione dal testo intorno
 * (1em); per un'altra misura basta una classe, es. `className="h-5 w-5"`.
 */

const TRACCIATI = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  cerca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  piu: 'M12 5v14M5 12h14',
  chiudi: 'M6 6l12 12M18 6 6 18',
  giu: 'm6 9 6 6 6-6',
  su: 'm18 15-6-6-6 6',
  destra: 'm9 6 6 6-6 6',
  sinistra: 'm15 6-6 6 6 6',
  'doppia-sinistra': 'm11 17-5-5 5-5M18 17l-5-5 5-5',
  'doppia-destra': 'm13 17 5-5-5-5M6 17l5-5-5-5',
  campanello: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  telefono:
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  messaggio: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  graffetta: 'm21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  orologio: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5',
  stop: 'M6 6h12v12H6z',
  lucchetto: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  sbloccato: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.8-1.2',
  pannelli: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  'barra-laterale': 'M4 4h16v16H4zM9 4v16',
  impostazioni:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  utente: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  utenti:
    'M4 20v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  esci: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  documento: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  cartella: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  casa: 'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  grafico: 'M4 19h16M7 16V9M12 16V5M17 16v-4',
  andamento: 'M4 18l5-6 4 3 7-9M15 6h5v5',
  aggiorna: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
  scarica: 'M12 4v11m0 0 4-4m-4 4-4-4M5 19h14',
  carica: 'M12 20V9m0 0 4 4m-4-4-4 4M5 5h14',
  occhio: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  'occhio-chiuso': 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  comprimi: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  espandi: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  fulmine: 'M13 2 4 14h7l-1 8 9-12h-7z',
  calendario: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  euro: 'M18 6.5A7 7 0 1 0 18 17.5M4 10h9M4 14h9',
  matita: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  cestino: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  sole: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  luna: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  spunta: 'm5 12 5 5L20 7',
  attenzione: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  tastiera: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  azienda: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2M3 21h18',
  cassa: 'M3 7h18v12H3zM3 11h18M7 15h3M16 4H6',
  banca: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z',
  lavoro: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 7h18v12H3zM3 12h18',
  altro: 'M6.5 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0M13.2 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0M19.9 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0',
  'altro-verticale': 'M13.2 5.3a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0M13.2 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0M13.2 18.7a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0',
  indietro: 'M19 12H5M11 18l-6-6 6-6',
  stella: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  storico: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  report: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 17v-3M12 17v-6M15 17v-2'
} as const

export type NomeIcona = keyof typeof TRACCIATI

export function Icona({
  nome,
  className = 'h-[1em] w-[1em]',
  pieno = false,
  titolo
}: {
  nome: NomeIcona
  className?: string
  /** Riempita invece che a tratto (play, stop, stella). */
  pieno?: boolean
  /** Testo per chi usa un lettore di schermo; senza, l'icona è decorativa. */
  titolo?: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={pieno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={titolo ? undefined : true}
      role={titolo ? 'img' : undefined}
    >
      {titolo && <title>{titolo}</title>}
      <path d={TRACCIATI[nome]} />
    </svg>
  )
}
