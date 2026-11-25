/**
 * URL del WORLD público usada por el enlace «Abrir WORLD» de STUDIO.
 *
 * La dirección se inyecta en el build privado (`vite.studio.config.ts`) desde
 * `VITE_PUBLIC_WORLD_URL`. STUDIO nunca la deriva de su propio origen: el WORLD
 * publicado vive en otro host. En desarrollo, sin variable configurada, se usa
 * el WORLD local del servidor de Vite para no romper la navegación.
 */
const DEV_WORLD_URL = '/index.html';

function configuredUrl(): string | null {
  const injected =
    typeof __STUDIO_PUBLIC_WORLD_URL__ !== 'undefined'
      ? __STUDIO_PUBLIC_WORLD_URL__
      : (globalThis as typeof globalThis & { __STUDIO_PUBLIC_WORLD_URL__?: string }).__STUDIO_PUBLIC_WORLD_URL__;
  return typeof injected === 'string' && injected.trim() ? injected : null;
}

export function publicWorldUrl(): string {
  const configured = configuredUrl();
  if (configured) {
    try {
      const url = new URL(configured, location.href);
      if (!/^https?:$/.test(url.protocol)) throw new Error('protocolo no admitido');
      url.hash = '';
      return url.toString();
    } catch (error) {
      throw new Error(`[publicWorld] VITE_PUBLIC_WORLD_URL no es una URL válida: ${String(error)}`);
    }
  }

  if (import.meta.env.DEV) {
    const local = new URL(DEV_WORLD_URL, location.href);
    local.hash = '';
    return local.toString();
  }

  throw new Error('[publicWorld] Falta VITE_PUBLIC_WORLD_URL al compilar STUDIO.');
}
