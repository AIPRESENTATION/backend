/**
 * auth.js — AMS Pro Authentication
 */

let currentUser = null;

function getCurrentUser() { return currentUser; }
function isSuperAdmin()   { return currentUser?.role === 'Super Admin'; }
function isAdmin()        { return currentUser?.role === 'Admin' || isSuperAdmin(); }
function isManager()      { return currentUser?.role === 'Manager' || isAdmin(); }

// ── Load profile (with fallback if RLS blocks) ────────────────────────────────
async function loadUserProfile(authUser) {
  try {
    const { data, error } = await window.AMS.db
      .from('profiles')
      .select('id, employee_code, full_name, email, role, status, avatar_color, department_id, designation, phone')
      .eq('id', authUser.id)
      .single();

    if (error) {
      console.warn('[Auth] Profile query error:', error.message, error.code);
      // If profile missing (PGRST116 = no rows), create a basic one
      if (error.code === 'PGRST116') {
        return await createFallbackProfile(authUser);
      }
      return null;
    }
    return data;
  } catch (e) {
    console.error('[Auth] Profile load exception:', e.message);
    return null;
  }
}

// Create profile row if trigger didn't fire
async function createFallbackProfile(authUser) {
  const fallback = {
    id:           authUser.id,
    email:        authUser.email,
    full_name:    authUser.user_metadata?.full_name || authUser.email.split('@')[0],
    role:         authUser.user_metadata?.role || 'Employee',
    status:       'active',
    avatar_color: 'linear-gradient(135deg,#3b82f6,#6366f1)',
  };
  const { data, error } = await window.AMS.db
    .from('profiles')
    .upsert(fallback)
    .select()
    .single();
  if (error) { console.error('[Auth] Fallback profile error:', error.message); return null; }
  return data;
}

// ── Update sidebar UI ─────────────────────────────────────────────────────────
function updateSidebarUser(profile) {
  const sfName  = document.querySelector('.sf-name');
  const sfRole  = document.querySelector('.sf-role');
  const avatar  = document.querySelector('.avatar');
  const logoSub = document.querySelector('.logo-sub');
  const name    = profile.full_name || profile.email || 'User';
  const role    = profile.role || 'Employee';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  if (sfName)  sfName.textContent  = name;
  if (sfRole)  sfRole.textContent  = role;
  if (logoSub) logoSub.textContent = `v2.0 · ${role}`;
  if (avatar) {
    avatar.textContent   = initials;
    avatar.style.background = profile.avatar_color || 'linear-gradient(135deg,#3b82f6,#8b5cf6)';
  }
}

