import { BookOpenText, ChevronRight, Command, LogOut, Menu, Moon, NotebookPen, Plus, QrCode, Search, Sun, UserPlus, WifiOff, X } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AuthUserDto } from "../../../shared/types";
import { api } from "../services/api";
import { useHotkeys, useOnlineStatus, useTheme } from "../lib/ui-hooks";
import { CommandPalette, ShortcutsHelp } from "./CommandPalette";
import { StatusChip } from "./Feedback";
import { Byline } from "./Byline";
import { adminItems, breadcrumbsFor, home, monitoring, navItemsFor, sections, type NavItem } from "./navigation";

function NavItemLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon;
  return <NavLink to={item.to} end onClick={onClick} title={item.shortcut ? `${item.label} (Alt+${item.shortcut})` : item.label} className={({ isActive }) => `nav-link tone-${item.tone} ${isActive ? "is-active" : ""}`}>
    <span className="nav-icon"><Icon size={17} aria-hidden="true" /></span>
    <span className="nav-label">{item.label}</span>
    {item.step && <span className="nav-step" aria-label={`Paso ${item.step}`}>{item.step}</span>}
  </NavLink>;
}

function NavContent({ platformAdmin, isAdmin, onNavigate }: { platformAdmin: boolean; isAdmin: boolean; onNavigate?: () => void }) {
  if (platformAdmin) return <nav className="nav-list" aria-label="Módulos"><NavItemLink item={monitoring} onClick={onNavigate} /></nav>;
  return <nav className="nav-list" aria-label="Módulos">
    <NavItemLink item={home} onClick={onNavigate} />
    {sections.map((section) => <div className="nav-section" key={section.title}><p className="nav-section-title">{section.title}</p>{section.items.map((item) => <NavItemLink key={item.to} item={item} onClick={onNavigate} />)}</div>)}
    {isAdmin && <div className="nav-section"><p className="nav-section-title">Administración</p>{adminItems.map((item) => <NavItemLink key={item.to} item={item} onClick={onNavigate} />)}</div>}
  </nav>;
}

const quickActions = [
  { to: "/attendance", label: "Tomar asistencia", icon: QrCode, tone: "green" },
  { to: "/academic", label: "Registrar notas", icon: NotebookPen, tone: "violet" },
  { to: "/observations", label: "Nueva observación", icon: BookOpenText, tone: "coral" },
  { to: "/students?nuevo=1", label: "Nuevo estudiante", icon: UserPlus, tone: "blue" },
];

