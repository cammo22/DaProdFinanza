import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 hover:bg-brand-400 text-white border-brand-500',
  ghost: 'bg-ink-800 hover:bg-ink-700 text-ink-100 border-ink-700',
  danger: 'bg-negative/10 hover:bg-negative/20 text-negative border-negative/40'
}

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): React.JSX.Element {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Card({
  title,
  actions,
  children,
  className = ''
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <section
      className={`rounded-xl border border-ink-700 bg-ink-850 shadow-lg shadow-black/30 ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-300">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  required,
  children
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-300">
        {label}
        {required && <span className="ml-1 text-negative">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </label>
  )
}

const CONTROL =
  'w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500'

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={`${CONTROL} ${className}`} />
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select {...props} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  )
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  larga = false
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  /** Finestra larga, per gli editor con il riepilogo di fianco. */
  larga?: boolean
}): React.JSX.Element {
  // Esc chiude, come ogni finestra.
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    // Sul telefono la finestra sale dal basso e occupa quasi tutto lo schermo.
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 md:items-center md:p-6">
      <div className={`sale md:compare flex max-h-[94vh] w-full ${larga ? 'max-w-5xl' : 'max-w-2xl'} flex-col rounded-t-2xl border border-ink-700 bg-ink-850 shadow-2xl md:max-h-[90vh] md:rounded-xl`}>
        <header className="flex shrink-0 items-start justify-between border-b border-ink-700 px-5 py-4 md:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="-mr-1 rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="fondo-sicuro min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function Alert({
  tone = 'error',
  children
}: {
  tone?: 'error' | 'info' | 'success'
  children: ReactNode
}): React.JSX.Element {
  const tones = {
    error: 'border-negative/40 bg-negative/10 text-negative',
    info: 'border-brand-500/40 bg-brand-500/10 text-brand-300',
    success: 'border-positive/40 bg-positive/10 text-positive'
  }
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`} role="alert">
      {children}
    </div>
  )
}

/**
 * Interruttore acceso/spento, per le impostazioni. È un vero `<button
 * role="switch">`: si usa anche da tastiera e i lettori di schermo lo annunciano.
 */
export function Interruttore({
  acceso,
  onChange,
  label,
  descrizione,
  disabled = false
}: {
  acceso: boolean
  onChange: (acceso: boolean) => void
  label: string
  descrizione?: ReactNode
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className={`flex items-start gap-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-100">{label}</p>
        {descrizione && <p className="mt-0.5 text-xs text-ink-400">{descrizione}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={acceso}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!acceso)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed ${
          acceso ? 'border-brand-500 bg-brand-500' : 'border-ink-600 bg-ink-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${
            acceso ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

/** Schede orizzontali in cima a una pagina: sul telefono scorrono di lato. */
export function Schede<T extends string>({
  schede,
  attiva,
  onChange
}: {
  schede: { id: T; label: string; conteggio?: number }[]
  attiva: T
  onChange: (id: T) => void
}): React.JSX.Element {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-ink-700" role="tablist">
      {schede.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={attiva === s.id}
          onClick={() => onChange(s.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${
            attiva === s.id
              ? 'border-brand-400 font-medium text-brand-300'
              : 'border-transparent text-ink-300 hover:text-ink-100'
          }`}
        >
          {s.label}
          {s.conteggio !== undefined && s.conteggio > 0 && (
            <span className="ml-2 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {s.conteggio}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function TextArea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea {...props} className={`${CONTROL} min-h-20 resize-y ${className}`} />
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
      <p className="max-w-md text-sm text-ink-400">{description}</p>
      {action}
    </div>
  )
}

/**
 * Scelta fra poche opzioni a pulsanti affiancati (es. Consuntivo / Budget /
 * Forecast): un clic invece di aprire un menu.
 */
export function Segmentato<T extends string>({
  valore,
  opzioni,
  onChange,
  className = '',
  piccolo = false
}: {
  valore: T
  opzioni: { id: T; label: string; titolo?: string }[]
  onChange: (id: T) => void
  className?: string
  piccolo?: boolean
}): React.JSX.Element {
  return (
    <div className={`inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 ${className}`} role="radiogroup">
      {opzioni.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valore === o.id}
          title={o.titolo}
          onClick={() => onChange(o.id)}
          className={`flex-1 whitespace-nowrap rounded-md font-medium transition-colors ${piccolo ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            valore === o.id ? 'bg-brand-500/20 text-brand-200 shadow-sm' : 'text-ink-400 hover:text-ink-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Riquadro che luccica mentre i dati arrivano, della forma di quello che arriverà. */
export function Scheletro({ className = 'h-4 w-full' }: { className?: string }): React.JSX.Element {
  return <div className={`scheletro rounded-md ${className}`} aria-hidden="true" />
}

/** Una schermata in caricamento: indicatori in alto e due riquadri. */
export function CaricamentoPagina(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Caricamento">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
            <Scheletro className="h-3 w-24" />
            <Scheletro className="mt-3 h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
            <Scheletro className="h-3 w-40" />
            <Scheletro className="mt-4 h-40 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