// ── Role restrictions (delegated to permissions.js) ───────────────────────────
function applyRoleRestrictions(role) {
  if (window.AMS?.permissions?.applyRoleRestrictions) {
    window.AMS.permissions.applyRoleRestrictions(role);
    return;
  }
  if (!['Super Admin','Admin'].includes(role)) {
    document.getElementById('n-settings')?.style.setProperty('display','none');
  }
  if (!['Super Admin','Admin','Manager'].includes(role)) {
    document.getElementById('n-audit')?.style.setProperty('display','none');
    document.querySelector('.topbar .btn-primary')?.style.setProperty('display','none');
  }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function doLogin(email, password) {
  const lockIcon = document.getElementById('lockIcon');
  if (lockIcon && typeof setLockIcon === 'function') setLockIcon('loader');

  console.log('[Auth] Attempting login for:', email);

  const { data, error } = await window.AMS.db.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password: password,
  });

  if (error) {
    console.error('[Auth] Login error:', error.message);
    if (lockIcon && typeof setLockIcon === 'function') setLockIcon('lock');
    resetHandle?.();
    if (error.message.toLowerCase().includes('invalid'))
      toast('error', 'Login Failed', 'Incorrect email or password.');
    else if (error.message.toLowerCase().includes('confirm'))
      toast('warning', 'Email Not Verified', 'Please confirm your email first.');
    else
      toast('error', 'Login Error', error.message);
    return false;
  }

  console.log('[Auth] Auth OK, loading profile…');

  const profile = await loadUserProfile(data.user);
  if (!profile) {
    // Last resort — use auth metadata directly so user can still get in
    const fallback = {
      id:         data.user.id,
      email:      data.user.email,
      full_name:  data.user.email.split('@')[0],
      role:       'Employee',
      status:     'active',
      avatar_color: 'linear-gradient(135deg,#3b82f6,#6366f1)',
    };
    currentUser = { ...data.user, ...fallback };
    updateSidebarUser(fallback);
    applyRoleRestrictions('Employee');
  } else {
    currentUser = { ...data.user, ...profile };
    updateSidebarUser(profile);
    applyRoleRestrictions(profile.role);
  }

  // Log (non-blocking)
  logAuditEvent('LOGIN', 'auth', null, `Login: ${currentUser.email}`).catch(() => {});

  // Hide login screen
  const ls = document.getElementById('loginScreen');
  if (ls) { ls.classList.add('hide'); setTimeout(() => ls.style.display = 'none', 500); }

  const firstName = (currentUser.full_name || 'User').split(' ')[0];
  toast('success', `Welcome back, ${firstName}!`, `Signed in as ${currentUser.role || 'Employee'}`);

  if (typeof loadDashboard === 'function') loadDashboard();
  // Load pending badge count for manager
  setTimeout(() => window.AMS.permissions?.loadPendingCount?.(), 500);
  return true;
}

// ── SIGN UP ───────────────────────────────────────────────────────────────────
async function doSignup({ fullName, email, password, departmentId }) {
  const lockIcon = document.getElementById('signupLockIcon');
  if (lockIcon && typeof setLockIcon === 'function') setLockIcon('loader', 'signupLockIcon');

  const trimmedEmail = email.trim().toLowerCase();
  console.log('[Auth] Attempting signup for:', trimmedEmail);

  const { data, error } = await window.AMS.db.auth.signUp({
    email:    trimmedEmail,
    password: password,
    options: {
      data: {
        full_name: fullName.trim(),
        role:      'Employee',
      },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) {
    console.error('[Auth] Signup error:', error.message);
    if (lockIcon && typeof setLockIcon === 'function') setLockIcon('mail', 'signupLockIcon');
    if (error.message.toLowerCase().includes('already registered'))
      toast('error', 'Account Exists', 'This email is already registered. Try signing in.');
    else if (error.message.toLowerCase().includes('rate limit'))
      toast('warning', 'Rate Limited', 'Too many signup attempts. Please wait a few minutes and try again.');
    else if (error.message.toLowerCase().includes('password'))
      toast('error', 'Weak Password', 'Password must be at least 8 characters with letters and numbers.');
    else
      toast('error', 'Signup Failed', error.message);
    return false;
  }

  const userId = data.user?.id;
  if (!userId) {
    if (lockIcon && typeof setLockIcon === 'function') setLockIcon('mail', 'signupLockIcon');
    toast('error', 'Signup Error', 'Could not create your account. Please try again.');
    return false;
  }

  // Enrich profile with department if provided (only works when session is active)
  if (departmentId && data.session) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(departmentId);
    const update = isUuid
      ? { department_id: departmentId }
      : null; // static name fallback — resolved after login via departments table
    if (update) {
      await window.AMS.db.from('profiles').update(update).eq('id', userId);
    }
  }

  // Email confirmation required — no active session yet
  if (!data.session) {
    if (lockIcon && typeof setLockIcon === 'function') setLockIcon('mail', 'signupLockIcon');
    toast('success', 'Check Your Email', `We sent a confirmation link to ${trimmedEmail}. Click it to activate your account, then sign in.`);
    if (typeof showLogin === 'function') showLogin();
    return true;
  }

  const profile = await loadUserProfile(data.user);
  if (!profile) {
    const fallback = {
      id:           userId,
      email:        trimmedEmail,
      full_name:    fullName.trim(),
      role:         'Employee',
      status:       'active',
      avatar_color: 'linear-gradient(135deg,#3b82f6,#6366f1)',
    };
    currentUser = { ...data.user, ...fallback };
    updateSidebarUser(fallback);
    applyRoleRestrictions('Employee');
  } else {
    currentUser = { ...data.user, ...profile };
    updateSidebarUser(profile);
    applyRoleRestrictions(profile.role);
  }

  logAuditEvent('CREATE', 'auth', userId, `Signup: ${trimmedEmail}`).catch(() => {});

  const ls = document.getElementById('loginScreen');
  if (ls) { ls.classList.add('hide'); setTimeout(() => ls.style.display = 'none', 500); }

  const firstName = fullName.trim().split(' ')[0];
  toast('success', `Welcome, ${firstName}!`, 'Your account has been created successfully.');

  if (typeof loadDashboard === 'function') loadDashboard();
  return true;
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
async function doLogout() {
  logAuditEvent('LOGOUT', 'auth', null, `Logout: ${currentUser?.email}`).catch(() => {});
  await window.AMS.db.auth.signOut();
  currentUser = null;
  const ls = document.getElementById('loginScreen');
  if (ls) { ls.style.cssText = 'display:flex;opacity:1;transform:none'; ls.classList.remove('hide'); }
  if (typeof showPicker === 'function') showPicker();
  if (typeof nav === 'function') nav('dashboard');
  toast('info', 'Signed Out', 'Logged out securely.');
}

// ── PASSWORD RESET ────────────────────────────────────────────────────────────
async function sendPasswordReset(email) {
  if (!email?.includes('@')) { toast('error', 'Invalid Email', 'Enter a valid email.'); return; }
  const { error } = await window.AMS.db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin + '/index.html',
  });
  if (error) toast('error', 'Reset Failed', error.message);
  else       toast('success', 'Email Sent', `Reset link sent to ${email}`);
}

