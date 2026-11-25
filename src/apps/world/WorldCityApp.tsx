import { loadTheme, saveTheme } from '../../core/themePreferences';
import { documentStore, useDocumentState } from '../../core/store';
import { WorldCityView } from './WorldCityView';

/** Envoltorio privado: conserva el borrador local, el enlace a STUDIO y las preferencias. */
export function WorldCityApp() {
  const state = useDocumentState();
  return (
    <WorldCityView
      doc={state.doc}
      studioHref="#/studio"
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
