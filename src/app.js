/* ── narrAItor — Main app: router, nav, global state ──────────────────────── */

const App = (() => {
  const state = {
    page: 'books',
    params: {},
    pythonStatus: 'connecting',
    voices: null,
  };

  const PAGES = {
    settings: typeof SettingsPage !== 'undefined' ? SettingsPage : null,
    casting:  typeof CastingPage  !== 'undefined' ? CastingPage  : null,
    books:    typeof BooksPage    !== 'undefined' ? BooksPage    : null,
    booth:    typeof BoothPage    !== 'undefined' ? BoothPage    : null,
  };

  let currentPageModule = null;

  // ── Navigation ─────────────────────────────────────────────────────────────

  function navigate(page, params = {}) {
    if (page === state.page && JSON.stringify(params) === JSON.stringify(state.params) && page !== 'booth') return;

    // Unmount current page
    currentPageModule?.unmount?.();

    state.page = page;
    state.params = params;

    // Update nav active states
    document.querySelectorAll('.nav-link').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Show/hide nav booth breadcrumb
    updateBoothBreadcrumb(page, params);

    // Render new page
    const mod = PAGES[page];
    if (!mod) { document.getElementById('page-content').innerHTML = `<div class="p-12 text-muted">Page not found: ${page}</div>`; return; }

    const container = document.getElementById('page-content');
    container.innerHTML = `<div class="h-full page-enter" id="page-root">${mod.render(params)}</div>`;
    currentPageModule = mod;
    mod.mount?.(params);
  }

  function updateBoothBreadcrumb(page, params) {
    let crumb = document.getElementById('booth-breadcrumb');
    if (page === 'booth' && params.projectTitle) {
      if (!crumb) {
        crumb = document.createElement('div');
        crumb.id = 'booth-breadcrumb';
        crumb.className = 'flex items-center gap-1 text-xs font-label text-muted';
        document.getElementById('top-nav').insertBefore(crumb, document.getElementById('top-nav').children[1]);
      }
      crumb.innerHTML = `
        <button class="hover:text-on-surface transition-colors" onclick="App.navigate('books')">Library</button>
        <span class="material-symbols-outlined icon-sm" style="font-size:14px">chevron_right</span>
        <span class="text-on-surface font-medium">${escHtml(params.projectTitle)}</span>
      `;
    } else if (crumb) {
      crumb.remove();
    }
  }

  // ── Python status ──────────────────────────────────────────────────────────

  function setPythonStatus(status) {
    state.pythonStatus = status;
    const dot = document.getElementById('server-status-dot');
    if (!dot) return;

    const classes = { connecting: 'dot-connecting', starting: 'dot-starting', ready: 'dot-ready', error: 'dot-error', stopped: 'dot-stopped' };
    const titles  = { connecting: 'Connecting to AI engine…', starting: 'AI engine starting…', ready: 'AI engine ready', error: 'AI engine error — check Settings', stopped: 'AI engine stopped — check Settings' };

    dot.className = `server-dot ${classes[status] || 'dot-stopped'}`;
    dot.title = titles[status] || status;
  }

  // ── Voice cache (for booth voice selector) ─────────────────────────────────

  async function loadVoices(force = false) {
    if (state.voices && !force) return state.voices;
    try {
      const res = await API.voices.list();
      state.voices = res.voices || [];
    } catch {
      state.voices = [];
    }
    return state.voices;
  }

  function getVoices() { return state.voices || []; }
  function invalidateVoices() { state.voices = null; }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    // Listen for Python status updates from main process
    window.electronAPI.onPythonStatus((status) => {
      setPythonStatus(status.status);
      if (status.status === 'error') {
        Toast.error('AI engine failed to start. Check Settings to configure your Python environment.');
      }
    });

    // Initial server state
    window.electronAPI.getServerReady().then(ready => {
      setPythonStatus(ready ? 'ready' : 'starting');
    });

    // Navigate to default page
    navigate('books');

    // Preload voices in background
    loadVoices();
  }

  // Public API
  return { navigate, setPythonStatus, loadVoices, getVoices, invalidateVoices, state };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
