import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// index.html reads this key before first paint, so a stored choice never flashes the other theme.
const KEY = "valleemapper:theme";
const DARK = "(prefers-color-scheme: dark)";

const systemTheme = (): Theme => (matchMedia(DARK).matches ? "dark" : "light");

function readChoice(): Theme | undefined {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : undefined;
  } catch {
    return undefined;
  }
}
function saveChoice(choice: Theme | undefined) {
  try {
    if (choice) localStorage.setItem(KEY, choice);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page closes.
  }
}

/** The theme in use and a toggle; a choice that matches the system is dropped so the system leads again. */
export function useTheme(): [Theme, () => void] {
  const [system, setSystem] = useState(systemTheme);
  const [choice, setChoice] = useState(readChoice);
  const theme = choice ?? system;

  useEffect(() => {
    const list = matchMedia(DARK);
    const change = () => setSystem(systemTheme());
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    const stored = next === system ? undefined : next;
    setChoice(stored);
    saveChoice(stored);
  };
  return [theme, toggle];
}
