import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type AnalyticsSummaryDto } from "../services/api";
import { BarList, Columns, LineChart, Tile, colors, formats, grid, labels, mergeNamed, shortTitle, subtitle } from "./WebAnalyticsPanel";

const { number, percent, duration } = formats;
const PERIODS = [7, 28, 90];
const NOT_CONNECTED = <p className="helper-text">Aún no está conectado. Define <code>GA_PROPERTY_ID</code> y <code>GA_SERVICE_ACCOUNT_JSON</code> en el servidor.</p>;
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const BASE = "/analytics";
const TABS = [
  { to: BASE, label: "Todo", end: true },
  { to: `${BASE}/en-vivo`, label: "En vivo" },
  { to: `${BASE}/usuarios`, label: "Usuarios" },
  { to: `${BASE}/sesiones`, label: "Sesiones" },
  { to: `${BASE}/paginas`, label: "Páginas" },
  { to: `${BASE}/audiencia`, label: "Audiencia" },
];

// El periodo vive en la dirección (?dias=28): al recargar o compartir el enlace no se pierde.
function usePeriod(): [number, (days: number) => void] {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("dias"));
  return [PERIODS.includes(requested) ? requested : 28, (days) => setParams(days === 28 ? {} : { dias: String(days) }, { replace: true })];
}

export function WebAnalyticsPage() {
  const [days, setDays] = usePeriod();
  const search = days === 28 ? "" : `?dias=${days}`;
  return <section className="page">
    <div className="page-heading"><div><h1>Analytics</h1><p className="page-subtitle">Visitas al sitio: en vivo, usuarios, sesiones, páginas y audiencia. «Todo» junta todas las gráficas y cada sección tiene su propia dirección, así que al actualizar sigues en el mismo lugar.</p></div></div>
    <div className="card-title-row" style={{ flexWrap: "wrap", gap: ".6rem" }}>
      <nav className="segmented" aria-label="Secciones de Analytics">
        {TABS.map((tab) => <NavLink key={tab.to} to={{ pathname: tab.to, search }} end={tab.end} className={({ isActive }) => (isActive ? "is-active" : "")}>{tab.label}</NavLink>)}
      </nav>
      <div className="segmented" aria-label="Periodo">{PERIODS.map((value) => <button key={value} className={days === value ? "is-active" : ""} onClick={() => setDays(value)}>{value} días</button>)}</div>
    </div>
    <Routes>
      <Route index element={<><LiveSection /><UsersSection days={days} /><SessionsSection days={days} /><PagesSection days={days} /><AudienceSection days={days} /></>} />
      <Route path="en-vivo" element={<LiveSection />} />
      <Route path="usuarios" element={<UsersSection days={days} />} />
      <Route path="sesiones" element={<SessionsSection days={days} />} />
      <Route path="paginas" element={<PagesSection days={days} />} />
      <Route path="audiencia" element={<AudienceSection days={days} />} />
      <Route path="*" element={<Navigate to={BASE} replace />} />
    </Routes>
  </section>;
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return <article className="content-card"><div className="card-title-row"><h2>{title}</h2>{note && <span className="helper-text">{note}</span>}</div>{children}</article>;
}

// Carga el resumen del periodo y entrega los datos ya validados a cada sección.
function Summary({ days, title, children }: { days: number; title: string; children: (data: AnalyticsSummaryDto & { totals: NonNullable<AnalyticsSummaryDto["totals"]> }) => ReactNode }) {
  const query = useQuery({ queryKey: ["webAnalytics", days], queryFn: () => api.getPlatformAnalytics(days), refetchInterval: 60_000, retry: false });
  const data = query.data;
  return <Card title={title} note={`Últimos ${days} días`}>
    {query.isLoading ? <p className="helper-text">Cargando…</p>
      : query.error ? <p className="helper-text" role="alert">{errorText(query.error, "No se pudieron cargar las estadísticas.")}</p>
      : !data?.configured || !data.totals ? NOT_CONNECTED
      : children({ ...data, totals: data.totals })}
  </Card>;
}

function LiveSection() {
  const query = useQuery({ queryKey: ["webRealtime"], queryFn: api.getPlatformRealtime, refetchInterval: 15_000, retry: false });
  const data = query.data;
  return <Card title="En vivo · últimos 30 minutos" note="Se actualiza cada 15 s">
    {query.isLoading ? <p className="helper-text">Cargando…</p>
      : query.error ? <p className="helper-text" role="alert">{errorText(query.error, "No se pudieron cargar los datos en vivo.")}</p>
      : !data?.configured ? NOT_CONNECTED : <>
      <section className="metric-grid four-cols" aria-label="En vivo">
        <Tile label="Usuarios activos ahora" value={number.format(data.users)} hint="En los últimos 30 minutos" />
        <Tile label="Páginas vistas" value={number.format(data.viewsLast30)} hint="En los últimos 30 minutos" />
      </section>
      <h3 style={subtitle}>Usuarios por minuto</h3>
      <Columns label="Usuarios activos por minuto en los últimos 30 minutos" color={colors.TEAL} height={140}
        data={(data.minutes ?? []).map((m) => ({ key: String(m.minutesAgo), value: m.users, title: m.minutesAgo === 0 ? `Ahora: ${m.users}` : `Hace ${m.minutesAgo} min: ${m.users}` }))}
        tick={(index) => { const ago = 29 - index; return ago === 0 ? "ahora" : ago % 5 === 0 ? `-${ago}m` : null; }} />
      <div style={{ ...grid, marginTop: "1rem" }}>
        <BarList title="Páginas activas" rows={mergeNamed((data.pages ?? []).map((p) => ({ name: shortTitle(p.name), value: p.users })))} />
        <BarList title="Países" rows={data.countries} />
        <BarList title="Ciudades" rows={data.cities} />
        <BarList title="Dispositivos" rows={data.devices} format={(name) => labels.deviceLabel[name.toLowerCase()] ?? name} />
      </div></>}
  </Card>;
}

