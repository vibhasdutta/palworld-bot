const express = require('express');
const crypto = require('crypto');
const { readWorldSettings, writeWorldSettings } = require('./worldSettingsParser');
const { SETTINGS_SCHEMA, CATEGORIES } = require('./settingsSchema');
const { resolveTier, hasAccess, findGuildRoles } = require('./permissions');
const { findGuildServer } = require('./config');
const { controlService } = require('./processControl');

// Configuration constants from ENV
const WEB_PORT = process.env.WEB_PORT || 8090;
const WEB_SECRET = process.env.WEB_SECRET || crypto.randomBytes(32).toString('hex');
const WEB_BASE_URL = process.env.WEB_BASE_URL || `http://localhost:${WEB_PORT}`;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// Helper: Signing and verification
function signPayload(payload, secret) {
  const json = JSON.stringify(payload);
  const base64url = Buffer.from(json).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(base64url).digest('base64url');
  return `${base64url}.${hmac}`;
}

function verifyPayload(signed, secret) {
  if (!signed || typeof signed !== 'string') return null;
  const parts = signed.split('.');
  if (parts.length !== 2) return null;
  const [base64url, signature] = parts;
  const expectedHmac = crypto.createHmac('sha256', secret).update(base64url).digest('base64url');
  if (expectedHmac !== signature) return null;
  
  try {
    const json = Buffer.from(base64url, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Helper: parse cookies
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// Helper: escape HTML
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, (tag) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[tag]));
}

