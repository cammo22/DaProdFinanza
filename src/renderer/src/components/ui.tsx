import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

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
  children
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-2xl rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
        <header className="flex items-start justify-between border-b border-ink-700 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-md px-2 text-lg leading-none text-ink-400 hover:text-ink-100"
          >
            ×
          </button>
        </header>
        {children}
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
