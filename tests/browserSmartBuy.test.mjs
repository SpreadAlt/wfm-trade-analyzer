import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareBrowserSmartBuy, scanBrowserSmartBuy } from '../src/browserSmartBuy.ts'

globalThis.window = globalThis

function marketJson(data) {
  return new Response(JSON.stringify({ apiVersion: '0.25.0', data, error: null }), {
    status: 200, headers: { 'content-type': 'application/json' }
  })
}

function user(id, slug, status = 'online') {
  return { id, slug, ingameName: slug, platform: 'pc', crossplay: true, status }
}

test('browser Smart Buy keeps SELL baseline, rank, quantity and multi-item seller aggregation', async () => {
  const profile = user('buyer-id', 'buyer')
  const publicOrders = [
    { id: 'b1', type: 'buy', visible: true, itemId: 'item-one', rank: 5, quantity: 2, perTrade: 1, platinum: 120 },
    { id: 'b2', type: 'buy', visible: true, itemId: 'item-two', quantity: 1, perTrade: 1, platinum: 90 }
  ]
  const shared = user('seller-id', 'seller')
  const books = {
    'item-one': [
      { id: 's1', type: 'sell', visible: true, itemId: 'item-one', rank: 5, quantity: 2, perTrade: 1, platinum: 100, user: shared },
      { id: 's2', type: 'sell', visible: true, itemId: 'item-one', rank: 0, quantity: 2, perTrade: 1, platinum: 1, user: user('other', 'other') },
      { id: 'b3', type: 'buy', visible: true, itemId: 'item-one', rank: 5, quantity: 1, perTrade: 1, platinum: 2, user: user('buyer-two', 'buyer-two') }
    ],
    'item-two': [
      { id: 's3', type: 'sell', visible: true, itemId: 'item-two', quantity: 1, perTrade: 1, platinum: 80, user: shared }
    ]
  }
  const headers = []
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    headers.push(init?.headers || null)
    if (url.endsWith('/user/buyer')) return marketJson(profile)
    if (url.endsWith('/orders/user/buyer')) return marketJson(publicOrders)
    const id = url.split('/').pop()
    return marketJson(books[id] || [])
  }
  try {
    const prepared = await prepareBrowserSmartBuy('buyer')
    assert.deepEqual(prepared.headers, { Platform: 'pc', Crossplay: 'true' })
    const result = await scanBrowserSmartBuy(prepared, () => {})
    assert.equal(result.wishlist.length, 2)
    assert.equal(result.wishlist[0].marketMinUnitPrice, 100)
    assert.equal(result.wishlist[0].sellers, 1)
    assert.equal(result.sellers.length, 1)
    assert.equal(result.sellers[0].offers.length, 2)
    assert.equal(result.sellers[0].unitsCovered, 3)
    assert.equal(result.sellers[0].estimatedCost, 280)
    assert.deepEqual(headers.at(-1), prepared.headers)
  } finally {
    globalThis.fetch = fetchOriginal
  }
})

test('browser preflight fails closed if crossplay order-book headers are blocked', async () => {
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/user/buyer')) return marketJson(user('buyer-id', 'buyer'))
    if (url.endsWith('/orders/user/buyer')) return marketJson([
      { id: 'b1', type: 'buy', itemId: 'item-one', quantity: 1, perTrade: 1, platinum: 100 }
    ])
    if (init?.headers?.Crossplay === 'true') throw new TypeError('Failed to fetch')
    throw new Error('Incorrect market fallback')
  }
  try {
    await assert.rejects(() => prepareBrowserSmartBuy('buyer'), /CORS/)
  } finally {
    globalThis.fetch = fetchOriginal
  }
})
