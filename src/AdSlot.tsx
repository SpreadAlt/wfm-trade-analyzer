import type { Locale } from './i18n'
import './adSlot.css'

export type AdPlacement = 'main-sidebar' | 'profile' | 'smart-buy' | 'sell-advisor'

type AdCreative = {
  title?: string
  description?: string
  imageUrl?: string
  href?: string
  cta?: string
}

declare global {
  interface Window {
    FRAMEANALYTICS_ADS?: Partial<Record<AdPlacement, AdCreative>>
  }
}

const fallbackText = (locale: Locale) => locale === 'ru' ? {
  label: 'Реклама', title: 'Рекламное место',
  description: 'Ненавязчивый партнёрский блок без всплывающих окон.', cta: 'Подробнее'
} : {
  label: 'Advertisement', title: 'Advertising space',
  description: 'A quiet partner placement with no pop-ups.', cta: 'Learn more'
}

export const AdSlot = ({ placement, locale, orientation }: {
  placement: AdPlacement
  locale: Locale
  orientation: 'vertical' | 'horizontal' | 'compact'
}) => {
  const text = fallbackText(locale)
  const creative = typeof window === 'undefined' ? undefined : window.FRAMEANALYTICS_ADS?.[placement]
  const title = creative?.title?.trim() || text.title
  const description = creative?.description?.trim() || text.description
  const content = <>
    {creative?.imageUrl ? <img className="ad-slot-image" src={creative.imageUrl} alt="" loading="lazy"/> : <span className="ad-slot-mark" aria-hidden="true">FA</span>}
    <span className="ad-slot-copy"><strong>{title}</strong><small>{description}</small></span>
    {creative?.href ? <span className="ad-slot-cta">{creative.cta?.trim() || text.cta} ↗</span> : null}
  </>

  return <aside className={`ad-slot ad-slot-${orientation} ad-slot-${placement}`} aria-label={text.label} data-ad-placement={placement}>
    <span className="ad-slot-label">{text.label}</span>
    {creative?.href
      ? <a className="ad-slot-content" href={creative.href} target="_blank" rel="sponsored noopener noreferrer">{content}</a>
      : <div className="ad-slot-content">{content}</div>}
  </aside>
}
