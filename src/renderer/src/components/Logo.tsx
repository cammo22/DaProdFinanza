import logoUrl from '../assets/logo.png'

/**
 * Marchio DaProdFinanza. L'immagine contiene già il nome del prodotto, quindi
 * dove compare grande non si ripete il nome a testo: sarebbe scritto due volte.
 */
export function Logo({
  size = 96,
  className = ''
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt="DaProdFinanza"
      draggable={false}
      className={`select-none ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