const ERROR_TEMPLATE = (title, message) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Palworld Settings</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: #1a1a2e;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
    }
    .card {
      background: #16213e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #ef4444; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>
`;

const LOGOUT_TEMPLATE = () => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logged Out - Palworld Settings</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: #1a1a2e;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #16213e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 1rem;
      padding: 2.5rem;
      text-align: center;
    }
    h1 { font-size: 1.5rem; color: #22c55e; margin-bottom: 0.5rem; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Logged Out</h1>
    <p>Your session has been securely terminated.</p>
  </div>
</body>
</html>
`;

// The HTML Template
const HTML_TEMPLATE = (user, serverName, serverLabel, settings, schema, categories) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Palworld Server Settings - ${escapeHtml(serverLabel)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #1a1a2e;
      --card-bg: #16213e;
      --accent: #7c3aed;
      --accent-hover: #6d28d9;
      --text-main: #e2e8f0;
      --text-muted: #94a3b8;
      --success: #22c55e;
      --error: #ef4444;
      --warning: #f59e0b;
      --border: rgba(255, 255, 255, 0.1);
      --highlight: rgba(124, 58, 237, 0.5);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body { background-color: var(--bg-color); color: var(--text-main); padding-bottom: 80px; min-height: 100vh; }
    
    .header {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    
    .header-left { display: flex; align-items: center; gap: 1rem; }
    .header-title { font-size: 1.25rem; font-weight: 700; }
    .badge {
      background: var(--accent);
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      text-transform: uppercase;
    }
    
    .user-profile { display: flex; align-items: center; gap: 0.75rem; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 700; }
    .avatar img { width: 100%; height: 100%; border-radius: 50%; }
    .username { font-weight: 600; font-size: 0.9rem; }
    .logout-btn { color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 0.375rem; transition: all 0.2s; }
    .logout-btn:hover { background: rgba(255,255,255,0.05); color: var(--text-main); }

    .main-container { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
    .search-box { width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.8rem 1rem; color: var(--text-main); font-size: 0.95rem; margin-bottom: 1.5rem; outline: none; }
    .search-box:focus { border-color: var(--accent); }

    .category-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; margin-bottom: 1rem; overflow: hidden; }
    .category-header { padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; background: rgba(255,255,255,0.02); }
    .category-title { font-weight: 600; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; }
    .category-body { padding: 1.25rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; border-top: 1px solid var(--border); }
    .category-card.collapsed .category-body { display: none; }
    .chevron { transition: transform 0.2s; }
    .category-card.collapsed .chevron { transform: rotate(-90deg); }

    .setting-item { background: rgba(0,0,0,0.15); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.9rem; transition: border-color 0.2s; }
    .setting-item.changed { border-color: var(--warning); box-shadow: 0 0 8px rgba(245, 158, 11, 0.2); }
    .setting-label { font-weight: 600; font-size: 0.85rem; margin-bottom: 0.3rem; display: flex; justify-content: space-between; align-items: center; }
    .setting-desc { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.6rem; line-height: 1.3; }
    
    input[type="text"], input[type="number"], select {
      width: 100%;
      background: var(--bg-color);
      border: 1px solid var(--border);
      border-radius: 0.375rem;
      padding: 0.5rem 0.75rem;
      color: var(--text-main);
      font-size: 0.875rem;
      outline: none;
    }
    input:focus, select:focus { border-color: var(--accent); }

    .toggle-switch { position: relative; display: inline-block; width: 44px; height: 22px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .2s; border-radius: 22px; }
    .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
    input:checked + .slider { background-color: var(--accent); }
    input:checked + .slider:before { transform: translateX(22px); }

    .footer {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      z-index: 100;
    }

    .btn {
      padding: 0.6rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      border: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: background 0.2s;
    }
    .btn-primary { background: var(--success); color: white; }
    .btn-primary:hover { background: #16a34a; }
    .btn-warning { background: var(--warning); color: white; }
    .btn-warning:hover { background: #d97706; }
    .btn-secondary { background: #475569; color: white; }
    .btn-secondary:hover { background: #334155; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .toast-container { position: fixed; top: 80px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 0.5rem; }
    .toast {
      background: var(--card-bg);
      border-left: 4px solid var(--accent);
      padding: 0.8rem 1.2rem;
      border-radius: 0.375rem;
      font-size: 0.85rem;
      transform: translateX(120%);
      transition: transform 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .toast.show { transform: translateX(0); }
    .toast.success { border-left-color: var(--success); }
    .toast.error { border-left-color: var(--error); }
    
    .spinner { display: none; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading .spinner { display: inline-block; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="header-title">${escapeHtml(serverName || 'Palworld Server')}</div>
      <div class="badge">${escapeHtml(serverLabel)}</div>
    </div>
    <div class="user-profile">
      <div class="avatar">
        ${user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png" alt="Avatar">` : escapeHtml(user.username.charAt(0).toUpperCase())}
      </div>
      <div class="username">${escapeHtml(user.username)}</div>
      <a href="/auth/logout" class="logout-btn">Logout</a>
    </div>
  </div>

  <div class="main-container">
    <input type="text" class="search-box" id="searchInput" placeholder="🔍 Search settings by name...">
    <div id="settingsContainer"></div>
  </div>

  <div class="footer">
    <button class="btn btn-secondary" id="btnReset">Reset Changes</button>
    <button class="btn btn-primary" id="btnSave">Save Settings <div class="spinner"></div></button>
    <button class="btn btn-warning" id="btnSaveRestart">Save & Restart Server <div class="spinner"></div></button>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <script>
    const INITIAL_SETTINGS = ${JSON.stringify(settings)};
    const SCHEMA = ${JSON.stringify(schema)};
    const CATEGORIES = ${JSON.stringify(categories)};
    
    let currentSettings = { ...INITIAL_SETTINGS };
    let originalSettings = { ...INITIAL_SETTINGS };
    
    const container = document.getElementById('settingsContainer');
    const grouped = {};
    SCHEMA.forEach(field => {
      const cat = field.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(field);
    });
    
    let catIndex = 0;
    for (const [catName, fields] of Object.entries(grouped)) {
      const catInfo = CATEGORIES[catName] || { label: catName, icon: '⚙️' };
      const card = document.createElement('div');
      card.className = 'category-card' + (catIndex >= 3 ? ' collapsed' : '');
      card.dataset.category = catName;
      
      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = '<div class="category-title"><span class="category-icon">' + catInfo.icon + '</span>' + catInfo.label + '</div><svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      
      header.addEventListener('click', () => card.classList.toggle('collapsed'));
      
      const body = document.createElement('div');
      body.className = 'category-body';
      
      fields.forEach(field => {
        const val = currentSettings[field.key];
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-item';
        wrapper.dataset.key = field.key;
        wrapper.dataset.name = (field.label || field.key).toLowerCase();
        
        let inputHtml = '';
        if (field.type === 'boolean') {
          const checked = (val === true || val === 'True') ? 'checked' : '';
          inputHtml = '<div class="setting-label"><span>' + (field.label || field.key) + '</span><label class="toggle-switch"><input type="checkbox" id="input-' + field.key + '" ' + checked + '><span class="slider"></span></label></div>' + (field.description ? '<div class="setting-desc">' + field.description + '</div>' : '');
        } else if (field.type === 'select' && field.options) {
          const opts = field.options.map(o => '<option value="' + o + '" ' + (val == o ? 'selected' : '') + '>' + o + '</option>').join('');
          inputHtml = '<label class="setting-label" for="input-' + field.key + '">' + (field.label || field.key) + '</label>' + (field.description ? '<div class="setting-desc">' + field.description + '</div>' : '') + '<select id="input-' + field.key + '">' + opts + '</select>';
        } else if (field.type === 'number') {
          const stepAttr = field.step ? 'step="' + field.step + '"' : '';
          const minAttr = field.min !== undefined ? 'min="' + field.min + '"' : '';
          inputHtml = '<label class="setting-label" for="input-' + field.key + '">' + (field.label || field.key) + '</label>' + (field.description ? '<div class="setting-desc">' + field.description + '</div>' : '') + '<input type="number" id="input-' + field.key + '" value="' + (val !== undefined ? val : '') + '" ' + stepAttr + ' ' + minAttr + '>';
        } else {
          inputHtml = '<label class="setting-label" for="input-' + field.key + '">' + (field.label || field.key) + '</label>' + (field.description ? '<div class="setting-desc">' + field.description + '</div>' : '') + '<input type="text" id="input-' + field.key + '" value="' + (val !== undefined ? val : '') + '">';
        }
        
        wrapper.innerHTML = inputHtml;
        body.appendChild(wrapper);
      });
      
      card.appendChild(header);
      card.appendChild(body);
      container.appendChild(card);
      catIndex++;
    }
    
    const PRESETS = {
      Easy: { ExpRate: 1.3, PalCaptureRate: 1.3, PalDamageRateAttack: 1.0, PalDamageRateDefense: 0.8, PlayerDamageRateAttack: 1.5, PlayerDamageRateDefense: 0.7, PlayerStomachDecreaceRate: 0.7, PlayerStaminaDecreaceRate: 0.7, PalStomachDecreaceRate: 0.7, PalStaminaDecreaceRate: 0.7, CollectionDropRate: 1.3, EnemyDropItemRate: 1.3, DeathPenalty: 'None', PalEggDefaultHatchingTime: 0.0 },
      Normal: { ExpRate: 1.0, PalCaptureRate: 1.0, PalDamageRateAttack: 1.0, PalDamageRateDefense: 1.0, PlayerDamageRateAttack: 1.0, PlayerDamageRateDefense: 1.0, PlayerStomachDecreaceRate: 1.0, PlayerStaminaDecreaceRate: 1.0, PalStomachDecreaceRate: 1.0, PalStaminaDecreaceRate: 1.0, CollectionDropRate: 1.0, EnemyDropItemRate: 1.0, DeathPenalty: 'Item', PalEggDefaultHatchingTime: 2.0 },
      Hard: { ExpRate: 0.8, PalCaptureRate: 0.8, PalDamageRateAttack: 1.5, PalDamageRateDefense: 1.5, PlayerDamageRateAttack: 0.5, PlayerDamageRateDefense: 4.0, PlayerStomachDecreaceRate: 1.5, PlayerStaminaDecreaceRate: 1.5, PalStomachDecreaceRate: 1.5, PalStaminaDecreaceRate: 1.5, CollectionDropRate: 0.5, EnemyDropItemRate: 0.5, DeathPenalty: 'All', PalEggDefaultHatchingTime: 72.0 }
    };

    function updateFormFromSettings(settingsObj) {
      SCHEMA.forEach(field => {
        const el = document.getElementById('input-' + field.key);
        if (!el) return;
        const val = settingsObj[field.key];
        if (field.type === 'boolean') {
          el.checked = (val === true || val === 'True');
        } else {
          el.value = val !== undefined ? val : '';
        }
        
        const orig = originalSettings[field.key];
        const isChanged = String(val) !== String(orig);
        const wrapper = document.querySelector('.setting-item[data-key="' + field.key + '"]');
        if (wrapper) {
          if (isChanged) wrapper.classList.add('changed');
          else wrapper.classList.remove('changed');
        }
      });
    }

    SCHEMA.forEach(field => {
      const el = document.getElementById('input-' + field.key);
      if (!el) return;
      
      const updateChangeState = () => {
        let newVal;
        if (field.type === 'boolean') {
          newVal = el.checked ? 'True' : 'False';
        } else if (field.type === 'number') {
          newVal = el.value !== '' ? Number(el.value) : undefined;
        } else {
          newVal = el.value;
        }
        
        // Handle Difficulty Preset selection
        if (field.key === 'Difficulty' && PRESETS[newVal]) {
          const preset = PRESETS[newVal];
          for (const [pKey, pVal] of Object.entries(preset)) {
            currentSettings[pKey] = pVal;
          }
          currentSettings.Difficulty = newVal;
          updateFormFromSettings(currentSettings);
          showToast('Applied ' + newVal + ' preset settings!', 'success');
          return;
        }

        // If manually changing a setting while Difficulty is preset, switch Difficulty to Custom
        if (field.key !== 'Difficulty' && PRESETS[currentSettings.Difficulty]) {
          currentSettings.Difficulty = 'Custom';
          const diffEl = document.getElementById('input-Difficulty');
          if (diffEl) diffEl.value = 'Custom';
        }
        
        currentSettings[field.key] = newVal;
        const orig = originalSettings[field.key];
        const isChanged = String(newVal) !== String(orig);
        
        const wrapper = document.querySelector('.setting-item[data-key="' + field.key + '"]');
        if (wrapper) {
          if (isChanged) wrapper.classList.add('changed');
          else wrapper.classList.remove('changed');
        }
      };
      
      el.addEventListener('input', updateChangeState);
      el.addEventListener('change', updateChangeState);
    });

    document.getElementById('btnReset').addEventListener('click', () => {
      currentSettings = { ...originalSettings };
      updateFormFromSettings(currentSettings);
      showToast('Form reset to loaded settings.', 'success');
    });
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('.category-card').forEach(card => {
        let hasVisible = false;
        card.querySelectorAll('.setting-item').forEach(item => {
          const name = item.dataset.name;
          if (name.includes(term)) {
            item.classList.remove('hidden');
            hasVisible = true;
          } else {
            item.classList.add('hidden');
          }
        });
        if (hasVisible) {
          card.classList.remove('hidden');
          if (term.length > 0) card.classList.remove('collapsed');
        } else {
          card.classList.add('hidden');
        }
      });
    });
    
    function showToast(message, type = 'success') {
      const t = document.createElement('div');
      t.className = 'toast ' + type;
      t.innerHTML = message;
      document.getElementById('toastContainer').appendChild(t);
      void t.offsetWidth;
      t.classList.add('show');
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 4000);
    }
    
    async function save(restart = false) {
      const btn = restart ? document.getElementById('btnSaveRestart') : document.getElementById('btnSave');
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        const res = await fetch('/settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: currentSettings, restart })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(data.message || (restart ? 'Saved and restarting server...' : 'Settings saved successfully!'), 'success');
          originalSettings = { ...currentSettings };
          document.querySelectorAll('.setting-item.changed').forEach(el => el.classList.remove('changed'));
        } else {
          showToast(data.error || 'Failed to save settings.', 'error');
        }
      } catch (err) {
        showToast('Network error saving settings.', 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
    
    document.getElementById('btnSave').addEventListener('click', () => save(false));
    document.getElementById('btnSaveRestart').addEventListener('click', () => save(true));
  </script>
</body>
</html>
`;

function createWebServer({ config, client, notify, auditLog }) {
  const app = express();
  app.use(express.json());

  // Helper: check session
  const getSession = (req) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie = cookies.palworld_session;
    if (!sessionCookie) return null;
    const session = verifyPayload(sessionCookie, WEB_SECRET);
    if (!session) return null;
    if (session.exp && Date.now() > session.exp) return null;
    return session;
  };

  // Auth Login Route
  app.get('/auth/login', (req, res) => {
    const { guild, server } = req.query;
    if (!guild) {
      return res.status(400).send(ERROR_TEMPLATE('Missing Parameter', 'Guild ID is required.'));
    }

    const payload = {
      guildId: guild,
      serverLabel: server || '',
      nonce: crypto.randomBytes(16).toString('hex'),
      exp: Date.now() + 10 * 60 * 1000,
    };
    const state = signPayload(payload, WEB_SECRET);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${WEB_BASE_URL}/auth/callback`,
      response_type: 'code',
      scope: 'identify',
      state,
    });

    res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
  });

  // Auth Callback Route
  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send(ERROR_TEMPLATE('Auth Error', 'Missing code or state from Discord.'));
    }

    const stateData = verifyPayload(state, WEB_SECRET);
    if (!stateData || Date.now() > stateData.exp) {
      return res.status(400).send(ERROR_TEMPLATE('Invalid State', 'Login session expired or invalid. Please try again.'));
    }

    const { guildId, serverLabel } = stateData;

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: DISCORD_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${WEB_BASE_URL}/auth/callback`,
        }),
      });

      if (!tokenRes.ok) {
        return res.status(400).send(ERROR_TEMPLATE('OAuth Failed', 'Failed to exchange authorization code with Discord.'));
      }

      const tokenData = await tokenRes.json();

      // Fetch user profile
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return res.status(400).send(ERROR_TEMPLATE('OAuth Failed', 'Failed to fetch user profile from Discord.'));
      }

      const user = await userRes.json();

      // Check Discord member tier in guild
      let hasAdmin = false;
      try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id);
        const roleIds = [...member.roles.cache.keys()];
        const guildRoles = findGuildRoles(config.roles, guildId);
        const tier = resolveTier({ roleIds, userId: user.id }, guildRoles);
        hasAdmin = hasAccess(tier, 'admin');
      } catch (err) {
        console.error(`Failed to verify member ${user.id} in guild ${guildId}:`, err.message);
      }

      if (!hasAdmin) {
        return res.status(403).send(ERROR_TEMPLATE('Access Denied', 'You need Admin permissions in this Discord server to access world settings.'));
      }

      // Create session payload
      const sessionPayload = {
        userId: user.id,
        username: user.global_name || user.username,
        avatar: user.avatar,
        guildId,
        serverLabel,
        exp: Date.now() + 30 * 60 * 1000,
      };

      const sessionCookie = signPayload(sessionPayload, WEB_SECRET);
      res.setHeader('Set-Cookie', `palworld_session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax`);
      res.redirect('/settings');
    } catch (err) {
      console.error('OAuth Callback Error:', err);
      res.status(500).send(ERROR_TEMPLATE('Server Error', err.message));
    }
  });

  // Settings Dashboard Route
  app.get('/settings', (req, res) => {
    const session = getSession(req);
    if (!session) {
      return res.status(401).send(ERROR_TEMPLATE('Unauthorized', 'Your session has expired or is invalid. Please run /worldsettings again in Discord.'));
    }

    const { guildId, serverLabel, username, avatar, userId } = session;
    const server = findGuildServer(config.servers, guildId, serverLabel);
    if (!server || !server.settingsFilePath) {
      return res.status(404).send(ERROR_TEMPLATE('Server Not Found', `No configured settings file found for server "${serverLabel}".`));
    }

    const { settings: settingsMap, exists } = readWorldSettings(server.settingsFilePath);
    if (!exists) {
      return res.status(404).send(ERROR_TEMPLATE('File Not Found', `PalWorldSettings.ini not found at path: ${server.settingsFilePath}`));
    }

    const settingsObj = {};
    for (const [k, v] of settingsMap.entries()) {
      settingsObj[k] = v;
    }

    const serverName = settingsObj.ServerName || server.label || 'Palworld Server';
    const html = HTML_TEMPLATE({ username, avatar, userId }, serverName, server.label, settingsObj, SETTINGS_SCHEMA, CATEGORIES);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // Save Settings Route
  app.post('/settings/save', async (req, res) => {
    const session = getSession(req);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Unauthorized or session expired.' });
    }

    const { guildId, serverLabel, username, userId } = session;
    const { settings: newSettings, restart } = req.body;

    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid settings payload.' });
    }

    const server = findGuildServer(config.servers, guildId, serverLabel);
    if (!server || !server.settingsFilePath) {
      return res.status(404).json({ success: false, error: 'Server configuration not found.' });
    }

    const { settings: currentMap } = readWorldSettings(server.settingsFilePath);
    const changedKeys = [];

    for (const [key, val] of Object.entries(newSettings)) {
      const oldVal = currentMap.get(key);
      if (String(oldVal) !== String(val)) {
        changedKeys.push(key);
        currentMap.set(key, val);
      }
    }

    if (changedKeys.length === 0) {
      return res.json({ success: true, message: 'No settings were changed.' });
    }

    const success = writeWorldSettings(server.settingsFilePath, currentMap);
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to write updated settings to disk.' });
    }

    // Append Audit Log
    if (auditLog && auditLog.appendAuditEntry) {
      auditLog.appendAuditEntry({
        guildId,
        actor: username,
        actorId: userId,
        command: 'worldsettings',
        changes: changedKeys.length,
        changedKeys: changedKeys.join(', '),
      });
    }

    // Post to Server Log
    if (notify && notify.serverLog) {
      notify.serverLog(guildId, {
        event: 'settings.updated',
        level: 'warning',
        msg: `<@${userId}> updated ${changedKeys.length} settings via web editor`,
        actor: `${username} (${userId})`,
        server: server.label,
        changes: changedKeys.join(', '),
      }).catch(() => {});
    }

    let message = `Successfully saved ${changedKeys.length} setting(s)!`;

    // Handle Optional Server Restart
    if (restart && server.pm2ProcessName) {
      try {
        await controlService(server.pm2ProcessName, 'restart');
        message += ' Server restart triggered.';
      } catch (err) {
        message += ` Warning: failed to restart server: ${err.message}`;
      }
    }

    res.json({ success: true, message });
  });

  // Logout Route
  app.get('/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'palworld_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.send(LOGOUT_TEMPLATE());
  });

  // Health Check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  return {
    app,
    start: () => {
      app.listen(WEB_PORT, () => {
        console.log(`Web settings server listening on port ${WEB_PORT} (${WEB_BASE_URL})`);
      });
    },
    getBaseUrl: () => WEB_BASE_URL,
  };
}

module.exports = { createWebServer, signPayload, verifyPayload, parseCookies };
