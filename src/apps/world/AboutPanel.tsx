import { coverageNotes } from '../../geo/geography';
import { useI18n } from '../../i18n';
import { Icon, LogoMark } from '../../ui/Icon';

type UiTheme = 'light' | 'dark';

/**
 * WORLD usa dos roots distintos: `WorldApp` expone `data-ui` y `WorldCityApp`
 * gestiona el tema en React. Si no llega la prop, se lee del root compartido para
 * que este panel sea correcto en ambas experiencias sin tocar STUDIO.
 */
function resolveUi(ui?: UiTheme): UiTheme {
  if (ui) return ui;
  if (typeof document !== 'undefined') {
    return document.querySelector('.app-root')?.getAttribute('data-ui') === 'dark' ? 'dark' : 'light';
  }
  return 'light';
}

export function AboutPanel({
  onClose,
  studioHref,
  ui,
}: {
  onClose: () => void;
  studioHref: string;
  ui?: UiTheme;
}) {
  const { lang, t } = useI18n();
  const coverage = coverageNotes(lang);
  const dark = resolveUi(ui) === 'dark';

  // Superficie sólida: el desenfoque y el oscurecimiento quedan solo en el fondo.
  const surface = dark
    ? 'bg-[#0e151a] text-slate-100 ring-1 ring-white/10'
    : 'bg-white text-slate-900 ring-1 ring-slate-200';
  const heading = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-300' : 'text-slate-600';
  const body = dark ? 'text-slate-200' : 'text-slate-700';
  const section = `mt-5 text-[11px] font-bold uppercase tracking-[0.12em] ${muted}`;
  const close = dark
    ? 'bg-white/10 text-white ring-white/15 hover:bg-white/20'
    : 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200';
  const neutralLink = dark
    ? 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'
    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';
  const linkBase = 'inline-flex touch-manipulation items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a106]';

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={t('about.aria')}>
      <button className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-label={t('common.close')} />
      <div
        className={`rise scroll-y relative mx-3 mb-3 max-h-[86dvh] w-full max-w-[520px] rounded-[28px] p-6 pb-[calc(var(--safe-b)+24px)] shadow-2xl md:mx-0 md:mb-0 md:pb-6 ${surface}`}
      >
        <button
          className={`absolute right-3 top-3 grid h-10 w-10 touch-manipulation place-items-center rounded-full ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a106] ${close}`}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={18} />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <LogoMark size={36} />
          <div className="min-w-0">
            <h2 className={`text-lg font-extrabold tracking-[0.14em] ${heading}`}>{t('app.world')}</h2>
            <p className={`text-[12px] ${muted}`}>{t('about.location')}</p>
          </div>
        </div>

        <p className={`mt-4 text-[14px] leading-relaxed ${body}`}>{t('about.intro')}</p>

        <h3 className={section}>{t('about.dataTitle')}</h3>
        <ul className={`space-y-1.5 text-[13px] leading-relaxed ${body}`}>
          <li>• {t('about.streets')}</li>
          <li>• {coverage.roads}</li>
          <li>• {coverage.buildings}</li>
          <li>• {t('about.demoItems')}</li>
          <li>• {t('about.noRelief')}</li>
        </ul>

        <h3 className={section}>{t('about.navigateTitle')}</h3>
        <ul className={`space-y-1.5 text-[13px] leading-relaxed ${body}`}>
          <li>• {t('about.navDrag')}</li>
          <li>• {t('about.navPitch')}</li>
          <li>• {t('about.navPick')}</li>
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <a className={`${linkBase} ${neutralLink}`} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            {t('about.openStreetMap')} <Icon name="external" size={14} />
          </a>
          <a className={`${linkBase} border-transparent bg-[#0b3b2e] text-white hover:bg-[#0f4d3c]`} href={studioHref}>
            {t('about.openStudio')}
          </a>
        </div>
      </div>
    </div>
  );
}
