/**
 * Polish index.html — remove broken symbols, add Lucide icons
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'index.html');
let html = fs.readFileSync(file, 'utf8');

// Remove BOM / stray char before DOCTYPE
if (!html.startsWith('<!DOCTYPE')) {
  html = html.replace(/^[\uFEFF\uFFFD]?/, '');
  if (!html.startsWith('<!DOCTYPE')) {
    html = '<!DOCTYPE html>\n' + html.replace(/^[^<]*/, '');
  }
}

// Remove Unicode replacement chars and broken emoji tails
html = html.replace(/\uFFFD\uFE0F?/g, '');
html = html.replace(/\uFFFD/g, '');

// Specific text fixes
html = html.replace(/＋/g, '+');
html = html.replace(/\u00A9 2026| 2026 AMS/g, '© 2026 AMS');
html = html.replace(/AMS Pro  Acme/g, 'AMS Pro · Acme');
html = html.replace(/● Checking\.\.\./g, '● Checking...');
html = html.replace(/Loading notifications…/g, 'Loading notifications...');

// Permission table: broken cross → em dash
html = html.replace(/<td>No<\/td>/g, '<td>—</td>');
html = html.replace(/<td>Yes<\/td>/g, '<td>✓</td>');

// Lucide CDN
if (!html.includes('lucide@')) {
  html = html.replace(
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
    `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>`
  );
}

// Icon CSS
if (!html.includes('.ico svg')) {
  html = html.replace(
    '.nicon{width:19px;height:19px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px}',
    `.nicon{width:19px;height:19px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.ico,.nicon svg,.sc-icon svg,.iBtn svg,.sicon svg,.th-opt svg,.t-icon svg,.lk-lock-icon svg{width:18px;height:18px;stroke-width:2;stroke:currentColor;fill:none}
.sc-icon svg{width:20px;height:20px}
.th-opt svg{width:15px;height:15px}
.t-icon svg{width:16px;height:16px}`
  );
}

function lucideIcon(name) {
  return `<i data-lucide="${name}" class="ico"></i>`;
}

// Sidebar
const navMap = [
  ['id="n-dashboard"', 'layout-dashboard'],
  ['id="n-assets"', 'package'],
  ['id="n-employees"', 'users'],
  ['id="n-allocation"', 'arrow-left-right'],
  ['id="n-maintenance"', 'wrench'],
  ['id="n-vendors"', 'building-2'],
  ['id="n-reports"', 'bar-chart-3'],
  ['id="n-depreciation"', 'trending-down'],
  ['id="n-notifications"', 'bell'],
  ['id="n-audit"', 'clipboard-list'],
  ['id="n-settings"', 'settings'],
];
for (const [attr, icon] of navMap) {
  const re = new RegExp(`(<div class="nitem"[^>]*${attr}[^>]*>)<span class="nicon">[\\s\\S]*?</span>`, 'g');
  html = html.replace(re, `$1<span class="nicon">${lucideIcon(icon)}</span>`);
}
html = html.replace(
  /<div class="nitem" onclick="doLogout\(\)"><span class="nicon">[\s\S]*?<\/span>/,
  `<div class="nitem" onclick="doLogout()"><span class="nicon">${lucideIcon('log-out')}</span>`
);

// Topbar
html = html.replace(/<span class="sicon">[\s\S]*?<\/span>/, `<span class="sicon">${lucideIcon('search')}</span>`);
html = html.replace(
  /<button class="iBtn" onclick="openCmd\(\)"[\s\S]*?<\/button>/,
  `<button class="iBtn" onclick="openCmd()" title="Command Palette (Ctrl+K)">${lucideIcon('command')}</button>`
);
html = html.replace(
  /<div class="th-opt on" id="td"[\s\S]*?<\/div>/,
  `<div class="th-opt on" id="td" onclick="setTheme('dark')" title="Dark">${lucideIcon('moon')}</div>`
);
html = html.replace(
  /<div class="th-opt" id="tl"[\s\S]*?<\/div>/,
  `<div class="th-opt" id="tl" onclick="setTheme('light')" title="Light">${lucideIcon('sun')}</div>`
);
html = html.replace(
  /<div class="th-opt" id="ts"[\s\S]*?<\/div>/,
  `<div class="th-opt" id="ts" onclick="setTheme('system')" title="System">${lucideIcon('monitor')}</div>`
);
html = html.replace(
  /<button class="iBtn" onclick="nav\('notifications'\)"[\s\S]*?<\/button>/,
  `<button class="iBtn" onclick="nav('notifications')" title="Notifications">${lucideIcon('bell')}<span class="ndot"></span></button>`
);

