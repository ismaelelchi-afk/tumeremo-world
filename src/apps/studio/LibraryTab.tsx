import { useEffect, useRef, useState } from 'react';
import type { ModelDef } from '../../core/types';
import { addGlbFile, customModelError, getCustomModelThumbnail } from '../../data/customModels';
import { useModelLibrary } from '../../data/models';
import { isI18nError, localizedText, useI18n } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

export function LibraryTab({ onAdd }: { onAdd: (m: ModelDef) => void }) {
  const models = useModelLibrary();
  const { lang, t, formatNumber } = useI18n();
  const groups: Array<[string, ModelDef[]]> = [
    [t('library.buildings'), models.filter((m) => m.category === 'building')],
    [t('library.objects'), models.filter((m) => m.category === 'object')],
  ];
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (customModelError) toast.show(t(customModelError), 6000);
  }, [toast.show, t]);

  const importFile = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const def = await addGlbFile(file);
      toast.show(t('library.added', { name: localizedText(def, 'name', lang) }), 4500);
    } catch (e) {
      toast.show(isI18nError(e) ? t(e.key, e.vars) : e instanceof Error ? e.message : t('library.importFailed'), 5500);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <button className="btn btn-primary w-full" onClick={() => fileInput.current?.click()} disabled={importing}>
          <Icon name="upload" size={18} /> {importing ? t('library.importing') : t('library.import3d')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".glb,model/gltf-binary"
          className="hidden"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
      </div>
      <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
        {t('library.hint')}
      </p>
      {groups.map(([title, models]) => (
        <section key={title}>
          <h3 className="label">{title}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {models.map((m) => {
              const thumb = getCustomModelThumbnail(m.id);
              const dims = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
              return (
                <button
                  key={m.id}
                  onClick={() => onAdd(m)}
                  className="group flex flex-col gap-2 rounded-2xl p-3 text-left"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
                  title={localizedText(m, 'description', lang)}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-xl${thumb ? ' overflow-hidden' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${m.defaults.wallColor}, ${m.defaults.accentColor})`, color: '#10161a' }}
                    >
                      {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" /> : <Icon name={m.category === 'building' ? 'building' : 'tree'} size={20} />}
                    </span>
                    <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                      <Icon name="plus" size={16} />
                    </span>
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-bold leading-tight">{localizedText(m, 'name', lang)}</span>
                    <span className="block pt-0.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>
                      {formatNumber(m.defaults.width, dims)}×{formatNumber(m.defaults.depth, dims)}×{formatNumber(m.defaults.height, dims)} m
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
        {t('library.note')}
      </p>
    </div>
  );
}
