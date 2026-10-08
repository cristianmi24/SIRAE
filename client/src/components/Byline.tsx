// Crédito "by Edutlan". En los informes impresos se repite al pie de cada hoja.
export function Byline({ variant = "default" }: { variant?: "default" | "dark" | "print" }) {
  return <span className={`byline byline-${variant}`}>
    <span>by</span>
    <img src="/edutlan-logo.webp" alt="Edutlan" width={74} height={40} loading="lazy" />
  </span>;
}
