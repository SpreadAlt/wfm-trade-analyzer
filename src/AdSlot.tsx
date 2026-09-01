import { useEffect, useRef } from 'react'
import type { Locale } from './i18n'
import './adSlot.css'

export type AdPlacement = 'main-sidebar' | 'profile' | 'smart-buy' | 'sell-advisor'

type AdSenseRuntimeConfig = {
  client?: string
  slots?: Partial<Record<AdPlacement, string>>
}

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>
  }

  interface Window {
    FRAMEANALYTICS_ADSENSE?: AdSenseRuntimeConfig
    adsbygoogle?: Array<Record<string, never>>
  }
}

const slotEnvironmentKeys: Record<AdPlacement, string> = {
  'main-sidebar': 'VITE_GOOGLE_ADSENSE_SLOT_MAIN',
  profile: 'VITE_GOOGLE_ADSENSE_SLOT_PROFILE',
  'smart-buy': 'VITE_GOOGLE_ADSENSE_SLOT_SMART_BUY',
  'sell-advisor': 'VITE_GOOGLE_ADSENSE_SLOT_SELL_ADVISOR'
}

const environment = import.meta.env as Record<string, string | undefined>

const adsenseConfig = (placement: AdPlacement) => {
  const runtime = typeof window === 'undefined' ? undefined : window.FRAMEANALYTICS_ADSENSE
  const clientCandidate = (runtime?.client || environment.VITE_GOOGLE_ADSENSE_CLIENT || '').trim()
  const slotCandidate = (runtime?.slots?.[placement] || environment[slotEnvironmentKeys[placement]] || '').trim()

  return {
    client: /^ca-pub-\d+$/.test(clientCandidate) ? clientCandidate : '',
    slot: /^\d+$/.test(slotCandidate) ? slotCandidate : ''
  }
}

const ensureAdSenseScript = (client: string) => {
  if (document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) return

  const script = document.createElement('script')
  script.id = 'frameanalytics-adsense-script'
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
  document.head.appendChild(script)
}

export const AdSlot = ({ placement, locale, orientation, moveToBottom = false }: {
  placement: AdPlacement
  locale: Locale
  orientation: 'vertical' | 'horizontal' | 'compact'
  moveToBottom?: boolean
}) => {
  const unitRef = useRef<HTMLModElement | null>(null)
  const { client, slot } = adsenseConfig(placement)

  useEffect(() => {
    const unit = unitRef.current
    if (!client || !slot || !unit || unit.dataset.adRequested === 'true') return

    unit.dataset.adRequested = 'true'
    ensureAdSenseScript(client)
    window.adsbygoogle = window.adsbygoogle || []

    try {
      window.adsbygoogle.push({})
    } catch (error) {
      unit.dataset.adRequested = 'false'
      console.error('FrameAnalytics AdSense request failed', error)
    }
  }, [client, slot])

  if (!client || !slot) return null

  const label = locale === 'ru' ? 'Реклама Google' : 'Google advertisement'
  const format = orientation === 'vertical' ? 'auto' : 'horizontal'

  return <aside
    className={`ad-slot ad-slot-${orientation} ad-slot-${placement}${moveToBottom ? ' ad-slot-process-bottom' : ''}`}
    aria-label={label}
    data-ad-placement={placement}
  >
    <ins
      ref={unitRef}
      className="adsbygoogle frameanalytics-adsense-unit"
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  </aside>
}
