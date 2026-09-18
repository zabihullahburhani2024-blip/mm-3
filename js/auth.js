/**
 * Mini Matrix — client-side auth (no server)
 * Users + assigned codes in localStorage
 * Codes pool from js/codes.js (1000 × 32-char)
 */
(function (global) {
  'use strict';

  var USERS_KEY = 'mm_users_v1';
  var SESSION_KEY = 'mm_session_v1';
  var USED_CODES_KEY = 'mm_used_codes_v1';

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveUsers(list) {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
  }
  function loadUsedCodes() {
    try { return JSON.parse(localStorage.getItem(USED_CODES_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveUsedCodes(list) {
    localStorage.setItem(USED_CODES_KEY, JSON.stringify(list));
  }

  function hash(str) {
    // simple non-crypto hash for client-only demos
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }

  function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function findUser(phone) {
    var p = normalizePhone(phone);
    return loadUsers().find(function (u) { return u.phone === p; }) || null;
  }

  function register(data) {
    var phone = normalizePhone(data.phone);
    var name = (data.name || '').trim();
    var password = data.password || '';
    var recovery = (data.recovery || '').trim();

    if (!name || phone.length < 8 || password.length < 4) {
      return { ok: false, error: 'invalid_input' };
    }
    if (findUser(phone)) {
      return { ok: false, error: 'exists' };
    }

    var codes = global.MM_CODES || [];
    var used = loadUsedCodes();
    var code = null;
    for (var i = 0; i < codes.length; i++) {
      if (used.indexOf(codes[i]) === -1) {
        code = codes[i];
        break;
      }
    }
    if (!code) {
      return { ok: false, error: 'no_codes' };
    }

    used.push(code);
    saveUsedCodes(used);

    var users = loadUsers();
    users.push({
      id: 'u_' + Date.now(),
      name: name,
      phone: phone,
      passHash: hash(password),
      recovery: recovery,
      code: code,
      activated: false,
      createdAt: Date.now(),
    });
    saveUsers(users);

    return { ok: true, code: code, phone: phone, name: name };
  }

  function login(phone, password) {
    var user = findUser(phone);
    if (!user) return { ok: false, error: 'not_found' };
    if (user.passHash !== hash(password)) return { ok: false, error: 'bad_password' };
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      phone: user.phone,
      name: user.name,
      activated: !!user.activated,
      at: Date.now(),
    }));
    return { ok: true, user: user };
  }

  function activate(phone, code) {
    var users = loadUsers();
    var p = normalizePhone(phone);
    var c = String(code || '').trim().toLowerCase();
    var idx = users.findIndex(function (u) { return u.phone === p; });
    if (idx < 0) return { ok: false, error: 'not_found' };
    if (String(users[idx].code).toLowerCase() !== c) {
      // also accept any unused pool code owned by this user only — strict match to assigned
      return { ok: false, error: 'bad_code' };
    }
    users[idx].activated = true;
    saveUsers(users);
    var sess = getSession();
    if (sess && sess.phone === p) {
      sess.activated = true;
      localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    }
    return { ok: true };
  }

  function resetPassword(phone, recovery, newPassword) {
    var users = loadUsers();
    var p = normalizePhone(phone);
    var idx = users.findIndex(function (u) { return u.phone === p; });
    if (idx < 0) return { ok: false, error: 'not_found' };
    if (!users[idx].recovery || users[idx].recovery !== recovery) {
      return { ok: false, error: 'bad_recovery' };
    }
    if (!newPassword || newPassword.length < 4) return { ok: false, error: 'weak_password' };
    users[idx].passHash = hash(newPassword);
    saveUsers(users);
    return { ok: true };
  }

  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!s || !s.phone) return null;
      // refresh activated flag from users
      var u = findUser(s.phone);
      if (u) s.activated = !!u.activated;
      return s;
    } catch (e) { return null; }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function requireActivated() {
    var s = getSession();
    return !!(s && s.activated);
  }

  function whatsappLink(phone, code, name) {
    var text = encodeURIComponent(
      'Mini Matrix Activation\n' +
      'Name: ' + (name || '') + '\n' +
      'Phone: ' + (phone || '') + '\n' +
      'Code: ' + (code || '') + '\n' +
      '(Keep this code private)'
    );
    // open chat with self / user number if possible
    var num = normalizePhone(phone);
    if (num) return 'https://wa.me/' + num + '?text=' + text;
    return 'https://wa.me/?text=' + text;
  }

  function stats() {
    var codes = global.MM_CODES || [];
    var used = loadUsedCodes();
    return {
      totalCodes: codes.length,
      usedCodes: used.length,
      freeCodes: Math.max(0, codes.length - used.length),
      users: loadUsers().length,
    };
  }

  global.MM_AUTH = {
    register: register,
    login: login,
    activate: activate,
    resetPassword: resetPassword,
    getSession: getSession,
    logout: logout,
    requireActivated: requireActivated,
    whatsappLink: whatsappLink,
    findUser: findUser,
    stats: stats,
    normalizePhone: normalizePhone,
  };
})(window);
