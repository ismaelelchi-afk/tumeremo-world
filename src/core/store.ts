import { useSyncExternalStore } from 'react';
import { repository, seedDocument } from './repository';
import type { WorldDocument } from './types';

export type DocSource = 'draft' | 'original';

interface State {
  doc: WorldDocument;
  past: WorldDocument[];
  future: WorldDocument[];
  source: DocSource;
  /** Há rascunho local salvo? */
  hasDraft: boolean;
  savedAt: number | null;
  saving: boolean;
}

const MAX_HISTORY = 100;
const COALESCE_MS = 700;

/**
 * Armazém único do documento (compartilhado por WORLD e STUDIO), com histórico de desfazer/refazer
 * e salvamento local automático quando `autosave` está ativo (apenas no STUDIO).
 */
class DocumentStore {
  private state!: State;
  private listeners = new Set<() => void>();
  private draft: WorldDocument | null = null;
  private lastKey: string | null = null;
  private lastAt = 0;
  private timer: number | null = null;
  autosave = false;

  async init(): Promise<void> {
    this.draft = await repository.load();
    const doc = this.draft ?? seedDocument();
    this.state = {
      doc,
      past: [],
      future: [],
      source: this.draft ? 'draft' : 'original',
      hasDraft: !!this.draft,
      savedAt: null,
      saving: false,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Aplica uma mudança. Chamadas seguidas com a mesma `key` em < 700 ms viram um único passo de histórico. */
  update(fn: (d: WorldDocument) => WorldDocument, key?: string) {
    const prev = this.state.doc;
    const next = { ...fn(prev), updatedAt: new Date().toISOString() };
    const now = Date.now();
    const coalesce = key && key === this.lastKey && now - this.lastAt < COALESCE_MS;
    this.lastKey = key ?? null;
    this.lastAt = now;
    const past = coalesce ? this.state.past : [...this.state.past, prev].slice(-MAX_HISTORY);
    this.state = { ...this.state, doc: next, past, future: [] };
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
    this.state = { ...this.state, doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future] };
    this.emit();
    this.scheduleSave();
  }

  redo() {
    const { past, doc, future } = this.state;
    if (!future.length) return;
    this.lastKey = null;
    this.state = { ...this.state, doc: future[0], past: [...past, doc], future: future.slice(1) };
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
    await repository.clear();
    this.draft = null;
    this.state = { ...this.state, doc: seedDocument(), source: 'original', hasDraft: false, past: [], future: [], savedAt: null };
    this.emit();
  }

  async saveNow() {
    if (this.timer) window.clearTimeout(this.timer);
    this.state = { ...this.state, saving: true };
    this.emit();
    await repository.save(this.state.doc);
    this.draft = this.state.doc;
    this.state = { ...this.state, saving: false, savedAt: Date.now(), hasDraft: true, source: 'draft' };
    this.emit();
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
