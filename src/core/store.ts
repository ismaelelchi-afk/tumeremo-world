import { useSyncExternalStore } from 'react';
import { isI18nError, type TranslationKey } from '../i18n/translate';
import { repository, seedDocument, type LoadStatus } from './repository';
import type { WorldDocument } from './types';

export type DocSource = 'draft' | 'original';

/** Estado de recuperación cuando el borrador no se pudo leer. Nunca se sobrescribe en silencio. */
export interface RecoveryInfo {
  status: Exclude<LoadStatus, 'empty' | 'ok'>;
  hasRaw: boolean;
  /** Copia íntegra del borrador, para que el usuario pueda descargarla antes de seguir. */
  raw?: string;
  quarantineKey?: string;
}

interface State {
  doc: WorldDocument;
  past: WorldDocument[];
  future: WorldDocument[];
  source: DocSource;
  /** Há rascunho local salvo? */
  hasDraft: boolean;
  savedAt: number | null;
  saving: boolean;
  /** Cambios en memoria todavía no persistidos (o con el guardado fallido). */
  dirty: boolean;
  saveError: TranslationKey | null;
  recovery: RecoveryInfo | null;
}

const MAX_HISTORY = 100;
const COALESCE_MS = 700;

/**
 * Armazém único do documento (compartilhado por WORLD e STUDIO), com histórico de desfazer/refazer
 * e salvamento local automático quando `autosave` está ativo (apenas no STUDIO).
 *
 * El autoguardado queda suspendido mientras exista un documento en recuperación, para que un
 * borrador corrupto jamás sea reemplazado por la semilla sin confirmación del usuario.
 */
class DocumentStore {
  private state!: State;
  private listeners = new Set<() => void>();
  private draft: WorldDocument | null = null;
  private lastKey: string | null = null;
  private lastAt = 0;
  private timer: number | null = null;
  private _autosave = false;
  private requestedAutosave = false;

  get autosave(): boolean {
    return this._autosave;
  }

  set autosave(value: boolean) {
    this.requestedAutosave = value;
    this._autosave = value && !this.state?.recovery;
  }

  async init(): Promise<void> {
    const loaded = await repository.load();
    this.draft = loaded.doc;
    const doc = this.draft ?? seedDocument();
    this.state = {
      doc,
      past: [],
      future: [],
      source: this.draft ? 'draft' : 'original',
      hasDraft: !!this.draft,
      savedAt: null,
      saving: false,
      dirty: false,
      saveError: null,
      recovery:
        loaded.status === 'ok' || loaded.status === 'empty'
          ? null
          : { status: loaded.status, hasRaw: !!loaded.raw, raw: loaded.raw, quarantineKey: loaded.quarantineKey },
    };
    this._autosave = this.requestedAutosave && !this.state.recovery;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Aplica uma mudança. Chamadas seguidas com a mesma `key` em < 700 ms viram um único passo. */
  update(fn: (d: WorldDocument) => WorldDocument, key?: string) {
    const prev = this.state.doc;
    const mutated = fn(prev);
    // Una operación que no cambia nada (id inexistente) no crea pasos «fantasma» de historial.
    if (mutated === prev) return;
    const next = { ...mutated, updatedAt: new Date().toISOString() };
    const now = Date.now();
    const coalesce = key && key === this.lastKey && now - this.lastAt < COALESCE_MS;
    this.lastKey = key ?? null;
    this.lastAt = now;
    const past = coalesce ? this.state.past : [...this.state.past, prev].slice(-MAX_HISTORY);
    this.state = { ...this.state, doc: next, past, future: [], dirty: true, saveError: null };
    this.emit();
    this.scheduleSave();
  }

  /** Encerra uma sequência coalescida (ex.: fim de um arraste). */
  breakCoalesce() {
    this.lastKey = null;
  }

  undo() {
    const { past, doc, future } = this.state;
    if (!past.length) return;
    this.lastKey = null;
    this.state = { ...this.state, doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], dirty: true };
    this.emit();
    this.scheduleSave();
  }

  redo() {
    const { past, doc, future } = this.state;
    if (!future.length) return;
    this.lastKey = null;
    this.state = { ...this.state, doc: future[0], past: [...past, doc], future: future.slice(1), dirty: true };
    this.emit();
    this.scheduleSave();
  }

  /** Substitui o documento inteiro (importação / restaurar original). Entra no histórico. */
  replace(doc: WorldDocument) {
    this.update(() => doc);
    this.lastKey = null;
  }

  /** WORLD: alternar entre rascunho local e versão original sem tocar no armazenamento. */
  setSource(source: DocSource) {
    const doc = source === 'draft' && this.draft ? this.draft : seedDocument();
    this.state = { ...this.state, doc, source, past: [], future: [] };
    this.emit();
  }

  /** Remove o rascunho local e volta à versão original. */
  async discardDraft() {
    if (this.timer) window.clearTimeout(this.timer);
    try {
      await repository.clear();
      await repository.clearBackups();
      await repository.clearQuarantine();
    } catch {
      // Las operaciones usan safeStorage: no pueden lanzar, pero el contrato puede cambiar.
    }
    this.draft = null;
    this.state = {
      ...this.state,
      doc: seedDocument(),
      source: 'original',
      hasDraft: false,
      past: [],
      future: [],
      savedAt: null,
      dirty: false,
      saveError: null,
      recovery: null,
    };
    this._autosave = this.requestedAutosave;
    this.emit();
  }

  /**
   * El usuario ha decidido qué hacer con el borrador corrupto: se reanuda el autoguardado.
   * Por defecto se conservan la cuarentena y los backups: solo `discardDraft()` (confirmado)
   * puede borrarlos.
   */
  resolveRecovery(clearCopies = false) {
    if (!this.state.recovery) return;
    if (clearCopies) void Promise.all([repository.clearQuarantine(), repository.clearBackups()]);
    this.state = { ...this.state, recovery: null };
    this._autosave = this.requestedAutosave;
    this.emit();
  }

  /** Limpia el aviso de error para que un segundo fallo idéntico vuelva a notificarse. */
  clearSaveError() {
    if (!this.state.saveError) return;
    this.state = { ...this.state, saveError: null };
    this.emit();
  }

  /** Guarda ahora. Devuelve `false` si el almacenamiento falló o hay una recuperación pendiente. */
  async saveNow(): Promise<boolean> {
    if (this.timer) window.clearTimeout(this.timer);
    if (this.state.recovery) return false;
    this.state = { ...this.state, saving: true, saveError: null };
    this.emit();
    try {
      await repository.save(this.state.doc);
      this.draft = this.state.doc;
      this.state = {
        ...this.state,
        saving: false,
        savedAt: Date.now(),
        hasDraft: true,
        source: 'draft',
        dirty: false,
        saveError: null,
      };
      this.emit();
      return true;
    } catch (e) {
      this.state = {
        ...this.state,
        saving: false,
        dirty: true,
        saveError: isI18nError(e) ? e.key : 'storage.saveFailed',
      };
      this.emit();
      return false;
    }
  }

  private scheduleSave() {
    if (!this.autosave) return;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.saveNow(), 500);
  }
}

export const documentStore = new DocumentStore();

export function useDocumentState(): State {
  return useSyncExternalStore(documentStore.subscribe, documentStore.getState);
}
