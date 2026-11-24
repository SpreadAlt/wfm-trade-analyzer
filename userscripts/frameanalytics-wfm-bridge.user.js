// ==UserScript==
// @name         FrameAnalytics Warframe Market Bridge
// @namespace    https://frameanalytics.trade/
// @version      0.1.0
// @description  Read public Warframe Market API data for FrameAnalytics Smart Buy with platform/crossplay headers.
// @match        https://frameanalytics.trade/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      api.warframe.market
// ==/UserScript==

(() => {
  'use strict';
  const CHANNEL = 'frameanalytics-wfm-bridge-v1';
  const BASE = 'https://api.warframe.market';
  const allowed = [
    /^\/v2\/user\/[a-z0-9._-]{1,64}$/i,
    /^\/v2\/orders\/user\/[a-z0-9._-]{1,64}$/i,
    /^\/v2\/orders\/itemId\/[a-z0-9_-]{1,100}$/i
  ];
  const active = new Map();
  const send = value => window.postMessage({ channel: CHANNEL, ...value }, location.origin);

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const req = event.data;
    if (!req || req.channel !== CHANNEL) return;
    if (req.kind === 'ping') {
      send({ kind: 'ready', version: '0.1.0' });
      return;
    }
    if (req.kind !== 'request') return;
    if (typeof req.id !== 'string' || !/^[a-z0-9-]{8,64}$/i.test(req.id)) return;
    if (active.has(req.id)) return;
    if (typeof req.path !== 'string' || !allowed.some(pattern => pattern.test(req.path))) {
      send({ kind: 'response', id: req.id, status: 400, error: 'Endpoint not allowed' });
      return;
    }
    const headers = { Accept: 'application/json' };
    if (req.headers) {
      if (req.headers.Platform && !['pc', 'ps4', 'xbox', 'switch', 'mobile'].includes(req.headers.Platform)) {
        send({ kind: 'response', id: req.id, status: 400, error: 'Invalid platform' });
        return;
      }
      if (req.headers.Crossplay && !['true', 'false'].includes(req.headers.Crossplay)) {
        send({ kind: 'response', id: req.id, status: 400, error: 'Invalid crossplay flag' });
        return;
      }
      if (req.headers.Platform) headers.Platform = req.headers.Platform;
      if (req.headers.Crossplay) headers.Crossplay = req.headers.Crossplay;
    }
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      active.delete(req.id);
      send({ kind: 'response', id: req.id, ...result });
    };
    const timer = setTimeout(() => finish({ status: 0, error: 'Bridge timeout' }), 25000);
    try {
      const xhr = GM_xmlhttpRequest({
        method: 'GET',
        url: BASE + req.path,
        headers,
        timeout: 20000,
        anonymous: true,
        onload: response => {
          clearTimeout(timer);
          finish({
            status: response.status,
            contentType: /(?:^|\r?\n)content-type:\s*([^\r\n]+)/i.exec(response.responseHeaders || '')?.[1] || '',
            body: String(response.responseText || '').slice(0, 8000000)
          });
        },
        onerror: () => {
          clearTimeout(timer);
          finish({ status: 0, error: 'Network request failed' });
        },
        ontimeout: () => {
          clearTimeout(timer);
          finish({ status: 0, error: 'Network request timed out' });
        }
      });
      active.set(req.id, xhr);
    } catch {
      clearTimeout(timer);
      finish({ status: 0, error: 'Browser extension request unavailable' });
    }
  });
  send({ kind: 'ready', version: '0.1.0' });
})();