// ── SESSION RESTORE ───────────────────────────────────────────────────────────
async function restoreSession() {
  const { data: { session } } = await window.AMS.db.auth.getSession();
  if (!session) { console.log('[Auth] No session'); return; }

  console.log('[Auth] Restoring session for:', session.user.email);
  let profile = await loadUserProfile(session.user);
  if (!profile) {
    profile = await createFallbackProfile(session.user);
    if (!profile) {
      console.warn('[Auth] No profile found — signing out');
      await window.AMS.db.auth.signOut();
      return;
    }
  }

  currentUser = { ...session.user, ...profile };
  updateSidebarUser(profile);
  applyRoleRestrictions(profile.role);

  const ls = document.getElementById('loginScreen');
  if (ls) ls.style.display = 'none';

  console.log(`[Auth] ✅ Restored: ${profile.full_name} (${profile.role})`);
  if (typeof loadDashboard === 'function') loadDashboard();
  setTimeout(() => window.AMS.permissions?.loadPendingCount?.(), 500);
}

// ── AUTH STATE LISTENER ───────────────────────────────────────────────────────
window.AMS.db.auth.onAuthStateChange((event, session) => {
  console.log('[Auth] Event:', event);
  if (event === 'SIGNED_OUT') currentUser = null;
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
async function logAuditEvent(action, entity, entityId, description) {
  try {
    await window.AMS.db.from('audit_logs').insert({
      user_id:    currentUser?.id || null,
      action,
      entity,
      entity_id:  entityId,
      description,
      created_at: new Date().toISOString(),
    });
  } catch (e) { /* audit failure must never break main flow */ }
}

// ── Expose ────────────────────────────────────────────────────────────────────
window.AMS.auth = { doLogin, doSignup, doLogout, sendPasswordReset, restoreSession,
  getCurrentUser, isSuperAdmin, isAdmin, isManager, logAuditEvent };
window.doLogout = doLogout;
