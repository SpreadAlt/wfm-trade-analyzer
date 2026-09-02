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

export const portfolioText = (locale: Locale) => locale === 'ru' ? {
  account: 'Профиль', title: 'Мой профиль', unavailable: 'Постоянная авторизация пока недоступна.',
  explanation: 'Создайте временный аккаунт: покупки сохранятся только в этом браузере и не синхронизируются.',
  create: 'Создать временный профиль', empty: 'В профиле пока нет покупок.', close: 'Закрыть',
  price: 'Цена покупки', quantity: 'Количество', date: 'Дата покупки', add: 'Добавить покупку', cancel: 'Отмена',
  savedLocally: 'Сохранено локально', remove: 'Удалить', total: 'Вложено', currentValue: 'Стоимость сейчас',
  possibleProfit: 'Возможная прибыль сейчас', returnPct: 'Доходность', purchases: 'Покупки', back: 'К статистике',
  loading: 'Загружаем рыночные данные профиля…', loadError: 'Не удалось загрузить рыночные данные.', retry: 'Повторить',
  unavailableMarket: 'Рыночная серия пока недоступна', profitHint: '(текущая цена − цена покупки) × количество'
} : {
  account: 'Profile', title: 'My profile', unavailable: 'Permanent sign-in is not available yet.',
  explanation: 'Create a temporary account. Purchases stay only in this browser and are not synchronized.',
  create: 'Create temporary profile', empty: 'No purchases have been added to this profile yet.', close: 'Close',
  price: 'Purchase price', quantity: 'Quantity', date: 'Purchase date', add: 'Add purchase', cancel: 'Cancel',
  savedLocally: 'Stored locally', remove: 'Remove', total: 'Invested', currentValue: 'Current value',
  possibleProfit: 'Possible profit now', returnPct: 'Return', purchases: 'Purchases', back: 'Back to statistics',
  loading: 'Loading profile market data…', loadError: 'Could not load market data.', retry: 'Retry',
  unavailableMarket: 'Market series is not available yet', profitHint: '(current price − purchase price) × quantity'
}

export const AccountButton = ({ locale, active, pending = false, onClick }: { locale: Locale; active: boolean; pending?: boolean; onClick: () => void }) => {
  const text = portfolioText(locale)
  const state = pending ? 'pending' : active ? 'active' : 'guest'
  return <button type="button" className={`account-button ${state}`} onClick={onClick} title={text.account} aria-label={text.account} aria-busy={pending || undefined}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.5-4 2.6-6 6.5-6s6 2 6.5 6"/></svg>
    <span>{text.account}</span>
  </button>
}

export const PurchaseDialog = ({ locale, name, currentPrice, open, onClose, onSave }: {
  locale: Locale
  name: string
  currentPrice: number | null
  open: boolean
  onClose: () => void
  onSave: (value: { purchasePrice: number; quantity: number; purchaseDate: string }) => void
}) => {
  const text = portfolioText(locale)
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
