/* ── narrAItor — Main app: router, nav, global state ──────────────────────── */

const App = (() => {
  const state = {
    page: null,
    params: {},
    pythonStatus: 'connecting',
    voices: null,
  };

  const PAGES = {
    settings: typeof SettingsPage !== 'undefined' ? SettingsPage : null,
    casting: typeof CastingPage !== 'undefined' ? CastingPage : null,
    books: typeof BooksPage !== 'undefined' ? BooksPage : null,
    booth: typeof BoothPage !== 'undefined' ? BoothPage : null,
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

    // If navigating to books and server is already ready, trigger a refresh
    // This handles the case where the server becomes ready before navigate() is called
    if (page === 'books' && state.pythonStatus === 'ready') {
      setTimeout(() => BooksPage.refresh?.(), 100);
    }
  }

  function updateBoothBreadcrumb(page, params) {
    let crumb = document.getElementById('booth-breadcrumb');
    if (page === 'booth' && params.projectTitle) {
      if (!crumb) {
        crumb = document.createElement('div');
        crumb.id = 'booth-breadcrumb';
        crumb.className = 'flex items-center gap-1 text-xs font-label text-muted ml-4';
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
    // Only update if status actually changed to avoid unnecessary DOM updates
    if (state.pythonStatus === status) return;

    state.pythonStatus = status;
    const dot = document.getElementById('server-status-dot');
    if (!dot) return;

    const classes = { connecting: 'dot-connecting', starting: 'dot-starting', ready: 'dot-ready', error: 'dot-error', stopped: 'dot-stopped' };
    const titles = { connecting: 'Connecting to AI engine…', starting: 'AI engine starting…', ready: 'AI engine ready', error: 'AI engine error — check Settings', stopped: 'AI engine stopped — check Settings' };

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
    // Listen for Python status events pushed from main process
    window.electronAPI.onPythonStatus((status) => {
      setPythonStatus(status.status);
      // When the server comes up, reload library data if it's currently showing
      if (status.status === 'ready' && state.page === 'books') {
        BooksPage.refresh?.();
      }
      if (status.status === 'error') {
        Toast.error('AI engine failed to start. Check Settings to configure your Python environment.');
      }
    });

    // Polling fallback — handles all event-timing edge cases.
    // Immediately checks the actual server state and retries every 2 s until ready.
    let pollAttemptsInStarting = 0;
    (function pollStatus() {
      window.electronAPI.getServerReady().then(ready => {
        if (ready) {
          pollAttemptsInStarting = 0;
          setPythonStatus('ready');
          if (state.page === 'books') BooksPage.refresh?.();
        } else {
          // Transition from 'connecting' to 'starting' on first non-ready poll
          if (state.pythonStatus === 'connecting') {
            pollAttemptsInStarting = 1;
            setPythonStatus('starting');
          } else {
            pollAttemptsInStarting++;
          }
          setTimeout(pollStatus, 2000);
        }
      }).catch(() => setTimeout(pollStatus, 3000));
    })();

    // On macOS with hiddenInset titlebar the traffic-light buttons (×−□)
    // occupy ~72–80 px from the left edge. Use process.platform (via preload)
    // for a reliable check, and shift nav content out of their way.
    if (window.electronAPI.platform === 'darwin') {
      const nav = document.getElementById('top-nav');

      async function updateNavPadding() {
        // Get the actual fullscreen state from Electron main process
        const isElectronFullscreen = await window.electronAPI.getWindowFullscreen();
        const isHtmlFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        const shouldRemovePadding = isElectronFullscreen || isHtmlFullscreen;
        const newPadding = shouldRemovePadding ? '0' : '88px';

        if (nav) {
          nav.style.paddingLeft = newPadding;
        }
      }

      if (nav) {
        updateNavPadding();

        // Listen for Electron window fullscreen changes
        window.electronAPI.onWindowFullscreenChanged((data) => {
          updateNavPadding();
        });

        // Listen for HTML5 fullscreen changes
        document.addEventListener('fullscreenchange', updateNavPadding);
        document.addEventListener('webkitfullscreenchange', updateNavPadding);
      }
    }

    // Navigate to default page
    navigate('books');

    // Preload voices in background
    loadVoices();
  }

  // Public API
  return { init, navigate, setPythonStatus, loadVoices, getVoices, invalidateVoices, state };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
