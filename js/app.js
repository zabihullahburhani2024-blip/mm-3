/**
 * Mini Matrix — wholesale app (auth-gated, live chart, Twelve Data 8/min)
 */
(function () {
  'use strict';

  // Gate: must be logged in + activated
  if (!window.MM_AUTH || !MM_AUTH.requireActivated()) {
    location.href = 'register.html';
    return;
  }

  var DIVISOR = 2.56;
  var GRAMS_PER_TOLA = 12.15;
  var GRAMS_PER_TROY_OUNCE = 31.10345;
  var LANG_KEY = 'mm_lang';
  var THEME_KEY = 'mm_theme';

  window.MM_STATE = { lang: localStorage.getItem(LANG_KEY) || 'fa', goldPrice: null };

  var el = {};
  var _syncingWeight = false;

  function $(id) { return document.getElementById(id); }
  function t(key, vars) { return window.MM_t(key, vars); }
  function fmt2(n) {
    return (typeof n === 'number' && isFinite(n))
      ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }

  function bindElements() {
    [
      'equivPrice','kabulPriceInput','diffCard','diffSign','diffValue','diffPercent','themeToggle',
      'kgInput','kgToTola','kgToOunce','kgToGram','pricePerTola','pricePerGram','totalLivePrice',
      'kgDiffCard','kgDiffSign','kgDiffValue','kgDiffPercent','divisorLabel','tolaInput','ounceInput',
      'gramInput','manualGoldPrice','priceStatus','apiAutoToggle','apiToggleLabel','remainingRequests',
      'quotaDaysInfo','langSelect','appSubtitle','chartTitle','priceHint','sectionKabul','equivTolaTitle',
      'equivNote','kabulBuyLabel','diffTitle','sectionCalc','labelGram','labelKg','labelTola','labelOunce',
      'pricePerTolaTitle','pricePerGramTitle','totalLiveTitle','navHome','navPrices','navCalc','navActivate',
      'chartToggleBtn','btnLogout'
    ].forEach(function (id) { el[id] = $(id); });
  }

  function applyI18n() {
    var lang = window.MM_STATE.lang;
    var dict = MM_I18N[lang] || MM_I18N.fa;
    document.documentElement.setAttribute('lang', dict.lang);
    document.documentElement.setAttribute('dir', dict.dir);
    document.body.setAttribute('dir', dict.dir);
    var map = {
      appSubtitle: 'menuWholesale', chartTitle: 'chartTitle', priceHint: 'priceHint',
      sectionKabul: 'sectionKabul', equivTolaTitle: 'equivTola', kabulBuyLabel: 'kabulBuy',
      diffTitle: 'diff', sectionCalc: 'sectionCalc', labelGram: 'gram', labelKg: 'kg',
      labelTola: 'tola', labelOunce: 'ounce', pricePerTolaTitle: 'pricePerTola',
      pricePerGramTitle: 'pricePerGram', totalLiveTitle: 'totalLive',
      navHome: 'navHome', navPrices: 'navPrices', navCalc: 'navCalc', navActivate: 'navActivate',
      btnLogout: 'btnLogout'
    };
    Object.keys(map).forEach(function (id) {
      if (el[id]) el[id].textContent = t(map[id]);
    });
    if (el.equivNote) el.equivNote.textContent = t('equivNote', { d: DIVISOR });
    if (el.divisorLabel) el.divisorLabel.textContent = String(DIVISOR);
    if (el.manualGoldPrice) el.manualGoldPrice.placeholder = t('pricePlaceholder');
    if (el.quotaDaysInfo) el.quotaDaysInfo.textContent = t('quotaDaily');
    var on = MM_API.isAutoOn();
    if (el.apiToggleLabel) el.apiToggleLabel.textContent = on ? t('apiOn') : t('apiOffLabel');
    if (el.chartToggleBtn) {
      el.chartToggleBtn.textContent = MM_CHART.isHidden() ? t('showChart') : t('hideChart');
    }
    if (!on && el.priceStatus) {
      el.priceStatus.textContent = t('apiOff');
      el.priceStatus.style.color = 'var(--text-soft)';
    }
    updateQuotaUI();
  }

  function setLang(lang) {
    if (!MM_I18N[lang]) lang = 'fa';
    window.MM_STATE.lang = lang;
    localStorage.setItem(LANG_KEY, lang);
    if (el.langSelect) el.langSelect.value = lang;
    applyI18n();
  }

  function loadTheme() {
    var s = localStorage.getItem(THEME_KEY);
    document.documentElement.setAttribute('data-theme', (s === 'light' || s === 'dark') ? s : 'dark');
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    MM_CHART.draw();
  }

  function setPriceStatus(msg, isError) {
    if (!el.priceStatus) return;
    el.priceStatus.textContent = msg;
    el.priceStatus.style.color = isError ? 'var(--red)' : 'var(--text-soft)';
  }

  function applyGoldPrice(price) {
    if (!isFinite(price) || price <= 0) return;
    window.MM_STATE.goldPrice = price;
    if (el.manualGoldPrice) el.manualGoldPrice.value = price.toFixed(3);
    localStorage.setItem('mm_manual_gold_price', String(price));
    MM_CHART.pushPrice(price);
    recalcKabul();
    recalcKg(null);
  }

  function onManualPriceInput() {
    var p = parseFloat(el.manualGoldPrice.value);
    if (isFinite(p) && p > 0) {
      window.MM_STATE.goldPrice = p;
      localStorage.setItem('mm_manual_gold_price', el.manualGoldPrice.value || '');
      recalcKabul();
      recalcKg(null);
      setPriceStatus(t('manualSaved'), false);
    } else {
      window.MM_STATE.goldPrice = null;
      localStorage.setItem('mm_manual_gold_price', '');
      if (el.equivPrice) el.equivPrice.textContent = '—';
      clearKgOutputs();
    }
  }

  function loadManualGoldPrice() {
    var s = localStorage.getItem('mm_manual_gold_price');
    if (s && el.manualGoldPrice) {
      el.manualGoldPrice.value = s;
      var p = parseFloat(s);
      if (isFinite(p) && p > 0) window.MM_STATE.goldPrice = p;
    }
  }
  function loadKabulPrice() {
    var s = localStorage.getItem('mm_kabul_price');
    if (s && el.kabulPriceInput) el.kabulPriceInput.value = s;
  }
  function saveKabulPrice() {
    if (el.kabulPriceInput) localStorage.setItem('mm_kabul_price', el.kabulPriceInput.value || '');
  }

  function recalcKabul() {
    if (!window.MM_STATE.goldPrice) return;
    var equiv = window.MM_STATE.goldPrice / DIVISOR;
    if (el.equivPrice) el.equivPrice.textContent = fmt2(equiv);
    var kabul = parseFloat(el.kabulPriceInput && el.kabulPriceInput.value);
    if (isFinite(kabul)) {
      var diff = equiv - kabul;
      var pct = kabul !== 0 ? (diff / kabul) * 100 : 0;
      if (el.diffSign) el.diffSign.textContent = diff >= 0 ? '+' : '−';
      if (el.diffValue) el.diffValue.textContent = fmt2(Math.abs(diff));
      if (el.diffPercent) el.diffPercent.textContent = (diff >= 0 ? '+' : '') + fmt2(pct) + '%';
      if (el.diffCard) el.diffCard.className = 'card calc-card calc-card-diff ' + (diff >= 0 ? 'diff-positive' : 'diff-negative');
    } else {
      if (el.diffSign) el.diffSign.textContent = '±';
      if (el.diffValue) el.diffValue.textContent = '—';
      if (el.diffPercent) el.diffPercent.textContent = '—';
      if (el.diffCard) el.diffCard.className = 'card calc-card calc-card-diff';
    }
  }

  function clearKgOutputs() {
    ['kgToTola','kgToOunce','kgToGram','pricePerTola','pricePerGram','totalLivePrice'].forEach(function (id) {
      if (el[id]) el[id].textContent = '—';
    });
  }

  function recalcKg(source) {
    var gram = parseFloat(el.gramInput && el.gramInput.value);
    var kg = parseFloat(el.kgInput && el.kgInput.value);
    var tolaV = parseFloat(el.tolaInput && el.tolaInput.value);
    var ounce = parseFloat(el.ounceInput && el.ounceInput.value);
    _syncingWeight = true;
    if (source === 'gram' && isFinite(gram)) {
      if (el.kgInput) el.kgInput.value = (gram / 1000).toFixed(6);
      if (el.tolaInput) el.tolaInput.value = (gram / GRAMS_PER_TOLA).toFixed(6);
      if (el.ounceInput) el.ounceInput.value = (gram / GRAMS_PER_TROY_OUNCE).toFixed(6);
    } else if (source === 'kg' && isFinite(kg)) {
      gram = kg * 1000;
      if (el.gramInput) el.gramInput.value = gram.toFixed(3);
      if (el.tolaInput) el.tolaInput.value = (gram / GRAMS_PER_TOLA).toFixed(6);
      if (el.ounceInput) el.ounceInput.value = (gram / GRAMS_PER_TROY_OUNCE).toFixed(6);
    } else if (source === 'tola' && isFinite(tolaV)) {
      gram = tolaV * GRAMS_PER_TOLA;
      if (el.gramInput) el.gramInput.value = gram.toFixed(3);
      if (el.kgInput) el.kgInput.value = (gram / 1000).toFixed(6);
      if (el.ounceInput) el.ounceInput.value = (gram / GRAMS_PER_TROY_OUNCE).toFixed(6);
    } else if (source === 'ounce' && isFinite(ounce)) {
      gram = ounce * GRAMS_PER_TROY_OUNCE;
      if (el.gramInput) el.gramInput.value = gram.toFixed(3);
      if (el.kgInput) el.kgInput.value = (gram / 1000).toFixed(6);
      if (el.tolaInput) el.tolaInput.value = (gram / GRAMS_PER_TOLA).toFixed(6);
    }
    _syncingWeight = false;
    gram = parseFloat(el.gramInput && el.gramInput.value);
    if (!isFinite(gram) || gram < 0) { clearKgOutputs(); return; }
    if (el.kgToGram) el.kgToGram.textContent = fmt2(gram);
    if (el.kgToTola) el.kgToTola.textContent = fmt2(gram / GRAMS_PER_TOLA);
    if (el.kgToOunce) el.kgToOunce.textContent = fmt2(gram / GRAMS_PER_TROY_OUNCE);
    if (!window.MM_STATE.goldPrice) {
      if (el.pricePerTola) el.pricePerTola.textContent = '—';
      if (el.pricePerGram) el.pricePerGram.textContent = '—';
      if (el.totalLivePrice) el.totalLivePrice.textContent = '—';
      return;
    }
    var pricePerGram = window.MM_STATE.goldPrice / GRAMS_PER_TROY_OUNCE;
    var pricePerTola = window.MM_STATE.goldPrice / DIVISOR;
    if (el.pricePerGram) el.pricePerGram.textContent = '$' + fmt2(pricePerGram);
    if (el.pricePerTola) el.pricePerTola.textContent = '$' + fmt2(pricePerTola);
    if (el.totalLivePrice) el.totalLivePrice.textContent = '$' + fmt2(pricePerGram * gram);
    var kabul = parseFloat(el.kabulPriceInput && el.kabulPriceInput.value);
    if (isFinite(kabul) && el.kgDiffCard) {
      var tolaAmount = gram / GRAMS_PER_TOLA;
      var live = pricePerTola * tolaAmount;
      var kabulTotal = kabul * tolaAmount;
      var diff = live - kabulTotal;
      var pct = kabulTotal !== 0 ? (diff / kabulTotal) * 100 : 0;
      if (el.kgDiffSign) el.kgDiffSign.textContent = diff >= 0 ? '+' : '−';
      if (el.kgDiffValue) el.kgDiffValue.textContent = fmt2(Math.abs(diff));
      if (el.kgDiffPercent) el.kgDiffPercent.textContent = (diff >= 0 ? '+' : '') + fmt2(pct) + '% ' + t('vsKabul');
      el.kgDiffCard.className = 'card calc-card calc-card-diff ' + (diff >= 0 ? 'diff-positive' : 'diff-negative');
    } else if (el.kgDiffCard) {
      if (el.kgDiffSign) el.kgDiffSign.textContent = '±';
      if (el.kgDiffValue) el.kgDiffValue.textContent = '—';
      if (el.kgDiffPercent) el.kgDiffPercent.textContent = t('enterKabul');
      el.kgDiffCard.className = 'card calc-card calc-card-diff';
    }
  }

  function updateQuotaUI() {
    var rem = MM_API.getRemaining();
    if (el.remainingRequests) {
      el.remainingRequests.textContent = String(rem);
      el.remainingRequests.className = rem <= 50 ? 'quota-warn' : '';
    }
    if (el.quotaDaysInfo) el.quotaDaysInfo.textContent = t('quotaDaily') + ' · ' + MM_API.FREE_QUOTA_TOTAL;
  }

  function onApiPrice(price) {
    applyGoldPrice(price);
    var timeStr = new Date().toLocaleTimeString(
      window.MM_STATE.lang === 'en' ? 'en-US' : 'fa-IR',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    );
    setPriceStatus(t('lastUpdate') + ': ' + timeStr + ' · ' + t('sourceTwelve') + ' · ' + t('every8'), false);
    updateQuotaUI();
    if (el.apiToggleLabel) el.apiToggleLabel.textContent = t('apiOn');
  }
  function onApiError(err) {
    var msg = (err && err.message) ? err.message : String(err);
    var fallback = window.MM_STATE.goldPrice;
    setPriceStatus(
      t('errorPrefix') + ': ' + msg + (isFinite(fallback) ? ' · ' + t('usingPrev') : ''),
      true
    );
    updateQuotaUI();
  }
  function onApiQuota(rem) {
    updateQuotaUI();
    if (rem <= 0) {
      setPriceStatus(t('quotaEmpty'), true);
      if (el.apiAutoToggle) el.apiAutoToggle.checked = false;
      if (el.apiToggleLabel) el.apiToggleLabel.textContent = t('apiOffLabel');
    }
  }

  function bindApiToggle() {
    var on = MM_API.loadToggle();
    if (el.apiAutoToggle) {
      el.apiAutoToggle.checked = on;
      el.apiAutoToggle.addEventListener('change', function () {
        var nowOn = MM_API.setAutoOn(el.apiAutoToggle.checked);
        if (el.apiToggleLabel) el.apiToggleLabel.textContent = nowOn ? t('apiOn') : t('apiOffLabel');
        if (nowOn) {
          setPriceStatus(t('fetching'), false);
          MM_API.start(onApiPrice, onApiError, onApiQuota);
        } else {
          MM_API.stop();
          setPriceStatus(t('apiOff'), false);
        }
      });
    }
    if (el.apiToggleLabel) el.apiToggleLabel.textContent = on ? t('apiOn') : t('apiOffLabel');
    if (on) {
      setPriceStatus(t('fetching'), false);
      MM_API.start(onApiPrice, onApiError, onApiQuota);
    } else setPriceStatus(t('apiOff'), false);
    updateQuotaUI();
  }

  function loadInitialSeries() {
    MM_API.fetchSeries().then(function (series) {
      MM_CHART.setSeries(series);
      // series fetch also costs credits — optional; if fails, chart fills from live ticks
    }).catch(function () { /* ignore */ });
  }

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var target = btn.getAttribute('data-target');
        if (target === 'account') {
          if (confirm(t('btnLogout') + '?')) {
            MM_AUTH.logout();
            location.href = 'register.html';
          }
          return;
        }
        if (target === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else {
          var sec = $(target);
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindElements();
    loadTheme();
    if (el.langSelect) {
      el.langSelect.value = window.MM_STATE.lang;
      el.langSelect.addEventListener('change', function () {
        setLang(el.langSelect.value);
      });
    }
    loadKabulPrice();
    loadManualGoldPrice();
    applyI18n();

    MM_CHART.init('liveChart');
    if (el.chartToggleBtn) {
      el.chartToggleBtn.addEventListener('click', function () {
        MM_CHART.toggle();
        el.chartToggleBtn.textContent = MM_CHART.isHidden() ? t('showChart') : t('hideChart');
      });
    }

    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);
    if (el.btnLogout) {
      el.btnLogout.addEventListener('click', function () {
        MM_AUTH.logout();
        location.href = 'register.html';
      });
    }
    if (el.kabulPriceInput) {
      el.kabulPriceInput.addEventListener('input', function () {
        saveKabulPrice(); recalcKabul(); recalcKg(null);
      });
    }
    if (el.manualGoldPrice) {
      el.manualGoldPrice.addEventListener('input', onManualPriceInput);
      el.manualGoldPrice.addEventListener('change', onManualPriceInput);
    }
    if (el.gramInput) el.gramInput.addEventListener('input', function () { if (!_syncingWeight) recalcKg('gram'); });
    if (el.kgInput) el.kgInput.addEventListener('input', function () { if (!_syncingWeight) recalcKg('kg'); });
    if (el.tolaInput) el.tolaInput.addEventListener('input', function () { if (!_syncingWeight) recalcKg('tola'); });
    if (el.ounceInput) el.ounceInput.addEventListener('input', function () { if (!_syncingWeight) recalcKg('ounce'); });

    bindNav();
    bindApiToggle();
    loadInitialSeries();

    if (window.MM_STATE.goldPrice) { recalcKabul(); recalcKg('gram'); }
    else recalcKg('gram');
  });
})();
