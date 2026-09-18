/**
 * Mini Matrix — Twelve Data API
 * Free Basic: 8 credits/minute, 800/day
 * Refresh: exactly 8 times per minute → every 7.5 seconds
 */
(function (global) {
  'use strict';

  var API_KEY = 'c04c9c4a7e6845f380c5e60cf59852ff';
  var PRICE_URL = 'https://api.twelvedata.com/price?symbol=XAU/USD&apikey=' + API_KEY;
  var SERIES_URL = 'https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=60&apikey=' + API_KEY;
  var REFRESH_MS = Math.floor(60000 / 8); // 7500 ms = 8 بار در دقیقه
  var FREE_QUOTA_TOTAL = 800;
  var FREE_QUOTA_DAYS = 1;
  var QUOTA_KEY = 'mm_api_quota_td_v1';
  var TOGGLE_KEY = 'mm_api_auto_on';

  var remaining = FREE_QUOTA_TOTAL;
  var startedAt = Date.now();
  var timer = null;
  var autoOn = false;

  function loadQuota() {
    try {
      var raw = localStorage.getItem(QUOTA_KEY);
      if (!raw) {
        remaining = FREE_QUOTA_TOTAL;
        startedAt = Date.now();
        saveQuota();
        return;
      }
      var data = JSON.parse(raw);
      remaining = typeof data.remaining === 'number' ? data.remaining : FREE_QUOTA_TOTAL;
      startedAt = data.startedAt || Date.now();
      if ((Date.now() - startedAt) / 86400000 >= FREE_QUOTA_DAYS) {
        remaining = FREE_QUOTA_TOTAL;
        startedAt = Date.now();
        saveQuota();
      }
    } catch (e) {
      remaining = FREE_QUOTA_TOTAL;
      startedAt = Date.now();
      saveQuota();
    }
  }

  function saveQuota() {
    localStorage.setItem(QUOTA_KEY, JSON.stringify({ remaining: remaining, startedAt: startedAt }));
  }

  function consume() {
    if (remaining > 0) {
      remaining -= 1;
      saveQuota();
    }
  }

  function getRemaining() { return Math.max(0, remaining); }
  function isAutoOn() { return autoOn; }

  function loadToggle() {
    autoOn = localStorage.getItem(TOGGLE_KEY) === '1';
    return autoOn;
  }

  function setAutoOn(on) {
    autoOn = !!on;
    localStorage.setItem(TOGGLE_KEY, autoOn ? '1' : '0');
    if (autoOn) start(global.MM_API_onPrice, global.MM_API_onError, global.MM_API_onQuota);
    else stop();
    return autoOn;
  }

  function fetchPrice() {
    return fetch(PRICE_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.status === 'error') throw new Error(data.message || String(data.code || 'error'));
        var price = data && data.price != null ? parseFloat(data.price) : NaN;
        if (!isFinite(price) || price <= 0) throw new Error('invalid price');
        consume();
        return price;
      });
  }

  function fetchSeries() {
    return fetch(SERIES_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.status === 'error') throw new Error(data.message || 'series error');
        var values = (data && data.values) || [];
        return values.slice().reverse().map(function (v) {
          return { t: v.datetime, close: parseFloat(v.close) };
        }).filter(function (p) { return isFinite(p.close); });
      });
  }

  function tick(onPrice, onError, onQuota) {
    if (!autoOn) return;
    if (remaining <= 0) {
      autoOn = false;
      localStorage.setItem(TOGGLE_KEY, '0');
      stop();
      if (onQuota) onQuota(0);
      return;
    }
    fetchPrice()
      .then(function (price) {
        if (onPrice) onPrice(price);
        if (onQuota) onQuota(getRemaining());
      })
      .catch(function (err) {
        if (onError) onError(err);
        if (onQuota) onQuota(getRemaining());
      });
  }

  function start(onPrice, onError, onQuota) {
    stop();
    if (!autoOn) return;
    global.MM_API_onPrice = onPrice;
    global.MM_API_onError = onError;
    global.MM_API_onQuota = onQuota;
    tick(onPrice, onError, onQuota);
    timer = setInterval(function () { tick(onPrice, onError, onQuota); }, REFRESH_MS);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  loadQuota();

  global.MM_API = {
    REFRESH_MS: REFRESH_MS,
    FREE_QUOTA_TOTAL: FREE_QUOTA_TOTAL,
    loadQuota: loadQuota,
    getRemaining: getRemaining,
    loadToggle: loadToggle,
    setAutoOn: setAutoOn,
    isAutoOn: isAutoOn,
    start: start,
    stop: stop,
    fetchPrice: fetchPrice,
    fetchSeries: fetchSeries,
  };
})(window);
