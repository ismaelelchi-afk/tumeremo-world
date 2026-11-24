/**
 * Acceso seguro a `localStorage`. Todas las operaciones están protegidas porque el
 * almacenamiento puede estar bloqueado (modo privado, cuota agotada, políticas del navegador).
 * Ninguna lectura/escritura debe poder dejar la aplicación en blanco.
 */

export interface SafeRead {
  value: string | null;
  /** true cuando el navegador impidió leer (no confundir con «clave inexistente»). */
  failed: boolean;
}

export function safeRead(key: string): SafeRead {
  try {
    return { value: localStorage.getItem(key), failed: false };
  } catch {
    return { value: null, failed: true };
  }
}

export function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Claves con un prefijo dado, sin lanzar si el almacenamiento es inaccesible. */
export function safeKeys(prefix: string): string[] {
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) out.push(key);
    }
    return out;
  } catch {
    return [];
  }
}

/** Elimina todas las claves con un prefijo; devuelve cuántas se pudieron borrar. */
export function safeRemovePrefix(prefix: string): number {
  return safeKeys(prefix).reduce((n, key) => n + (safeRemove(key) ? 1 : 0), 0);
}
