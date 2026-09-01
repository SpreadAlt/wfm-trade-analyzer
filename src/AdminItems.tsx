import { useState } from 'react'
import type { FormEvent } from 'react'
import { addManualMarketItem } from './api'
import type { Locale } from './i18n'
import type { ManualMarketItemResponse } from './types'

export const AdminItemsPage = ({ locale, onBack, onAdded }: { locale: Locale; onBack: () => void; onAdded: (result: ManualMarketItemResponse) => void }) => {
  const ru = locale === 'ru'
  const [itemUrl, setItemUrl] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ManualMarketItemResponse | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const added = await addManualMarketItem(itemUrl, adminKey)
      setResult(added)
      onAdded(added)
      setItemUrl('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  return <main className="app-shell admin-items-page">
    <header className="topbar">
      <div><a className="brand-plate" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.webp" alt="FrameAnalytics"/></a></div>
      <button type="button" className="back-button" onClick={onBack}>← {ru ? 'Назад к статистике' : 'Back to statistics'}</button>
    </header>
    <section className="panel admin-items-card">
      <span className="eyebrow">FrameAnalytics Admin</span>
      <h1>{ru ? 'Добавить предмет по ссылке WFM' : 'Add item from a WFM link'}</h1>
      <p>{ru
        ? 'Предмет будет добавлен в почасовой пул и публичный каталог без смешивания рангов или вариантов. Админ-ключ хранится только в памяти этой вкладки и не сохраняется.'
        : 'The item will be added to the hourly pool and public catalog without merging ranks or variants. The admin key stays only in this tab memory and is never saved.'}</p>
      <form className="admin-items-form" onSubmit={submit}>
        <label><span>{ru ? 'Ссылка на предмет' : 'Item link'}</span><input type="url" required value={itemUrl} onChange={event => setItemUrl(event.target.value)} placeholder="https://warframe.market/items/item_slug" autoComplete="off"/></label>
        <label><span>ADMIN_KEY</span><input type="password" required value={adminKey} onChange={event => setAdminKey(event.target.value)} autoComplete="off"/></label>
        <button type="submit" className="primary-action" disabled={loading}>{loading ? (ru ? 'Добавление…' : 'Adding…') : (ru ? 'Добавить в пул' : 'Add to pool')}</button>
      </form>
      {error ? <div className="admin-items-result error-state"><strong>{ru ? 'Ошибка' : 'Error'}</strong><span>{error}</span></div> : null}
      {result ? <div className="admin-items-result success-state"><strong>{result.item.name}</strong><span>{ru ? 'Добавлен в группу' : 'Added to group'}: {result.plan.groupId}</span><span>{ru ? 'Почасовой сбор поставлен в очередь' : 'Hourly collection queued'}: {result.enqueued ? (ru ? 'да' : 'yes') : (ru ? 'нет, сработает по расписанию' : 'no, scheduled collection will pick it up')}</span></div> : null}
    </section>
  </main>
}
