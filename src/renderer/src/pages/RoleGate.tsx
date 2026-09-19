import type { Role } from '@shared/enums'
import type { DemoCredential } from '@shared/types'
import { useState } from 'react'
import { Logo } from '../components/Logo'
import { UpdateDialog, useUpdates } from '../components/UpdateDialog'

/**
 * Porta d'ingresso dell'app — rende esplicito il modello a due varianti di
 * AGENTS.md §1: il Consulente che segue tutte le aziende e l'Azienda che vede
 * solo la propria. La scelta non dà alcun potere di per sé: determina solo quale
 * login viene mostrato, e il server rifiuta un account che non corrisponde.
 */

interface RoleCard {
  role: Role
  title: string
  tagline: string
  points: string[]
  icon: React.JSX.Element
}

const BRIEFCASE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="2.5" y="7" width="19" height="13" rx="2" />
    <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
    <path d="M2.5 12.5h19" />
    <path d="M10.5 12.5h3" />
  </svg>
)

const STOREFRONT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 10v9.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V10" />
    <path d="M3 6.5 4.5 3h15L21 6.5a2.5 2.5 0 0 1-4.5 1.5 2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-4.5 0A2.5 2.5 0 0 1 3 6.5Z" />
    <path d="M9.5 21v-5.5h5V21" />
  </svg>
)

const CARDS: RoleCard[] = [
  {
    role: 'consultant',
    title: 'Consulente',
    tagline: 'Lo studio che segue più aziende in parallelo.',
    points: [
      'Tutti i clienti e le loro aziende',
      'Riclassificazioni, indici, simulazioni',
      'Configurazione del piano dei conti'
    ],
    icon: BRIEFCASE
  },
  {
    role: 'company',
    title: 'Azienda',
    tagline: "L'azienda cliente che consulta i propri numeri.",
    points: [
      'Solo la propria azienda',
      'Caricamento dei propri dati',
      'Dashboard e KPI in lettura'
    ],
    icon: STOREFRONT
  }
]

export function RoleGate({
  version,
  demo,
  onPick
}: {
  version: string
  demo: DemoCredential[] | null
  onPick: (role: Role) => void
}): React.JSX.Element {
  const updates = useUpdates()
  const [showUpdates, setShowUpdates] = useState(false)
  const nuova = updates && ['available', 'downloading', 'ready'].includes(updates.status)

  return (
    <div className="flex h-full flex-col items-center justify-center-safe overflow-y-auto bg-ink-950 p-4 md:p-8">
      <div className="mb-10 flex flex-col items-center text-center">
        <Logo size={132} />
        <h1 className="sr-only">DaProdFinanza</h1>
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-ink-400">
          Controllo di gestione
        </p>
        <p className="mt-7 text-sm text-ink-300">Come vuoi entrare?</p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-5">
        {CARDS.map((card) => {
          const credential = demo?.find((account) => account.role === card.role)

          return (
            <button
              key={card.role}
              type="button"
              onClick={() => onPick(card.role)}
              className="group flex flex-col rounded-2xl border border-ink-700 bg-ink-850 p-7 text-left shadow-xl shadow-black/40 transition-all hover:-translate-y-0.5 hover:border-brand-500 hover:bg-ink-800 hover:shadow-brand-500/10 focus:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-brand-300 transition-colors group-hover:border-brand-500/50 group-hover:bg-brand-500/10">
                <span className="h-6 w-6">{card.icon}</span>
              </span>

              <h2 className="text-lg font-semibold text-ink-100">{card.title}</h2>
              <p className="mt-1 text-sm text-ink-400">{card.tagline}</p>

              <ul className="mt-5 flex flex-col gap-2">
                {card.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs text-ink-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-300" />
                    {point}
                  </li>
                ))}
              </ul>

              {credential && (
                <span className="mt-5 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[11px] text-ink-400">
                  demo · {credential.username} / {credential.password}
                </span>
              )}

              <span className="mt-5 text-sm font-medium text-ink-400 transition-colors group-hover:text-brand-300">
                Accedi →
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-10 flex items-center gap-3 text-xs">
        <span className="font-mono text-ink-600">v{version || '—'}</span>
        {/* Anche prima di entrare: un aggiornamento non deve aspettare il login. */}
        <button
          type="button"
          onClick={() => setShowUpdates(true)}
          className={
            nuova
              ? 'rounded-md border border-brand-500/50 bg-brand-500/10 px-2.5 py-1 font-medium text-brand-300 hover:bg-brand-500/20'
              : 'text-ink-400 underline-offset-4 hover:text-ink-200 hover:underline'
          }
        >
          {nuova ? `⬆ Nuova versione ${updates?.latest}` : 'Cerca aggiornamenti'}
        </button>
      </div>
      {showUpdates && updates && <UpdateDialog state={updates} onClose={() => setShowUpdates(false)} />}
    </div>
  )
}
