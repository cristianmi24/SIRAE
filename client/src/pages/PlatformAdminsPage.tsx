import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { api } from "../services/api";

const dateFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
function relative(value?: string) {
  if (!value) return "Nunca";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `Hace ${days} ${days === 1 ? "día" : "días"}` : dateFormat.format(new Date(value));
}
function tone(value?: string) {
  if (!value) return "idle";
  const days = (Date.now() - new Date(value).getTime()) / 86400000;
  return days <= 7 ? "active" : days <= 30 ? "recent" : "idle";
}

export function PlatformAdminsPage() {
  const query = useQuery({ queryKey: ["platformAdmins"], queryFn: api.getPlatformAdmins, refetchInterval: 60_000 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "INSTITUTION" | "PERSONAL">("ALL");
  const admins = query.data?.admins;
  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (admins ?? []).filter((row) => (filter === "ALL" || row.institutionType === filter) && (!text || `${row.name} ${row.email} ${row.institutionName}`.toLowerCase().includes(text)));
  }, [admins, search, filter]);
  if (query.isLoading) return <LoadingState label="Cargando administradores…" />;
  if (query.error || !query.data) return <div className="page"><ErrorPanel title="No se pudieron cargar los administradores" detail={query.error instanceof Error ? query.error.message : undefined} /></div>;
  const { pending } = query.data;
  const all = query.data.admins;
  const count = (type: "INSTITUTION" | "PERSONAL") => all.filter((row) => row.institutionType === type).length;

  return <section className="page">
    <div className="page-heading"><div><h1>Administradores</h1><p className="page-subtitle">Quién administra cada institución o aula, cuándo entró por última vez y qué invitaciones de administrador siguen pendientes.</p></div></div>
    <article className="content-card">
      <div className="card-title-row">
        <div className="segmented" role="tablist">
          {([["ALL", `Todos (${all.length})`], ["INSTITUTION", `Instituciones (${count("INSTITUTION")})`], ["PERSONAL", `Aulas de docentes (${count("PERSONAL")})`]] as const).map(([value, text]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{text}</button>)}
        </div>
        <label className="search-field compact-search"><Search size={16} aria-hidden="true" /><input aria-label="Buscar" placeholder="Nombre, correo o institución" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      {rows.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Administrador</th><th>Administra</th><th>Estado</th><th>Última vez</th><th>Registro</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.id}-${row.institutionId}`}>
          <td><strong>{row.name}</strong><small className="cell-sub">{row.email}</small></td>
          <td>{row.institutionName}<small className="cell-sub">{row.institutionType === "INSTITUTION" ? "Institución" : "Aula personal"}</small></td>
          <td>{row.active && row.institutionActive ? "Activo" : !row.active ? "Cuenta desactivada" : "Institución desactivada"}</td>
          <td><span className={`activity activity-${tone(row.lastSeenAt)}`}>{relative(row.lastSeenAt)}</span></td>
          <td className="muted">{row.createdAt ? dateFormat.format(new Date(row.createdAt)) : "—"}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-state">{all.length ? "Nadie coincide con la búsqueda." : "Todavía no hay administradores."}</p>}
    </article>
    <article className="content-card">
      <h2>Invitaciones de administrador pendientes ({pending.length})</h2>
      {pending.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Correo invitado</th><th>Institución</th><th>Vence</th></tr></thead>
        <tbody>{pending.map((row) => <tr key={row.id}><td>{row.email}</td><td>{row.institutionName}</td><td className="muted">{dateFormat.format(new Date(row.expiresAt))}</td></tr>)}</tbody>
      </table></div> : <p className="empty-state">No hay invitaciones pendientes.</p>}
    </article>
  </section>;
}