// Login lock
html = html.replace(
  /<span class="lk-lock-icon" id="lockIcon">[\s\S]*?<\/span>/,
  `<span class="lk-lock-icon" id="lockIcon">${lucideIcon('lock')}</span>`
);
html = html.replace(
  /<span id="signupLockIcon">[\s\S]*?<\/span> Create Account/,
  `<span id="signupLockIcon">${lucideIcon('user-plus')}</span> Create Account`
);

// Dashboard stat cards — replace sc-icon contents
const stats = [
  [/"sc" onclick="nav\('assets'\)"/, 'package', 'bg-blue'],
  [/"sc" onclick="fNav\('available'\)"/, 'check-circle', 'bg-green'],
  [/"sc" onclick="fNav\('inuse'\)"/, 'monitor', 'bg-purple'],
  [/"sc" onclick="fNav\('repair'\)"/, 'wrench', 'bg-yellow'],
  [/"sc" onclick="fNav\('disposed'\)"/, 'trash-2', 'bg-red'],
  [/"sc" onclick="nav\('reports'\)"/, 'alert-triangle', 'bg-orange'],
];
for (const [re, icon, bg] of stats) {
  html = html.replace(
    new RegExp(`(<div class=${re}[\\s\\S]*?<div class="sc-icon )[^"]*("[\\s\\S]*?</div>)`),
    `$1${bg}">${lucideIcon(icon)}$2`
  );
}

// Toast
html = html.replace(
  /function toast\(type, title, msg\) \{[\s\S]*?\n\}/,
  `function toast(type, title, msg) {
  const wrap  = document.getElementById('toastWrap');
  const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
  const t     = document.createElement('div');
  t.className = \`toast \${type}\`;
  const iconName = icons[type] || 'info';
  t.innerHTML = \`<div class="t-icon"><i data-lucide="\${iconName}" class="ico"></i></div>
    <div class="t-body"><div class="t-title">\${title}</div><div class="t-msg">\${msg || ''}</div></div>\`;
  wrap.appendChild(t);
  if (window.lucide) lucide.createIcons({ nodes: [t] });
  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition= 'all .3s';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}`
);

// Icon helpers + init
if (!html.includes('function initIcons')) {
  html = html.replace(
    '(async function initApp() {',
    `function initIcons() {
  if (window.lucide) lucide.createIcons();
}
function setLockIcon(name) {
  const el = document.getElementById('lockIcon');
  if (!el) return;
  el.innerHTML = '<i data-lucide="' + name + '" class="ico"></i>';
  if (window.lucide) lucide.createIcons({ nodes: [el] });
}

(async function initApp() {`
  );
  html = html.replace(
    'await window.AMS.auth.restoreSession();\n})();',
    `await window.AMS.auth.restoreSession();
  initIcons();
})();`
  );
}

// Lock handle JS
html = html.replace(/if \(icon\) icon\.textContent = '[^']*';/g, "setLockIcon('loader');");
html = html.replace(/setLockIcon\('loader'\);\s*\n\s*else\s*\{[^}]*setLockIcon\('lock'\);/g, "setLockIcon('lock');");
html = html.replace(/h\.classList\.add\('unlocking'\); if \(icon\) setLockIcon\('loader'\);/g, "h.classList.add('unlocking'); setLockIcon('lock-open');");
html = html.replace(/h\.classList\.remove\('unlocking'\); if \(icon\) setLockIcon\('loader'\);/g, "h.classList.remove('unlocking'); setLockIcon('lock');");

// Fix resetHandle
html = html.replace(
  /function resetHandle\(\) \{[\s\S]*?setTimeout\(\(\) => h\.style\.transition = '', 360\);\n\}/,
  `function resetHandle() {
  const h = document.getElementById('slideHandle');
  h.style.transition = 'bottom .35s cubic-bezier(.4,0,.2,1)';
  h.style.bottom = PADDING + 'px';
  h.classList.remove('unlocking');
  setLockIcon('lock');
  currentOffset = 0;
  setTimeout(() => h.style.transition = '', 360);
}`
);

// auth.js lock icon references
const authFile = path.join(__dirname, 'js', 'auth.js');
let auth = fs.readFileSync(authFile, 'utf8');
auth = auth.replace(/if \(lockIcon\) lockIcon\.textContent = '[^']*';/g, (m) => {
  if (m.includes('⏳') || m.includes('loader')) return "if (lockIcon && typeof setLockIcon === 'function') setLockIcon('loader');";
  if (m.includes('✉')) return "if (lockIcon && typeof setLockIcon === 'function') setLockIcon('mail');";
  return "if (lockIcon && typeof setLockIcon === 'function') setLockIcon('lock');";
});
fs.writeFileSync(authFile, auth, 'utf8');

fs.writeFileSync(file, html, 'utf8');
console.log('Remaining replacement chars:', (html.match(/\uFFFD/g) || []).length);
console.log('Done — UI polished with Lucide icons.');
