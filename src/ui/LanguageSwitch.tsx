import { useI18n, type Lang } from '../i18n';

const OPTIONS: Array<{ lang: Lang; key: 'lang.es' | 'lang.ptBR'; name: 'lang.name.es' | 'lang.name.ptBR' }> = [
  { lang: 'es', key: 'lang.es', name: 'lang.name.es' },
  { lang: 'pt-BR', key: 'lang.ptBR', name: 'lang.name.ptBR' },
];

/**
 * Selector global ES / PT-BR. Se integra en el encabezado existente de WORLD y STUDIO;
 * al pulsar, el provider actualiza toda la interfaz al instante y guarda la preferencia.
 */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="glass flex shrink-0 items-center gap-0.5 rounded-full p-0.5" role="group" aria-label={t('lang.label')}>
      {OPTIONS.map((opt) => {
        const active = lang === opt.lang;
        return (
          <button
            key={opt.lang}
            type="button"
            onClick={() => setLang(opt.lang)}
            aria-pressed={active}
            title={t(opt.name)}
            className={`rounded-full font-extrabold leading-none transition-colors ${compact ? 'h-7 px-1.5 text-[9px]' : 'h-8 px-2.5 text-[10px]'}`}
            style={active ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { color: 'var(--muted)' }}
          >
            {t(opt.key)}
          </button>
        );
      })}
    </div>
  );
}
