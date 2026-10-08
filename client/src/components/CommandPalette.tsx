import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, UserRound, X } from "lucide-react";
import { api } from "../services/api";
import { useDialogBehavior } from "../lib/ui-hooks";
import { shortcutList, type NavItem } from "./navigation";

type Entry = { id: string; label: string; hint?: string; to: string; icon: NavItem["icon"] };

export function CommandPalette({ items, includeStudents, onClose }: { items: NavItem[]; includeStudents: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useDialogBehavior(onClose);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const students = useQuery({ queryKey: ["students", "palette"], queryFn: () => api.getAllStudents("ACTIVO"), enabled: includeStudents, staleTime: 60_000 });
  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = items.filter((item) => !q || item.label.toLowerCase().includes(q)).map((item) => ({ id: item.to, label: item.label, hint: item.shortcut ? `Alt+${item.shortcut}` : undefined, to: item.to, icon: item.icon }));
    const people = q.length < 2 ? [] : (students.data?.items ?? []).filter((s) => `${s.fullName} ${s.document}`.toLowerCase().includes(q)).slice(0, 8).map((s) => ({ id: s.id, label: s.fullName, hint: s.courseGroup ? `Curso ${s.courseGroup.label.replace(" · ", " ")}` : s.document, to: `/students/${s.id}`, icon: UserRound }));
    return [...people, ...pages];
  }, [items, query, students.data]);
  const open = (entry?: Entry) => { if (!entry) return; onClose(); navigate(entry.to); };

  return <div className="dialog-backdrop palette-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className="palette" role="dialog" aria-modal="true" aria-label="Buscar">
      <label className="palette-input"><Search size={18} aria-hidden="true" /><input value={query} placeholder={includeStudents ? "Buscar estudiante o sección…" : "Ir a…"} aria-label="Buscar" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={entries[active] ? `palette-${entries[active]!.id}` : undefined}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(entries.length - 1, i + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); } else if (e.key === "Enter") { e.preventDefault(); open(entries[active]); } }} />
        <kbd>Esc</kbd></label>
      <ul id="palette-list" role="listbox" className="palette-list">
        {entries.map((entry, index) => { const Icon = entry.icon; return <li key={entry.id} id={`palette-${entry.id}`} role="option" aria-selected={index === active} className={index === active ? "is-active" : ""} onMouseEnter={() => setActive(index)} onClick={() => open(entry)}><Icon size={17} aria-hidden="true" /><span>{entry.label}</span>{entry.hint && <small>{entry.hint}</small>}</li>; })}
        {!entries.length && <li className="palette-empty">Sin resultados para “{query}”.</li>}
      </ul>
    </section>
  </div>;
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useDialogBehavior(onClose);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className="form-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar atajos" title="Cerrar (Esc)"><X size={20} /></button>
      <h2 id="shortcuts-title">Atajos de teclado</h2>
      <dl className="shortcut-list">{shortcutList.map((item) => <div key={item.label}><dt>{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt><dd>{item.label}</dd></div>)}</dl>
      <p className="helper-text">En el celular usa el botón <strong>+</strong> de abajo para las acciones rápidas.</p>
    </section>
  </div>;
}