export function AppShell({ user, children }: { user: AuthUserDto; children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const { cycle: cycleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const isAdmin = user.role === "ADMIN";
  const platformAdmin = Boolean(user.platformAdmin);
  const items = navItemsFor(user);
  const crumbs = breadcrumbsFor(location.pathname, items);
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => { queryClient.clear(); navigate(0); } });
  useEffect(() => { setDrawerOpen(false); setActionsOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!drawerOpen && !actionsOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawerOpen(false); setActionsOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, actionsOpen]);
  useHotkeys({
    palette: () => setPaletteOpen(true),
    help: () => setHelpOpen(true),
    search: () => { const field = document.querySelector<HTMLInputElement>("main .search-field input, main [data-search]"); if (field) field.focus(); else setPaletteOpen(true); },
    go: (digit) => { const target = items.find((item) => item.shortcut === digit); if (target) navigate(target.to); },
    newStudent: () => { if (!platformAdmin) navigate("/students?nuevo=1"); },
    theme: cycleTheme,
  });

  return <div className="app-shell">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <aside className="sidebar" aria-label="Navegación principal">
      <Link to="/" className="brand brand-sidebar" aria-label="SIRAE, ir al inicio"><span className="brand-card"><img className="brand-logo" src="/sirae-logo.webp" alt="SIRAE" width={128} height={83} /></span><small>Registro de asistencia educativa</small></Link>
      <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)} title="Buscar (Ctrl+K)"><Search size={16} aria-hidden="true" /><span>Buscar…</span><kbd>Ctrl K</kbd></button>
      <NavContent platformAdmin={platformAdmin} isAdmin={isAdmin} />
      <div className="sidebar-footer">
        <div className="user-card"><span className="avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong>{platformAdmin ? <span className="status-chip status-admin">Monitoreo</span> : <StatusChip status={user.role === "ADMIN" ? "DOCENTE" : user.role || "DOCENTE"} />}</div></div>
        <button type="button" className="logout-button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={17} aria-hidden="true" /><span>{logout.isPending ? "Cerrando…" : "Cerrar sesión"}</span></button>
        <Link to="/legal" className="sidebar-legal">Términos y privacidad</Link>
        <Byline variant="dark" />
      </div>
    </aside>

    {drawerOpen && <div className="drawer-backdrop" role="presentation" onClick={() => setDrawerOpen(false)}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menú" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><span className="brand-card"><img className="brand-logo" src="/sirae-logo.webp" alt="SIRAE" width={128} height={83} /></span><button className="icon-only drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" title="Cerrar menú"><X size={20} /></button></div>
        <NavContent platformAdmin={platformAdmin} isAdmin={isAdmin} onNavigate={() => setDrawerOpen(false)} />
        <div className="sidebar-footer"><div className="user-card"><span className="avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong></div></div><button type="button" className="logout-button" onClick={() => logout.mutate()}><LogOut size={17} aria-hidden="true" /><span>Cerrar sesión</span></button><Byline variant="dark" /></div>
      </aside>
    </div>}

    <main className="main-content" id="contenido" tabIndex={-1}>
      <header className="context-bar">
        <button className="topbar-button menu-button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú" title="Menú"><Menu size={20} /></button>
        <nav className="breadcrumbs" aria-label="Ubicación"><ol>{crumbs.map((crumb, index) => <li key={crumb.to + index}>{index > 0 && <ChevronRight size={14} aria-hidden="true" />}{index === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link to={crumb.to}>{crumb.label}</Link>}</li>)}</ol></nav>
        <div className="topbar-actions">
          <button className="topbar-button" onClick={() => setPaletteOpen(true)} aria-label="Buscar" title="Buscar (Ctrl+K)"><Search size={18} /></button>
          <button className="topbar-button desktop-only" onClick={() => setHelpOpen(true)} aria-label="Atajos de teclado" title="Atajos de teclado (?)"><Command size={18} /></button>
          <button className="topbar-button" onClick={cycleTheme} aria-label="Cambiar tema claro u oscuro" title="Tema claro/oscuro (Alt+T)"><Sun size={18} className="icon-light" /><Moon size={18} className="icon-dark" /></button>
        </div>
      </header>
      {!online && <div className="offline-banner" role="status"><WifiOff size={16} aria-hidden="true" /> Sin conexión. Los escaneos de asistencia se guardan en este dispositivo y se enviarán al reconectar.</div>}
      {children}
    </main>

    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
      {(platformAdmin ? [monitoring] : [home, ...sections[0]!.items.slice(0, 1), ...sections[1]!.items.slice(0, 1), sections[0]!.items[1]!]).map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end className={({ isActive }) => `mobile-nav-link ${isActive ? "is-active" : ""}`}><Icon size={21} aria-hidden="true" /><span>{item.label.split(" ")[0]}</span></NavLink>; })}
      <button type="button" className="mobile-nav-link" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú completo"><Menu size={21} aria-hidden="true" /><span>Menú</span></button>
    </nav>

    {!platformAdmin && <div className="quick-actions">
      {actionsOpen && <div className="quick-actions-sheet" role="menu" aria-label="Acciones rápidas">{quickActions.map((action) => { const Icon = action.icon; return <Link key={action.to} role="menuitem" to={action.to} className={`quick-action tone-${action.tone}`}><span className="nav-icon"><Icon size={18} aria-hidden="true" /></span>{action.label}</Link>; })}</div>}
      <button type="button" className={`fab ${actionsOpen ? "is-open" : ""}`} onClick={() => setActionsOpen((open) => !open)} aria-expanded={actionsOpen} aria-label={actionsOpen ? "Cerrar acciones rápidas" : "Acciones rápidas"} title="Acciones rápidas"><Plus size={26} /></button>
    </div>}

    {paletteOpen && <CommandPalette items={items} includeStudents={!platformAdmin} onClose={() => setPaletteOpen(false)} />}
    {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
  </div>;
}