function UsersSection({ days }: { days: number }) {
  return <Summary days={days} title="Usuarios">{(data) => <>
    <section className="metric-grid four-cols" aria-label="Usuarios">
      <Tile label="Usuarios" value={number.format(data.totals.users)} hint="Personas distintas que entraron" />
      <Tile label="Usuarios nuevos" value={number.format(data.totals.newUsers)} hint={data.totals.users ? `${percent(data.totals.newUsers / data.totals.users)} del total` : undefined} />
    </section>
    <h3 style={subtitle}>Usuarios por día</h3>
    <LineChart label="Usuarios por día" color={colors.TEAL} unit="usuarios" data={(data.daily ?? []).map((d) => ({ date: d.date, value: d.users }))} />
    <h3 style={subtitle}>¿A qué horas entran? (hora de la propiedad)</h3>
    <Columns label="Usuarios por hora del día" height={130} color={colors.TEAL} data={(data.hourly ?? []).map((h) => ({ key: String(h.hour), value: h.users, title: `${h.hour}:00 — ${h.users} usuarios` }))} tick={(index) => (index % 3 === 0 ? `${index}h` : null)} />
    <div style={{ ...grid, marginTop: "1.2rem" }}><BarList title="Nuevos y recurrentes" rows={data.visitorTypes} format={(name) => labels.visitorLabel[name] ?? name} /></div>
  </>}</Summary>;
}

function SessionsSection({ days }: { days: number }) {
  return <Summary days={days} title="Sesiones">{(data) => <>
    <section className="metric-grid four-cols" aria-label="Sesiones">
      <Tile label="Sesiones" value={number.format(data.totals.sessions)} hint={`${data.totals.viewsPerSession.toFixed(1).replace(".", ",")} páginas por sesión`} />
      <Tile label="Duración media" value={duration(data.totals.avgSessionSeconds)} />
      <Tile label="Tasa de interacción" value={percent(data.totals.engagementRate)} hint="Sesiones con actividad real" />
      <Tile label="Tasa de rebote" value={percent(data.totals.bounceRate)} hint="Sesiones sin interacción" />
    </section>
    <h3 style={subtitle}>Sesiones por día</h3>
    <LineChart label="Sesiones por día" color={colors.VIOLET} unit="sesiones" data={(data.daily ?? []).map((d) => ({ date: d.date, value: d.sessions }))} />
    <div style={{ ...grid, marginTop: "1.2rem" }}><BarList title="Cómo llegan (sesiones)" rows={data.channels} format={(name) => labels.channelLabel[name] ?? name} /></div>
  </>}</Summary>;
}

function PagesSection({ days }: { days: number }) {
  return <Summary days={days} title="Páginas">{(data) => <>
    <section className="metric-grid four-cols" aria-label="Páginas">
      <Tile label="Páginas vistas" value={number.format(data.totals.pageViews)} />
      <Tile label="Eventos" value={number.format(data.totals.events)} hint="Clics, desplazamientos y otras acciones" />
    </section>
    <h3 style={subtitle}>Páginas vistas por día</h3>
    <LineChart label="Páginas vistas por día" color={colors.BLUE} unit="vistas" data={(data.daily ?? []).map((d) => ({ date: d.date, value: d.pageViews }))} />
    <h3 style={subtitle}>Páginas más vistas</h3>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Página</th><th className="num">Vistas</th><th className="num">Usuarios</th></tr></thead><tbody>{(data.pages ?? []).map((row) => <tr key={row.path}><td>{row.path}</td><td className="num">{number.format(row.views)}</td><td className="num">{number.format(row.users)}</td></tr>)}</tbody></table></div>
  </>}</Summary>;
}

function AudienceSection({ days }: { days: number }) {
  return <Summary days={days} title="Audiencia">{(data) => <div style={grid}>
    <BarList title="Países" rows={data.countries} />
    <BarList title="Ciudades" rows={data.cities} />
    <BarList title="Dispositivos" rows={data.devices} format={(name) => labels.deviceLabel[name.toLowerCase()] ?? name} />
    <BarList title="Navegadores" rows={data.browsers} />
    <BarList title="Sistemas operativos" rows={data.systems} />
  </div>}</Summary>;
}
