import { useEffect } from 'react';
import { StudioApp } from './apps/studio/StudioApp';
import { WorldCityApp } from './apps/world/WorldCityApp';
import { useI18n } from './i18n';

export type PrivateMode = 'studio' | 'user';

/**
 * Router privado: solo STUDIO y la vista de USUARIO sobre el mismo borrador.
 * La entrada pública no importa este archivo.
 */
export default function App({ mode }: { mode: PrivateMode }) {
  const { t } = useI18n();

  useEffect(() => {
    document.title = t(mode === 'studio' ? 'app.studio' : 'app.user');
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      t(mode === 'studio' ? 'app.studioDescription' : 'app.userDescription'),
    );
  }, [mode, t]);

  return mode === 'studio' ? <StudioApp /> : <WorldCityApp />;
}
