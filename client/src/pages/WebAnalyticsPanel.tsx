import type { AnalyticsNamed } from "../services/api";

const number = new Intl.NumberFormat("es-CO");
const percent = (value: number) => `${(value * 100).toFixed(1).replace(".", ",")}%`;
const duration = (seconds: number) => `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
const deviceLabel: Record<string, string> = { desktop: "Computador", mobile: "Celular", tablet: "Tableta", "smart tv": "Smart TV" };
const channelLabel: Record<string, string> = { Direct: "Directo", "Organic Search": "Búsqueda orgánica", "Organic Social": "Redes sociales", Referral: "Referido", Unassigned: "Sin asignar", Email: "Correo", "Paid Search": "Búsqueda de pago", Display: "Display" };
const visitorLabel: Record<string, string> = { new: "Nuevos", returning: "Recurrentes" };
const BLUE = "var(--blue, #3b5bdb)"; const TEAL = "#12b886";

const dayLabel = (date: string) => `${date.slice(6)}/${date.slice(4, 6)}`;
const niceMax = (value: number) => { if (value <= 4) return 4; const power = 10 ** Math.floor(Math.log10(value)); return Math.ceil(value / power) * power; };

export function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="metric-card"><div className="metric-label">{label}</div><div className="metric-value" style={{ fontSize: "1.6rem" }}>{value}</div>{hint && <div className="metric-hint">{hint}</div>}</div>;
}

// Barras verticales (últimos 30 minutos, horas del día).
export function Columns({ data, label, color = BLUE, height = 150, tick }: { data: { key: string; value: number; title: string }[]; label: string; color?: string; height?: number; tick: (index: number) => string | null }) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const width = 600; const left = 28; const bottom = 18; const plotH = height - bottom - 6; const slot = (width - left) / Math.max(1, data.length);
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }}>
    {[0, 0.5, 1].map((fraction) => { const y = 6 + plotH * (1 - fraction); return <g key={fraction}><line x1={left} x2={width} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.12} /><text x={left - 4} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity={0.6}>{Math.round(max * fraction)}</text></g>; })}
    {data.map((d, index) => { const h = (d.value / max) * plotH; const x = left + index * slot; const text = tick(index); return <g key={d.key}>
      <rect x={x + slot * 0.15} y={6 + plotH - h} width={slot * 0.7} height={Math.max(d.value ? 2 : 0, h)} rx={2} fill={color}><title>{d.title}</title></rect>
      {text && <text x={x + slot / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.6}>{text}</text>}
    </g>; })}
  </svg>;
}

// Línea de una sola métrica por día.
export function LineChart({ data, color, label, unit }: { data: { date: string; value: number; extra?: string }[]; color: string; label: string; unit: string }) {
  const width = 600; const height = 200; const left = 34; const bottom = 20; const plotH = height - bottom - 8; const plotW = width - left - 6;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const x = (index: number) => left + (data.length <= 1 ? plotW / 2 : (index * plotW) / (data.length - 1));
  const y = (value: number) => 8 + plotH * (1 - value / max);
  const path = data.map((d, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const step = Math.max(1, Math.ceil(data.length / 7));
  if (!data.length) return <p className="helper-text">Sin datos todavía.</p>;
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }}>
    {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - 6} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" strokeOpacity={0.12} /><text x={left - 4} y={y(max * fraction) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity={0.6}>{Math.round(max * fraction)}</text></g>)}
    <path d={`${path} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={color} opacity={0.1} />
    <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    {data.map((d, index) => <g key={d.date}><circle cx={x(index)} cy={y(d.value)} r={data.length > 40 ? 1.5 : 3} fill={color}><title>{`${dayLabel(d.date)}: ${d.value} ${unit}${d.extra ? ` · ${d.extra}` : ""}`}</title></circle>
      {index % step === 0 && <text x={x(index)} y={height - 5} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.6}>{dayLabel(d.date)}</text>}</g>)}
  </svg>;
}

// Lista con barras horizontales proporcionales.
export function BarList({ title, rows, format = (name: string) => name }: { title: string; rows?: AnalyticsNamed[]; format?: (name: string) => string }) {
  const list = (rows ?? []).filter((row) => row.value > 0); const max = Math.max(1, ...list.map((row) => row.value)); const total = list.reduce((sum, row) => sum + row.value, 0) || 1;
  return <div style={{ minWidth: 0 }}><h3 style={{ fontSize: ".95rem", margin: "0 0 .5rem" }}>{title}</h3>
    {list.length ? <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: ".4rem" }}>{list.map((row) => <li key={row.name} style={{ fontSize: ".85rem", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}><span title={format(row.name)} style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{format(row.name)}</span><span className="muted" style={{ flex: "none", whiteSpace: "nowrap" }}>{number.format(row.value)} · {Math.round(row.value * 100 / total)}%</span></div>
      <div style={{ height: 6, borderRadius: 3, background: "color-mix(in srgb, currentColor 10%, transparent)" }}><div style={{ width: `${(row.value / max) * 100}%`, height: "100%", borderRadius: 3, background: BLUE }} /></div>
    </li>)}</ul> : <p className="helper-text">Sin datos todavía.</p>}</div>;
}

// El título de la página trae el nombre largo del sistema; en las listas solo se muestra «SIRAE».
export const shortTitle = (name: string) => (/sirae/i.test(name) ? "SIRAE" : name.trim() || "(sin título)");
// Une filas repetidas (por ejemplo varias páginas que acaban llamándose «SIRAE»).
export const mergeNamed = (rows: AnalyticsNamed[]): AnalyticsNamed[] => [...rows.reduce((map, row) => map.set(row.name, (map.get(row.name) ?? 0) + row.value), new Map<string, number>())].map(([name, value]) => ({ name, value })).sort((x, y) => y.value - x.value);
export const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1.2rem" } as const;
export const subtitle = { fontSize: ".95rem", margin: "1rem 0 .3rem" } as const;
export const labels = { deviceLabel, channelLabel, visitorLabel };
export const formats = { number, percent, duration };
export const colors = { BLUE, TEAL, AMBER: "#f59f00", VIOLET: "#7048e8" };
