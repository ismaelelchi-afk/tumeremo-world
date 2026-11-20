import { BUSINESS_CATEGORIES, businessCategoryLabel } from '../../core/labels';
import type { Business, BusinessCategory, WorldDocument } from '../../core/types';
import { localizedText, useI18n } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { Field, Toggle } from './fields';

interface Props {
  doc: WorldDocument;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onCreate: () => void;
  onPatch: (id: string, patch: Partial<Business>) => void;
  onRemove: (id: string) => void;
  onShowBuilding: (buildingId: string) => void;
}

export function BusinessTab({ doc, editingId, onEdit, onCreate, onPatch, onRemove, onShowBuilding }: Props) {
  const { lang, t } = useI18n();
  const biz = doc.businesses.find((b) => b.id === editingId);

  if (!biz) {
    return (
      <div className="space-y-3">
        <button className="btn btn-primary w-full" onClick={onCreate}>
          <Icon name="plus" size={18} /> {t('business.newProfile')}
        </button>
        {doc.businesses.length === 0 && (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
            {t('business.empty')}
          </p>
        )}
        <div className="space-y-2">
          {doc.businesses.map((b) => {
            const building = doc.buildings.find((x) => x.id === b.buildingId);
            return (
              <button
                key={b.id}
                onClick={() => onEdit(b.id)}
                className="flex w-full items-center gap-3 rounded-2xl p-3 text-left"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: b.color, color: '#10161a' }}>
                  <Icon name="store" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{localizedText(b, 'name', lang)}</span>
                  <span className="block truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                    {building ? localizedText(building, 'name', lang) : t('business.noBuilding')} · {b.published ? t('business.published') : t('business.draft')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Business>) => onPatch(biz.id, patch);
  return (
    <div className="space-y-4">
      <button className="btn btn-sm" onClick={() => onEdit(null)}>
        <Icon name="back" size={16} /> {t('business.all')}
      </button>
      <Field label={t('business.nameField')}>
        <input className="field" value={localizedText(biz, 'name', lang)} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-[1fr_72px] gap-3">
        <Field label={t('common.category')}>
          <select className="field" value={biz.category} onChange={(e) => set({ category: e.target.value as BusinessCategory })}>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {businessCategoryLabel(c, lang)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.color')}>
          <input type="color" value={biz.color} onChange={(e) => set({ color: e.target.value })} aria-label={t('business.colorAria')} />
        </Field>
      </div>
      <Field label={t('business.buildingField')}>
        <div className="flex gap-2">
          <select className="field" value={biz.buildingId ?? ''} onChange={(e) => set({ buildingId: e.target.value || null })}>
            <option value="">{t('business.noBuildingOption')}</option>
            {doc.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {localizedText(b, 'name', lang)}
              </option>
            ))}
          </select>
          {biz.buildingId && (
            <button className="btn btn-sm !min-h-[40px]" onClick={() => onShowBuilding(biz.buildingId!)} aria-label={t('business.showOnMapAria')}>
              <Icon name="pin" size={16} />
            </button>
          )}
        </div>
      </Field>
      <Field label={t('common.description')}>
        <textarea className="field" value={localizedText(biz, 'description', lang)} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label={t('business.hoursField')}>
        <input className="field" placeholder={t('business.hoursPlaceholder')} value={localizedText(biz, 'hours', lang)} onChange={(e) => set({ hours: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-3">
        <Field label={t('business.phoneField')}>
          <input className="field" inputMode="tel" value={biz.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label={t('business.whatsapp')}>
          <input className="field" inputMode="tel" placeholder="58412…" value={biz.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
        </Field>
        <Field label="Instagram">
          <input className="field" placeholder="@usuario" value={biz.instagram} onChange={(e) => set({ instagram: e.target.value })} />
        </Field>
      </div>
      <Toggle label={t('business.publishedToggle')} on={biz.published} onChange={(v) => set({ published: v })} />
      {biz.published && !biz.buildingId && (
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
          {t('business.warning')}
        </p>
      )}
      <button
        className="btn btn-danger w-full"
        onClick={() => {
          if (window.confirm(t('business.deleteConfirm', { name: localizedText(biz, 'name', lang) }))) onRemove(biz.id);
        }}
      >
        <Icon name="trash" size={17} /> {t('business.delete')}
      </button>
    </div>
  );
}
