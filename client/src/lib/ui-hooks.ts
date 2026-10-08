import { useCallback, useEffect, useRef, useState } from "react";

function readStorage(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string | null) { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* almacenamiento no disponible */ } }

export type ThemeChoice = "system" | "light" | "dark";
const THEME_KEY = "aulanexo:theme";
export function applyStoredTheme() {
  const stored = readStorage(THEME_KEY);
  if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
}
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(() => { const stored = readStorage(THEME_KEY); return stored === "light" || stored === "dark" ? stored : "system"; });
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    writeStorage(THEME_KEY, theme === "system" ? null : theme);
  }, [theme]);
  const cycle = useCallback(() => setThemeState((current) => {
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const effectiveDark = current === "dark" || (current === "system" && systemDark);
    return effectiveDark ? "light" : "dark";
  }), []);
  return { theme, cycle };
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true); const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
export type HotkeyHandlers = { palette: () => void; help: () => void; search: () => void; go: (digit: string) => void; newStudent: () => void; theme: () => void };
// Atajos globales de teclado. Los que son letras sueltas no se activan mientras se escribe.
export function useHotkeys(handlers: HotkeyHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const h = ref.current;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); h.palette(); return; }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const digit = /^Digit([1-8])$/.exec(event.code)?.[1];
        if (digit) { event.preventDefault(); h.go(digit); return; }
        if (event.code === "KeyN") { event.preventDefault(); h.newStudent(); return; }
        if (event.code === "KeyT") { event.preventDefault(); h.theme(); return; }
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "?") { event.preventDefault(); h.help(); }
      else if (event.key === "/") { event.preventDefault(); h.search(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// Cierra con Escape y devuelve el foco al elemento que abrió la ventana.
export function useDialogBehavior(onClose: () => void) {
  const containerRef = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = containerRef.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.icon-button)");
    first?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);
  return containerRef;
}

// Borrador guardado en el navegador para no perder lo escrito si se recarga la página.
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => { const stored = readStorage(key); if (!stored) return initial; try { return { ...initial, ...JSON.parse(stored) } as T; } catch { return initial; } });
  useEffect(() => { writeStorage(key, JSON.stringify(value)); }, [key, value]);
  const clear = useCallback(() => { writeStorage(key, null); setValue(initial); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, setValue, clear] as const;
}
