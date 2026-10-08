import type { ReactNode } from "react";

export const fmtGrade = (value?: number) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";

export function ReportHeader({ institution, subtitle, generatedAt }: { institution: string; subtitle: string; generatedAt: string }) {
  return <header className="report-header">
    <div className="report-brand"><img className="report-logo" src="/sirae-logo.webp" alt="SIRAE" width={96} height={63} /><div><strong>{institution}</strong><small>{subtitle}</small></div></div>
    <div className="report-generated"><small>Generado</small><span>{new Date(generatedAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span></div>
  </header>;
}

export function ReportSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section className="report-section"><header><span>{number}</span><h2>{title}</h2></header>{children}</section>;
}

export function ReportEmpty({ children }: { children: ReactNode }) { return <p className="report-empty">{children}</p>; }
