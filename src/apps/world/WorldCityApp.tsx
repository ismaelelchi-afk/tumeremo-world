import { loadTheme, saveTheme } from '../../core/themePreferences';
import { documentStore, useDocumentState } from '../../core/store';
import { WorldCityView } from './WorldCityView';

/**
 * Envoltorio privado: usa el borrador del store y las preferencias guardadas.
 * `privateView` habilita `/usuario`; la vista pública no importa este archivo.
 */
export function WorldCityApp({ privateView = false }: { privateView?: boolean }) {
  const state = useDocumentState();
  return (
    <WorldCityView
      doc={state.doc}
      studioHref={privateView ? '/studio.html' : '#/studio'}
      showUnpublished={privateView}
      initialTheme={loadTheme()}
      onThemeChange={saveTheme}
      draftChip={
        state.hasDraft
          ? {
              source: state.source,
              onToggle: () => documentStore.setSource(state.source === 'draft' ? 'original' : 'draft'),
            }
          : null
      }
    />
  );
}
