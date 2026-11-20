import type { EntityRef, WorldDocument } from '../../core/types';
import { localizedText, useI18n } from '../../i18n';
import { getModel } from '../../data/models';
import { Icon } from '../../ui/Icon';

export function SceneTab({
  doc,
  selected,
  onSelect,
  onToggleVisible,
}: {
  doc: WorldDocument;
  selected: EntityRef | null;
  onSelect: (r: EntityRef) => void;
  onToggleVisible: (r: EntityRef, visible: boolean) => void;
}) {
  const { lang, t } = useI18n();
  const rows = [
    ...doc.buildings.map((e) => ({ ref: { kind: 'building', id: e.id } as EntityRef, e })),
    ...doc.objects.map((e) => ({ ref: { kind: 'object', id: e.id } as EntityRef, e })),
  ];
  return (
    <div className="space-y-1">
      <p className="pb-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>
        {t('scene.count', { buildings: doc.buildings.length, objects: doc.objects.length })}
      </p>
      {rows.length === 0 && <p className="py-8 text-center text-[13px]" style={{ color: 'var(--muted)' }}>{t('scene.empty')}</p>}
      {rows.map(({ ref, e }) => {
        const on = selected?.id === ref.id;
        const model = getModel(e.modelId);
        return (
          <div
            key={ref.id}
            className="flex items-center gap-1 rounded-xl pr-1"
            style={{ background: on ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : 'transparent'}` }}
          >
            <button className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left" onClick={() => onSelect(ref)}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: e.params.accentColor, color: '#10161a', opacity: e.visible ? 1 : 0.4 }}>
                <Icon name={ref.kind === 'building' ? 'building' : 'tree'} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold" style={{ opacity: e.visible ? 1 : 0.5 }}>{localizedText(e, 'name', lang)}</span>
                <span className="block truncate text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  {model ? localizedText(model, 'name', lang) : ''}
                  {e.origin === 'demo' ? t('scene.demo') : ''}
                </span>
              </span>
            </button>
            <button className="fab !h-9 !w-9" onClick={() => onToggleVisible(ref, !e.visible)} aria-label={e.visible ? t('common.hide') : t('common.show')}>
              <Icon name={e.visible ? 'eye' : 'eyeOff'} size={17} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
