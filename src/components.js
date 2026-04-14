/* ── Shared UI components ────────────────────────────────────────────────── */

// ── Toast ─────────────────────────────────────────────────────────────────────

const Toast = (() => {
  const container = () => document.getElementById('toast-container');

  function show(message, type = 'info', duration = 4000) {
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="material-symbols-outlined toast-icon icon-sm icon-fill">${icons[type] || 'info'}</span>
      <span>${message}</span>
    `;
    container().appendChild(el);

    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 260);
    }, duration);

    return el;
  }

  return {
    success: (msg, d) => show(msg, 'success', d),
    error:   (msg, d) => show(msg, 'error', d || 6000),
    info:    (msg, d) => show(msg, 'info', d),
  };
})();

// ── Modal ─────────────────────────────────────────────────────────────────────

const Modal = (() => {
  let closeCallback = null;

  function show({ title, body, actions, width = 'max-w-lg', onClose }) {
    closeCallback = onClose || null;

    const overlay = document.getElementById('modal-overlay');
    const box = document.getElementById('modal-box');

    box.className = `bg-surface-container-lowest rounded-2xl shadow-2xl w-full ${width} pointer-events-auto overflow-hidden`;

    const actionsHtml = (actions || []).map(a => {
      const cls = a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost';
      return `<button class="${cls}" data-action="${a.id}" ${a.disabled ? 'disabled' : ''}>${a.label}</button>`;
    }).join('');

    box.innerHTML = `
      <div class="flex items-center justify-between px-6 pt-6 pb-0">
        <h2 class="font-headline font-semibold text-base text-on-surface">${title}</h2>
        <button class="btn-icon" id="modal-close-btn">
          <span class="material-symbols-outlined icon-sm">close</span>
        </button>
      </div>
      <div class="px-6 pt-4 pb-2 modal-body">${body}</div>
      ${actionsHtml ? `<div class="flex items-center justify-end gap-2 px-6 py-4">${actionsHtml}</div>` : ''}
    `;

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    requestAnimationFrame(() => box.style.animation = 'page-in 250ms cubic-bezier(0.2,0.8,0.2,1) both');

    // Close handlers
    document.getElementById('modal-close-btn').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    // Action button handlers
    (actions || []).forEach(a => {
      const btn = box.querySelector(`[data-action="${a.id}"]`);
      if (btn) btn.onclick = () => { if (!btn.disabled) a.onClick?.(); };
    });
  }

  function close() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    closeCallback?.();
    closeCallback = null;
  }

  function setActionDisabled(id, disabled) {
    const btn = document.querySelector(`[data-action="${id}"]`);
    if (btn) btn.disabled = disabled;
  }

  function setActionLabel(id, label) {
    const btn = document.querySelector(`[data-action="${id}"]`);
    if (btn) btn.textContent = label;
  }

  return { show, close, setActionDisabled, setActionLabel };
})();

// ── Audio Player ──────────────────────────────────────────────────────────────

const AudioPlayer = (() => {
  let currentAudio = null;
  let currentPlayBtn = null;

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /** Render an audio player into `containerId`. Returns a { load(url), destroy() } object. */
  function create(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const audio = new Audio();
    let rafId;

    container.innerHTML = `
      <div class="audio-player">
        <button class="btn-icon play-btn" id="${containerId}-play">
          <span class="material-symbols-outlined">play_arrow</span>
        </button>
        <span class="font-label text-xs text-muted time-display" id="${containerId}-time">0:00</span>
        <input type="range" class="audio-scrubber" id="${containerId}-scrubber" min="0" max="100" value="0" step="0.1"/>
        <span class="font-label text-xs text-muted dur-display" id="${containerId}-dur">0:00</span>
      </div>
    `;

    const playBtn  = container.querySelector('.play-btn span');
    const scrubber = document.getElementById(`${containerId}-scrubber`);
    const timeDisp = document.getElementById(`${containerId}-time`);
    const durDisp  = document.getElementById(`${containerId}-dur`);

    function updateScrubber() {
      if (!audio.duration) return;
      scrubber.value = (audio.currentTime / audio.duration) * 100;
      timeDisp.textContent = formatTime(audio.currentTime);
      rafId = requestAnimationFrame(updateScrubber);
    }

    document.getElementById(`${containerId}-play`).onclick = () => {
      if (audio.paused) {
        if (currentAudio && currentAudio !== audio) {
          currentAudio.pause();
          currentPlayBtn && (currentPlayBtn.textContent = 'play_arrow');
        }
        audio.play();
        playBtn.textContent = 'pause';
        currentAudio = audio;
        currentPlayBtn = playBtn;
        rafId = requestAnimationFrame(updateScrubber);
      } else {
        audio.pause();
        playBtn.textContent = 'play_arrow';
        cancelAnimationFrame(rafId);
      }
    };

    audio.onended = () => {
      playBtn.textContent = 'play_arrow';
      scrubber.value = 0;
      timeDisp.textContent = '0:00';
      cancelAnimationFrame(rafId);
    };

    audio.onloadedmetadata = () => {
      durDisp.textContent = formatTime(audio.duration);
      scrubber.max = 100;
    };

    scrubber.oninput = () => {
      audio.currentTime = (scrubber.value / 100) * audio.duration;
    };

    return {
      load(url) {
        audio.pause();
        playBtn.textContent = 'play_arrow';
        cancelAnimationFrame(rafId);
        audio.src = url;
        audio.load();
      },
      destroy() {
        audio.pause();
        cancelAnimationFrame(rafId);
        audio.src = '';
        if (currentAudio === audio) currentAudio = null;
      },
    };
  }

  return { create };
})();

// ── Confirm dialog helper ─────────────────────────────────────────────────────

function confirmDialog(title, message) {
  return new Promise((resolve) => {
    Modal.show({
      title,
      body: `<p class="text-sm text-on-surface-variant leading-relaxed">${message}</p>`,
      actions: [
        { id: 'cancel', label: 'Cancel', onClick: () => { Modal.close(); resolve(false); } },
        { id: 'confirm', label: 'Delete', danger: true, onClick: () => { Modal.close(); resolve(true); } },
      ],
    });
  });
}

// ── Spinner helper ────────────────────────────────────────────────────────────

function spinnerHTML(size = 20, color = '#4d626c') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite;flex-shrink:0">
    <circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="40" stroke-dashoffset="15"/>
  </svg>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
}

// ── Voice badge helper ────────────────────────────────────────────────────────

function voiceBadge(voice) {
  if (!voice) return '<span class="badge badge-neutral">No voice</span>';
  const typeLabels = { preset: 'Preset', designed: 'Designed', cloned: 'Cloned' };
  return `<span class="badge badge-primary">${escHtml(voice.name)}</span>`;
}

// ── Escape HTML ───────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Debounce ──────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── Format seconds ────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
