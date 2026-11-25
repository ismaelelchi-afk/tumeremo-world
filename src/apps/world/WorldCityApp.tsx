import { loadTheme, saveTheme } from '../../core/themePreferences';
import { documentStore, useDocumentState } from '../../core/store';
import { WorldCityView } from './WorldCityView';

/**
 * Vista privada de `/usuario`: el mismo borrador y los mismos GLB que STUDIO,
 * con elementos no publicados. La entrada pública no importa este archivo.
 */
export function WorldCityApp() {
  const state = useDocumentState();
  return (
    <WorldCityView
      doc={state.doc}
      studioHref="/studio.html"
      showUnpublished
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
