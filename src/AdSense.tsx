import { useEffect } from 'react'

const ADSENSE_CLIENT = 'ca-pub-2843566361106419'
const ADSENSE_SCRIPT_ID = 'frameanalytics-adsense'

export function AdSenseLoader() {
  useEffect(() => {
    if (document.getElementById(ADSENSE_SCRIPT_ID)) return

    const script = document.createElement('script')
    script.id = ADSENSE_SCRIPT_ID
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
    script.dataset.adClient = ADSENSE_CLIENT
    document.head.appendChild(script)
  }, [])

  return null
}
