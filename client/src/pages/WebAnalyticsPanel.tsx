import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

const number = new Intl.NumberFormat("es-CO");
const duration = (seconds: number) => `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
const deviceLabel: Record<string, string> = { desktop: "Computador", mobile: "Celular", tablet: "Tableta" };
const title = "Visitas al sitio (Google Analytics)";

export function WebAnalyticsPanel() {
  const [days, setDays] = useState(28);
  const query = useQuery({ queryKey: ["webAnalytics", days], queryFn: () => api.getPlatformAnalytics(days), refetchInterval: 60_000, retry: false });
  if (query.isLoading) return <article className="content-card"><h2>{title}</h2><p className="helper-text">Cargando…</p></article>;
  if (query.error || !query.data) return <article className="content-card"><h2>{title}</h2><p className="helper-text" role="alert">{query.error instanceof Error ? query.error.message : "No se pudieron cargar las estadísticas."}</p></article>;
  const data = query.data;
  if (!data.configured || !data.totals) return <article className="content-card"><h2>{title}</h2><p className="helper-text">Aún no está conectado. Define <code>GA_PROPERTY_ID</code> y <code>GA_SERVICE_ACCOUNT_JSON</code> en el servidor.</p></article>;
  const t = data.totals; const daily = data.daily ?? []; const max = Math.max(1, ...daily.map((row) => row.pageViews));
  return <article className="content-card">
    <div className="card-title-row"><h2>{title}</h2>
      <div className="segmented">{[7, 28, 90].map((value) => <button key={value} className={days === value ? "is-active" : ""} onClick={() => setDays(value)}>{value} días</button>)}</div></div>
    <div className="usage-strip"><span><strong>{data.realtimeUsers}</strong> en línea ahora</span><span><strong>{number.format(t.users)}</strong> usuarios</span><span><strong>{number.format(t.newUsers)}</strong> nuevos</span><span><strong>{number.format(t.sessions)}</strong> sesiones</span><span><strong>{number.format(t.pageViews)}</strong> páginas vistas</span><span><strong>{duration(t.avgSessionSeconds)}</strong> por sesión</span></div>
    <div role="img" aria-label="Páginas vistas por día" style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90, margin: "1rem 0" }}>
      {daily.map((row) => <div key={row.date} title={`${row.date.slice(6)}/${row.date.slice(4, 6)}: ${row.pageViews} vistas, ${row.users} usuarios`} style={{ flex: 1, height: `${Math.max(4, row.pageViews * 100 / max)}%`, background: "var(--blue)", borderRadius: 2 }} />)}
    </div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Página</th><th className="num">Vistas</th></tr></thead><tbody>{(data.pages ?? []).map((row) => <tr key={row.path}><td>{row.path}</td><td className="num">{number.format(row.views)}</td></tr>)}</tbody></table></div>
    <div className="usage-strip"><span>Países: {(data.countries ?? []).map((row) => `${row.name} (${row.users})`).join(" · ") || "—"}</span><span>Dispositivos: {(data.devices ?? []).map((row) => `${deviceLabel[row.name] ?? row.name} (${row.users})`).join(" · ") || "—"}</span></div>
  </article>;
}
