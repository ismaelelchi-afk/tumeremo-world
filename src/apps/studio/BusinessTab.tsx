import { BUSINESS_CATEGORIES, businessCategoryLabel } from '../../core/labels';
import type { Business, BusinessCategory, WorldDocument } from '../../core/types';
import { FEATURE_PROFILES } from '../../data/featureBusinesses';
import { localizedText, useI18n } from '../../i18n';
import { ConfirmButton } from '../../ui/ConfirmButton';
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
  onDuplicate: (id: string) => void;
}

export function BusinessTab({ doc, editingId, onEdit, onCreate, onPatch, onRemove, onShowBuilding, onDuplicate }: Props) {
  const { lang, t } = useI18n();
  const biz = doc.businesses.find((b) => b.id === editingId);
  const photos = biz ? FEATURE_PROFILES.find((p) => p.businessId === biz.id)?.photos ?? [] : [];

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
              <div
                key={b.id}
                className="flex items-center gap-1 rounded-2xl pr-1"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
              >
                <button onClick={() => onEdit(b.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
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
                <button
                  className="fab !h-11 !w-11"
                  onClick={() => onDuplicate(b.id)}
                  aria-label={t('common.duplicate')}
                  title={t('common.duplicate')}
                >
                  <Icon name="copy" size={17} />
                </button>
                <ConfirmButton
                  className="shrink-0"
                  triggerClassName="fab !h-11 !w-11"
                  triggerStyle={{ color: 'var(--danger)' }}
                  label={t('business.delete')}
                  message={t('business.deleteConfirm', { name: localizedText(b, 'name', lang) })}
                  onConfirm={() => onRemove(b.id)}
                />
              </div>
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
            <button className="btn btn-sm !min-h-11" onClick={() => onShowBuilding(biz.buildingId!)} aria-label={t('business.showOnMapAria')}>
              <Icon name="pin" size={16} />
            </button>
          )}
        </div>
      </Field>
      <Field label={t('common.description')}>
        <textarea className="field" value={localizedText(biz, 'description', lang)} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {photos.length > 0 && (
        <section className="space-y-2">
          <h3 className="label !mb-0">{t('business.photos')}</h3>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src) => (
              <img key={src} src={src} alt="" className="h-20 w-full rounded-lg object-cover" loading="lazy" />
            ))}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            {t('business.photosNote')}
          </p>
        </section>
      )}
      <Field label={t('business.hoursField')}>
        <input className="field" placeholder={t('business.hoursPlaceholder')} value={localizedText(biz, 'hours', lang)} onChange={(e) => set({ hours: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-3">
        <Field label={t('business.phoneField')}>
          <input className="field" inputMode="tel" value={biz.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label={t('business.whatsapp')}>
          <input className="field" inputMode="tel" placeholder={t('business.whatsappPlaceholder')} value={biz.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
        </Field>
        <Field label={t('shop.instagram')}>
          <input className="field" placeholder={t('business.instagramPlaceholder')} value={biz.instagram} onChange={(e) => set({ instagram: e.target.value })} />
        </Field>
      </div>
      <Toggle label={t('business.publishedToggle')} on={biz.published} onChange={(v) => set({ published: v })} />
      {biz.published && !biz.buildingId && (
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
          {t('business.warning')}
        </p>
      )}
      <button className="btn w-full" onClick={() => onDuplicate(biz.id)}>
        <Icon name="copy" size={17} /> {t('common.duplicate')}
      </button>
      <ConfirmButton
        className="w-full"
        triggerClassName="btn btn-danger w-full !min-h-11"
        label={t('business.delete')}
        message={t('business.deleteConfirm', { name: localizedText(biz, 'name', lang) })}
        onConfirm={() => onRemove(biz.id)}
        showLabel
      />
    </div>
  );
}
