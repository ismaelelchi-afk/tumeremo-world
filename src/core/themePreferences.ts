/**
 * Preferencia de tema SOLO para la entrada privada. La vista pública no importa este
 * módulo, por lo que su bundle no contiene escrituras en localStorage.
 */
import { VISUAL } from '../ui/useEngine';

const THEME_KEY = 'tumeremo-world:theme';

export function loadTheme(): string {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved && VISUAL.themes[saved] ? saved : VISUAL.defaultTheme;
  } catch {
    return VISUAL.defaultTheme;
  }
}

export function saveTheme(theme: string): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* preferencia local: si el almacenamiento está bloqueado, se ignora */
  }
}
