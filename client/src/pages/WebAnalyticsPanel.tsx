import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AnalyticsNamed } from "../services/api";

const number = new Intl.NumberFormat("es-CO");
const percent = (value: number) => `${(value * 100).toFixed(1).replace(".", ",")}%`;
const duration = (seconds: number) => `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
const deviceLabel: Record<string, string> = { desktop: "Computador", mobile: "Celular", tablet: "Tableta", "smart tv": "Smart TV" };
const channelLabel: Record<string, string> = { Direct: "Directo", "Organic Search": "Búsqueda orgánica", "Organic Social": "Redes sociales", Referral: "Referido", Unassigned: "Sin asignar", Email: "Correo", "Paid Search": "Búsqueda de pago", Display: "Display" };
const visitorLabel: Record<string, string> = { new: "Nuevos", returning: "Recurrentes" };
const BLUE = "var(--blue, #3b5bdb)"; const TEAL = "#12b886";

const dayLabel = (date: string) => `${date.slice(6)}/${date.slice(4, 6)}`;
const niceMax = (value: number) => { if (value <= 4) return 4; const power = 10 ** Math.floor(Math.log10(value)); return Math.ceil(value / power) * power; };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="metric-card"><div className="metric-label">{label}</div><div className="metric-value" style={{ fontSize: "1.6rem" }}>{value}</div>{hint && <div className="metric-hint">{hint}</div>}</div>;
}

// Barras verticales (últimos 30 minutos, horas del día).
function Columns({ data, label, color = BLUE, height = 150, tick }: { data: { key: string; value: number; title: string }[]; label: string; color?: string; height?: number; tick: (index: number) => string | null }) {
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

// Líneas por día: usuarios y páginas vistas.
function Lines({ daily }: { daily: { date: string; users: number; sessions: number; pageViews: number }[] }) {
  const width = 600; const height = 190; const left = 34; const bottom = 20; const plotH = height - bottom - 8; const plotW = width - left - 6;
  const max = niceMax(Math.max(...daily.map((d) => Math.max(d.pageViews, d.users)), 0));
  const x = (index: number) => left + (daily.length <= 1 ? plotW / 2 : (index * plotW) / (daily.length - 1));
  const y = (value: number) => 8 + plotH * (1 - value / max);
  const path = (pick: (d: typeof daily[number]) => number) => daily.map((d, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(" ");
  const step = Math.max(1, Math.ceil(daily.length / 7));
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Usuarios y páginas vistas por día" style={{ width: "100%", height: "auto", display: "block" }}>
    {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - 6} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" strokeOpacity={0.12} /><text x={left - 4} y={y(max * fraction) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity={0.6}>{Math.round(max * fraction)}</text></g>)}
    <path d={`${path((d) => d.pageViews)} L${x(daily.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={BLUE} opacity={0.08} />
    <path d={path((d) => d.pageViews)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
    <path d={path((d) => d.users)} fill="none" stroke={TEAL} strokeWidth={2} strokeLinejoin="round" />
    {daily.map((d, index) => <g key={d.date}><circle cx={x(index)} cy={y(d.pageViews)} r={daily.length > 40 ? 1.5 : 3} fill={BLUE}><title>{`${dayLabel(d.date)}: ${d.pageViews} vistas · ${d.users} usuarios · ${d.sessions} sesiones`}</title></circle>
      {index % step === 0 && <text x={x(index)} y={height - 5} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.6}>{dayLabel(d.date)}</text>}</g>)}
  </svg>;
}

function Legend() { return <p className="helper-text" style={{ display: "flex", gap: "1rem", margin: ".2rem 0 0" }}><span><span style={{ color: BLUE }}>●</span> Páginas vistas</span><span><span style={{ color: TEAL }}>●</span> Usuarios</span></p>; }

// Lista con barras horizontales proporcionales.
function BarList({ title, rows, format = (name: string) => name }: { title: string; rows?: AnalyticsNamed[]; format?: (name: string) => string }) {
  const list = (rows ?? []).filter((row) => row.value > 0); const max = Math.max(1, ...list.map((row) => row.value)); const total = list.reduce((sum, row) => sum + row.value, 0) || 1;
  return <div style={{ minWidth: 0 }}><h3 style={{ fontSize: ".95rem", margin: "0 0 .5rem" }}>{title}</h3>
    {list.length ? <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".4rem" }}>{list.map((row) => <li key={row.name} style={{ fontSize: ".85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{format(row.name)}</span><span className="muted">{number.format(row.value)} · {Math.round(row.value * 100 / total)}%</span></div>
      <div style={{ height: 6, borderRadius: 3, background: "color-mix(in srgb, currentColor 10%, transparent)" }}><div style={{ width: `${(row.value / max) * 100}%`, height: "100%", borderRadius: 3, background: BLUE }} /></div>
    </li>)}</ul> : <p className="helper-text">Sin datos todavía.</p>}</div>;
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1.2rem" } as const;
const NOT_CONNECTED = <p className="helper-text">Aún no está conectado. Define <code>GA_PROPERTY_ID</code> y <code>GA_SERVICE_ACCOUNT_JSON</code> en el servidor.</p>;

function RealtimeCard() {
  const query = useQuery({ queryKey: ["webRealtime"], queryFn: api.getPlatformRealtime, refetchInterval: 15_000, retry: false });
  const data = query.data;
  return <article className="content-card">
    <div className="card-title-row"><h2>En vivo · últimos 30 minutos</h2><span className="helper-text">Se actualiza cada 15 s</span></div>
    {query.isLoading ? <p className="helper-text">Cargando…</p> : query.error ? <p className="helper-text" role="alert">{query.error instanceof Error ? query.error.message : "No se pudieron cargar los datos en vivo."}</p>
      : !data?.configured ? NOT_CONNECTED : <>
      <section className="metric-grid four-cols" aria-label="En vivo">
        <Tile label="Usuarios activos ahora" value={number.format(data.users)} hint="En los últimos 30 minutos" />
        <Tile label="Páginas vistas" value={number.format(data.viewsLast30)} hint="En los últimos 30 minutos" />
      </section>
      <h3 style={{ fontSize: ".95rem", margin: "1rem 0 .3rem" }}>Usuarios por minuto</h3>
      <Columns label="Usuarios activos por minuto en los últimos 30 minutos" color={TEAL} height={140}
        data={(data.minutes ?? []).map((m) => ({ key: String(m.minutesAgo), value: m.users, title: m.minutesAgo === 0 ? `Ahora: ${m.users}` : `Hace ${m.minutesAgo} min: ${m.users}` }))}
        tick={(index) => { const ago = 29 - index; return ago === 0 ? "ahora" : ago % 5 === 0 ? `-${ago}m` : null; }} />
      <div style={{ ...grid, marginTop: "1rem" }}>
        <BarList title="Páginas activas" rows={(data.pages ?? []).map((p) => ({ name: p.name, value: p.users }))} />
        <BarList title="Países" rows={data.countries} />
        <BarList title="Ciudades" rows={data.cities} />
        <BarList title="Dispositivos" rows={data.devices} format={(name) => deviceLabel[name.toLowerCase()] ?? name} />
      </div></>}
  </article>;
}

export function WebAnalyticsPanel() {
  const [days, setDays] = useState(28);
  const query = useQuery({ queryKey: ["webAnalytics", days], queryFn: () => api.getPlatformAnalytics(days), refetchInterval: 60_000, retry: false });
  const data = query.data; const t = data?.totals;
  return <>
    <RealtimeCard />
    <article className="content-card">
      <div className="card-title-row"><h2>Visitas al sitio · Google Analytics</h2>
        <div className="segmented">{[7, 28, 90].map((value) => <button key={value} className={days === value ? "is-active" : ""} onClick={() => setDays(value)}>{value} días</button>)}</div></div>
      {query.isLoading ? <p className="helper-text">Cargando…</p> : query.error ? <p className="helper-text" role="alert">{query.error instanceof Error ? query.error.message : "No se pudieron cargar las estadísticas."}</p>
        : !data?.configured || !t ? NOT_CONNECTED : <>
        <section className="metric-grid four-cols" aria-label="Totales del periodo">
          <Tile label="Usuarios" value={number.format(t.users)} hint={`${number.format(t.newUsers)} nuevos`} />
          <Tile label="Sesiones" value={number.format(t.sessions)} hint={`${t.viewsPerSession.toFixed(1).replace(".", ",")} páginas por sesión`} />
          <Tile label="Páginas vistas" value={number.format(t.pageViews)} hint={`${number.format(t.events)} eventos`} />
          <Tile label="Duración media" value={duration(t.avgSessionSeconds)} hint={`Interacción ${percent(t.engagementRate)} · rebote ${percent(t.bounceRate)}`} />
        </section>
        <h3 style={{ fontSize: ".95rem", margin: "1rem 0 .3rem" }}>Visitas por día</h3>
        <Lines daily={data.daily ?? []} /><Legend />
        <h3 style={{ fontSize: ".95rem", margin: "1rem 0 .3rem" }}>¿A qué horas entran? (hora de Colombia según la propiedad)</h3>
        <Columns label="Usuarios por hora del día" height={130} data={(data.hourly ?? []).map((h) => ({ key: String(h.hour), value: h.users, title: `${h.hour}:00 — ${h.users} usuarios` }))} tick={(index) => (index % 3 === 0 ? `${index}h` : null)} />
        <div style={{ ...grid, marginTop: "1.2rem" }}>
          <BarList title="Cómo llegan (sesiones)" rows={data.channels} format={(name) => channelLabel[name] ?? name} />
          <BarList title="Nuevos y recurrentes" rows={data.visitorTypes} format={(name) => visitorLabel[name] ?? name} />
          <BarList title="Dispositivos" rows={data.devices} format={(name) => deviceLabel[name.toLowerCase()] ?? name} />
          <BarList title="Navegadores" rows={data.browsers} />
          <BarList title="Sistemas operativos" rows={data.systems} />
          <BarList title="Países" rows={data.countries} />
          <BarList title="Ciudades" rows={data.cities} />
        </div>
        <h3 style={{ fontSize: ".95rem", margin: "1.2rem 0 .3rem" }}>Páginas más vistas</h3>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Página</th><th className="num">Vistas</th><th className="num">Usuarios</th></tr></thead><tbody>{(data.pages ?? []).map((row) => <tr key={row.path}><td>{row.path}</td><td className="num">{number.format(row.views)}</td><td className="num">{number.format(row.users)}</td></tr>)}</tbody></table></div>
      </>}
    </article>
  </>;
}
