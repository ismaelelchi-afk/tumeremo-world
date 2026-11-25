/**
 * Persistencia de idioma SOLO para la entrada privada. La entrada pública no importa este
 * módulo: su idioma arranca en `es` y el selector funciona en memoria durante la sesión.
 */
import { getLang, LANG_KEY, setLang, subscribeLang } from './language';
import type { Lang } from './types';

const isLang = (v: unknown): v is Lang => v === 'es' || v === 'pt-BR';

export function installLanguagePersistence(): void {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) setLang(saved);
  } catch {
    /* almacenamiento bloqueado: se conserva el idioma predeterminado */
  }

  subscribeLang(() => {
    try {
      localStorage.setItem(LANG_KEY, getLang());
    } catch {
      /* la selección sigue activa en memoria aunque no se pueda persistir */
    }
  });
}
