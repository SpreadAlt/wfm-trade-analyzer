import { useEffect, useState } from 'react'
import type { Locale } from './i18n'

export type PortfolioPurchase = {
  id: string
  itemId: string
  slug: string
  name: string
  marketKey: string
  selectedModRank: number | null
  purchasePrice: number
  quantity: number
  purchaseDate: string
  createdAt: string
}

export type TemporaryAccount = {
  id: string
  createdAt: string
  purchases: PortfolioPurchase[]
}

const STORAGE_KEY = 'frameanalytics-temporary-account-v1'

export const loadTemporaryAccount = (): TemporaryAccount | null => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as TemporaryAccount | null
    return value?.id && Array.isArray(value.purchases) ? value : null
  } catch {
    return null
  }
}

export const saveTemporaryAccount = (account: TemporaryAccount | null) => {
  if (account) localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
  else localStorage.removeItem(STORAGE_KEY)
}

export const createTemporaryAccount = (): TemporaryAccount => ({
  id: `local-${crypto.randomUUID()}`,
  createdAt: new Date().toISOString(),
  purchases: []
})

const copy = (locale: Locale) => locale === 'ru' ? {
  account: 'Тестовый кабинет', title: 'Локальный портфель', unavailable: 'Постоянная авторизация пока недоступна.',
  explanation: 'Создайте временный аккаунт: покупки сохранятся только в этом браузере и не синхронизируются.',
  create: 'Создать временный аккаунт', empty: 'В портфеле пока нет покупок.', close: 'Закрыть',
  price: 'Цена покупки', quantity: 'Количество', date: 'Дата покупки', add: 'Добавить покупку', cancel: 'Отмена',
  savedLocally: 'Сохранено локально', remove: 'Удалить', total: 'Вложено'
} : {
  account: 'Test account', title: 'Local portfolio', unavailable: 'Permanent sign-in is not available yet.',
  explanation: 'Create a temporary account. Purchases stay only in this browser and are not synchronized.',
  create: 'Create temporary account', empty: 'No purchases have been added yet.', close: 'Close',
  price: 'Purchase price', quantity: 'Quantity', date: 'Purchase date', add: 'Add purchase', cancel: 'Cancel',
  savedLocally: 'Stored locally', remove: 'Remove', total: 'Invested'
}

export const AccountButton = ({ locale, active, onClick }: { locale: Locale; active: boolean; onClick: () => void }) => {
  const text = copy(locale)
  return <button type="button" className={`account-button ${active ? 'active' : ''}`} onClick={onClick} title={text.account} aria-label={text.account}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.5-4 2.6-6 6.5-6s6 2 6.5 6"/></svg>
    <span>{text.account}</span>
  </button>
}

export const PortfolioPanel = ({ locale, account, open, onClose, onCreate, onRemove }: {
  locale: Locale
  account: TemporaryAccount | null
  open: boolean
  onClose: () => void
  onCreate: () => void
  onRemove: (id: string) => void
}) => {
  if (!open) return null
  const text = copy(locale)
  const invested = account?.purchases.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0) || 0
  return <div className="account-backdrop" role="presentation" onPointerDown={event => event.target === event.currentTarget && onClose()}>
    <aside className="account-panel" role="dialog" aria-modal="true" aria-label={text.title}>
      <header><div><span>{text.savedLocally}</span><h2>{text.title}</h2></div><button type="button" className="icon-close" onClick={onClose} aria-label={text.close}>×</button></header>
      {!account ? <div className="account-onboarding"><div className="account-orb"><span>FA</span></div><strong>{text.unavailable}</strong><p>{text.explanation}</p><button type="button" className="primary-action" onClick={onCreate}>{text.create}</button></div> : <>
        <div className="account-summary"><span>{text.total}</span><strong>{invested.toFixed(1).replace(/\.0$/, '')}p</strong><small>{account.purchases.length}</small></div>
        {!account.purchases.length ? <div className="portfolio-empty">{text.empty}</div> : <div className="portfolio-list">{account.purchases.map(item => <article key={item.id}><div><strong title={item.name}>{item.name}</strong><span>{item.marketKey}{item.selectedModRank != null ? ` · R${item.selectedModRank}` : ''}</span></div><div><b>{item.purchasePrice}p × {item.quantity}</b><span>{item.purchaseDate}</span></div><button type="button" onClick={() => onRemove(item.id)} aria-label={text.remove}>×</button></article>)}</div>}
      </>}
    </aside>
  </div>
}

export const PurchaseDialog = ({ locale, name, currentPrice, open, onClose, onSave }: {
  locale: Locale
  name: string
  currentPrice: number | null
  open: boolean
  onClose: () => void
  onSave: (value: { purchasePrice: number; quantity: number; purchaseDate: string }) => void
}) => {
  const text = copy(locale)
  const [price, setPrice] = useState(currentPrice ?? 0)
  const [quantity, setQuantity] = useState(1)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  useEffect(() => {
    if (!open) return
    setPrice(currentPrice ?? 0)
    setQuantity(1)
    setDate(new Date().toISOString().slice(0, 10))
  }, [open, currentPrice, name])
  if (!open) return null
  const valid = price > 0 && quantity > 0 && Boolean(date)
  return <div className="account-backdrop purchase-backdrop" role="presentation" onPointerDown={event => event.target === event.currentTarget && onClose()}><form className="purchase-dialog" onSubmit={event => { event.preventDefault(); if (valid) onSave({ purchasePrice: price, quantity, purchaseDate: date }) }}>
    <header><div><span>{text.add}</span><h2 title={name}>{name}</h2></div><button type="button" className="icon-close" onClick={onClose}>×</button></header>
    <label><span>{text.price}</span><div className="input-suffix"><input type="number" min="0.1" step="0.1" value={price} onChange={event => setPrice(Number(event.target.value))}/><b>p</b></div></label>
    <label><span>{text.quantity}</span><input type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(Math.max(1, Number(event.target.value)))}/></label>
    <label><span>{text.date}</span><input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
    <div className="dialog-actions"><button type="button" onClick={onClose}>{text.cancel}</button><button type="submit" className="primary-action" disabled={!valid}>{text.add}</button></div>
  </form></div>
}
