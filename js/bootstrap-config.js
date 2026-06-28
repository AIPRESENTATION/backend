/**
 * Fix invalid Netlify env (e.g. literal "SUPABASE_ANON_KEY") by loading from Render API.
 * Runs synchronously before supabase.js initializes.
 */
(function fixConfig() {
  const env = window.AMS_ENV || {};
  const key = env.supabaseAnonKey || '';
  const invalid =
    !key ||
    key === 'SUPABASE_ANON_KEY' ||
    key === 'your-anon-key' ||
    (key.startsWith('SUPABASE_') && key.length < 40);

  const api = (env.apiUrl || 'https://ams-pro-api.onrender.com').replace(/\/$/, '');

  if (invalid && api) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', api + '/api/config', false);
      xhr.send(null);
      if (xhr.status === 200) {
        const cfg = JSON.parse(xhr.responseText);
        window.AMS_ENV = {
          supabaseUrl: cfg.supabaseUrl || env.supabaseUrl,
          supabaseAnonKey: cfg.supabaseAnonKey,
          apiUrl: api,
        };
        console.log('[AMS] Config loaded from Render API');
        return;
      }
    } catch (e) {
      console.warn('[AMS] Could not fetch config from API:', e.message);
    }
  }

  if (invalid) {
    window.AMS_ENV = {
      supabaseUrl: env.supabaseUrl || 'https://nwdrnhjlvashisxgputy.supabase.co',
      supabaseAnonKey: 'sb_publishable_JrqbhsjL5-pwu5PM6yCXhQ_a2rww6Jf',
      apiUrl: api,
    };
    console.warn('[AMS] Using built-in Supabase config fallback');
  }
})();
