import { coverageNotes } from '../../geo/geography';
import { useI18n } from '../../i18n';
import { Icon, LogoMark } from '../../ui/Icon';

export function AboutPanel({ onClose, studioHref }: { onClose: () => void; studioHref: string }) {
  const { lang, t } = useI18n();
  const coverage = coverageNotes(lang);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-label={t('about.aria')}>
      <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label={t('common.close')} />
      <div className="glass rise scroll-y relative max-h-[86dvh] w-full max-w-[520px] rounded-t-[28px] p-6 pb-[calc(var(--safe-b)+24px)] md:rounded-[28px] md:pb-6">
        <button className="fab absolute right-3 top-3" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" size={18} />
        </button>
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <div>
            <h2 className="text-lg font-extrabold tracking-[0.14em]">{t('app.world')}</h2>
            <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
              {t('about.location')}
            </p>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed">
          {t('about.intro')}
        </p>
        <h3 className="label mt-5">{t('about.dataTitle')}</h3>
        <ul className="space-y-1.5 text-[13px] leading-relaxed">
          <li>• {t('about.streets')}</li>
          <li>• {coverage.roads}</li>
          <li>• {coverage.buildings}</li>
          <li>• {t('about.demoItems')}</li>
          <li>• {t('about.noRelief')}</li>
        </ul>
        <h3 className="label mt-5">{t('about.navigateTitle')}</h3>
        <ul className="space-y-1.5 text-[13px] leading-relaxed">
          <li>• {t('about.navDrag')}</li>
          <li>• {t('about.navPitch')}</li>
          <li>• {t('about.navPick')}</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <a className="btn btn-sm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            {t('about.openStreetMap')} <Icon name="external" size={14} />
          </a>
          <a className="btn btn-sm" href={studioHref}>
            {t('about.openStudio')}
          </a>
        </div>
      </div>
    </div>
  );
}
