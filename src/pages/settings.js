/* ── Settings Page ────────────────────────────────────────────────────────── */

const SettingsPage = (() => {

  const MODELS = [
    {
      id: 'Qwen3-TTS-Tokenizer-12Hz',
      repoId: 'Qwen/Qwen3-TTS-Tokenizer-12Hz',
      name: 'Qwen3 TTS Tokenizer',
      description: 'Required for all synthesis. Encodes and decodes audio codes.',
      sizeLabel: '~500 MB',
      required: true,
      type: 'tokenizer',
    },
    {
      id: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
      repoId: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice',
      name: 'Custom Voice 1.7B',
      description: '9 premium built-in voices with instruction-based style control. Best quality.',
      sizeLabel: '~3.5 GB',
      required: false,
      type: 'custom',
    },
    {
      id: 'Qwen3-TTS-12Hz-0.6B-CustomVoice',
      repoId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
      name: 'Custom Voice 0.6B',
      description: 'Same 9 voices, smaller and faster. Great for lower-end hardware.',
      sizeLabel: '~1.2 GB',
      required: false,
      type: 'custom',
    },
    {
      id: 'Qwen3-TTS-12Hz-1.7B-VoiceDesign',
      repoId: 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',
      name: 'Voice Designer 1.7B',
      description: 'Create voices from natural language descriptions (e.g. "warm elderly British male").',
      sizeLabel: '~3.5 GB',
      required: false,
      type: 'design',
    },
    {
      id: 'Qwen3-TTS-12Hz-1.7B-Base',
      repoId: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base',
      name: 'Voice Clone 1.7B',
      description: 'Clone any voice from a 3-second audio reference. Best cloning quality.',
      sizeLabel: '~3.5 GB',
      required: false,
      type: 'clone',
    },
    {
      id: 'Qwen3-TTS-12Hz-0.6B-Base',
      repoId: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
      name: 'Voice Clone 0.6B',
      description: 'Lighter voice cloning model, faster on limited hardware.',
      sizeLabel: '~1.2 GB',
      required: false,
      type: 'clone',
    },
  ];

  let modelStatuses = {}; // { modelId: { downloaded, size_bytes } }
  let activeDownloads = {}; // { modelId: EventSource }
  let logBuffer = [];
  let logVisible = false;
  let removePythonLogListener = null;

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    return `
      <div class="h-full overflow-y-auto bg-background">
        <div class="max-w-3xl mx-auto px-8 py-10">

          <!-- Header -->
          <div class="mb-10">
            <h1 class="font-headline text-3xl font-bold text-on-surface mb-1">Settings</h1>
            <p class="text-sm text-muted font-label">Configure your AI engine and download models.</p>
          </div>

          <!-- Python Environment -->
          <section class="mb-10">
            <h2 class="font-headline text-lg font-semibold mb-1">Python Environment</h2>
            <p class="text-sm text-muted mb-5">narrAItor uses a Python backend to run the AI engine. Point it to your Python executable with qwen-tts installed.</p>

            <div class="card p-6">
              <div class="flex gap-4 items-end">
                <div class="flex-1">
                  <label class="field-label">Python executable path</label>
                  <input type="text" id="python-path-input" class="field-input" placeholder="python  (or full path, e.g. C:\\conda\\envs\\qwen\\python.exe)" />
                </div>
                <button class="btn-ghost" id="browse-python-btn">
                  <span class="material-symbols-outlined icon-sm">folder_open</span>Browse
                </button>
              </div>

              <div class="flex items-center gap-3 mt-5">
                <button class="btn-primary" id="apply-python-btn">
                  <span class="material-symbols-outlined icon-sm">restart_alt</span>Apply &amp; Restart Engine
                </button>
                <button class="btn-ghost" id="test-python-btn">Test path</button>
                <div id="python-test-result" class="text-xs font-label text-muted"></div>
              </div>

              <div class="mt-4 pt-4" style="border-top:1px solid rgba(175,179,176,0.2)">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-label text-muted">Engine log</span>
                  <button class="btn-ghost text-xs" id="toggle-log-btn">Show</button>
                </div>
                <pre id="python-log-box" class="hidden mt-2 text-xs font-mono text-on-surface-variant bg-surface-container-low rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap"></pre>
              </div>

              <div class="mt-4">
                <p class="text-xs font-label text-muted leading-relaxed">
                  Need help? Run in a terminal: <code class="bg-surface-container-low px-1 rounded text-on-surface">pip install -e ./Reference_Qwen3-TTS</code> then
                  <code class="bg-surface-container-low px-1 rounded text-on-surface">pip install -r requirements.txt</code>
                </p>
              </div>
            </div>
          </section>

          <!-- Models -->
          <section class="mb-10">
            <div class="flex items-center justify-between mb-1">
              <h2 class="font-headline text-lg font-semibold">AI Models</h2>
              <div class="flex items-center gap-2">
                <label class="text-xs font-label text-muted">Source:</label>
                <select id="download-source" class="field-select text-xs" style="min-width:120px">
                  <option value="huggingface">Hugging Face</option>
                  <option value="modelscope">ModelScope (China)</option>
                </select>
              </div>
            </div>
            <p class="text-sm text-muted mb-5">Download the models you need. The Tokenizer is required. For each voice type, you only need one size.</p>

            <div id="models-list" class="flex flex-col gap-3">
              ${MODELS.map(m => renderModelCard(m, null)).join('')}
            </div>
          </section>

          <!-- Models directory -->
          <section class="mb-10">
            <h2 class="font-headline text-lg font-semibold mb-1">Storage</h2>
            <div class="card p-6">
              <label class="field-label">Models directory</label>
              <div class="flex gap-3 items-end">
                <input type="text" id="models-dir-input" class="field-input flex-1" placeholder="Default: app data folder"/>
                <button class="btn-ghost" id="browse-models-dir-btn">
                  <span class="material-symbols-outlined icon-sm">folder_open</span>Browse
                </button>
              </div>
              <div class="flex gap-2 mt-4">
                <button class="btn-ghost" id="open-data-dir-btn">
                  <span class="material-symbols-outlined icon-sm">open_in_new</span>Open data folder
                </button>
              </div>
            </div>
          </section>

          <!-- App Info -->
          <section class="pt-6 border-t border-outline-variant/20">
            <p class="text-xs text-subtle font-label">narrAItor <span id="app-version">v1.0.0</span></p>
          </section>

        </div>
      </div>
    `;
  }

  function renderModelCard(model, status) {
    const dl = activeDownloads[model.id];
    const downloaded = status?.downloaded;
    const pct = dl?.percent ?? 0;

    let statusBadge = '';
    let actionBtn = '';

    if (dl) {
      statusBadge = `<span class="badge badge-secondary">Downloading ${pct}%</span>`;
      actionBtn = `<button class="btn-ghost btn-danger" onclick="SettingsPage.cancelDownload('${model.id}')">
        <span class="material-symbols-outlined icon-sm">stop</span>Cancel
      </button>`;
    } else if (downloaded) {
      statusBadge = `<span class="badge badge-primary">Downloaded</span>`;
      actionBtn = `<button class="btn-ghost" onclick="SettingsPage.deleteModel('${model.id}')">
        <span class="material-symbols-outlined icon-sm">delete</span>Remove
      </button>`;
    } else {
      statusBadge = model.required
        ? `<span class="badge badge-neutral" style="background:#ffe4b5;color:#695e4c">Required</span>`
        : `<span class="badge badge-neutral">Not downloaded</span>`;
      actionBtn = `<button class="btn-secondary" onclick="SettingsPage.downloadModel('${model.id}')">
        <span class="material-symbols-outlined icon-sm">download</span>Download
      </button>`;
    }

    const typeIcons = { tokenizer: 'token', custom: 'record_voice_over', design: 'auto_awesome', clone: 'content_copy' };

    return `
      <div class="card p-5" id="model-card-${model.id}">
        <div class="flex items-start gap-4">
          <div class="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0 mt-0.5">
            <span class="material-symbols-outlined icon-sm text-primary">${typeIcons[model.type] || 'smart_toy'}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-sm text-on-surface">${model.name}</span>
              ${statusBadge}
            </div>
            <p class="text-xs text-muted mt-0.5 leading-relaxed">${model.description}</p>
            <p class="text-xs font-label text-subtle mt-1">${model.sizeLabel}</p>
            ${dl ? `
              <div class="mt-2">
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <p class="text-xs font-label text-muted mt-1" id="model-dl-msg-${model.id}">${dl.message || 'Downloading…'}</p>
              </div>` : ''}
          </div>
          <div class="flex-shrink-0 mt-0.5">${actionBtn}</div>
        </div>
      </div>
    `;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  async function mount() {
    // Load app version
    try {
      const version = await window.electronAPI.getAppVersion();
      const versionEl = document.getElementById('app-version');
      if (versionEl) versionEl.textContent = `v${version}`;
    } catch {}

    // Load saved config
    const cfg = await window.electronAPI.configGet();
    if (cfg.pythonPath) document.getElementById('python-path-input').value = cfg.pythonPath;
    if (cfg.modelsDir) document.getElementById('models-dir-input').value = cfg.modelsDir;

    // Browse python
    document.getElementById('browse-python-btn').onclick = async () => {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Python Executable',
        filters: [{ name: 'Executable', extensions: ['exe', '*'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths[0]) {
        document.getElementById('python-path-input').value = result.filePaths[0];
      }
    };

    // Browse models dir
    document.getElementById('browse-models-dir-btn').onclick = async () => {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Models Directory',
        properties: ['openDirectory'],
      });
      if (!result.canceled && result.filePaths[0]) {
        document.getElementById('models-dir-input').value = result.filePaths[0];
        await window.electronAPI.configSet('modelsDir', result.filePaths[0]);
        Toast.info('Models directory updated.');
      }
    };

    // Open data folder
    document.getElementById('open-data-dir-btn').onclick = async () => {
      const dir = await window.electronAPI.getDataDir();
      window.electronAPI.showItemInFolder(dir);
    };

    // Test python
    document.getElementById('test-python-btn').onclick = async () => {
      const path = document.getElementById('python-path-input').value.trim() || 'python';
      const resultEl = document.getElementById('python-test-result');
      resultEl.textContent = 'Testing…';
      const res = await window.electronAPI.testPython(path);
      resultEl.textContent = res.ok ? `✓ ${res.output}` : `✗ ${res.output}`;
      resultEl.style.color = res.ok ? '#4d626c' : '#a83836';
    };

    // Apply & restart
    document.getElementById('apply-python-btn').onclick = async () => {
      const path = document.getElementById('python-path-input').value.trim() || 'python';
      await window.electronAPI.configSet('pythonPath', path);
      App.setPythonStatus('starting');
      try {
        await window.electronAPI.restartPython(path);
        Toast.success('AI engine restarted successfully.');
        refreshModelStatuses();
      } catch (err) {
        Toast.error('Failed to start engine: ' + err.message);
      }
    };

    // Toggle log
    document.getElementById('toggle-log-btn').onclick = () => {
      logVisible = !logVisible;
      const box = document.getElementById('python-log-box');
      const btn = document.getElementById('toggle-log-btn');
      box.classList.toggle('hidden', !logVisible);
      btn.textContent = logVisible ? 'Hide' : 'Show';
      if (logVisible) { box.textContent = logBuffer.join(''); box.scrollTop = box.scrollHeight; }
    };

    // Listen to python log
    removePythonLogListener = window.electronAPI.onPythonLog((text) => {
      logBuffer.push(text);
      if (logBuffer.length > 500) logBuffer.shift();
      if (logVisible) {
        const box = document.getElementById('python-log-box');
        if (box) { box.textContent = logBuffer.join(''); box.scrollTop = box.scrollHeight; }
      }
    });

    // Load model statuses
    refreshModelStatuses();
  }

  async function refreshModelStatuses() {
    try {
      const res = await API.models.list();
      modelStatuses = {};
      (res.models || []).forEach(m => { modelStatuses[m.id] = m; });
      rerenderModels();
    } catch {
      // Server not ready yet — try again
      setTimeout(refreshModelStatuses, 2000);
    }
  }

  function rerenderModels() {
    const container = document.getElementById('models-list');
    if (!container) return;
    container.innerHTML = MODELS.map(m => renderModelCard(m, modelStatuses[m.id])).join('');
  }

  // ── Download ───────────────────────────────────────────────────────────────

  function downloadModel(modelId) {
    if (activeDownloads[modelId]) return;
    const source = document.getElementById('download-source')?.value || 'huggingface';

    activeDownloads[modelId] = { percent: 0, message: 'Starting…' };
    rerenderModels();

    const es = API.models.downloadStream(modelId, source);
    activeDownloads[modelId].source = es;

    API.streamEvents(es, {
      onProgress: (data) => {
        if (!activeDownloads[modelId]) return;
        activeDownloads[modelId].percent = data.percent || 0;
        activeDownloads[modelId].message = data.message || `Downloading… ${data.percent || 0}%`;

        // Patch just the progress bar without full re-render
        const card = document.getElementById(`model-card-${modelId}`);
        if (card) {
          const fill = card.querySelector('.progress-fill');
          const msg  = card.querySelector(`#model-dl-msg-${modelId}`);
          if (fill) fill.style.width = `${data.percent || 0}%`;
          if (msg)  msg.textContent = activeDownloads[modelId].message;
        }
      },
      onDone: () => {
        delete activeDownloads[modelId];
        modelStatuses[modelId] = { id: modelId, downloaded: true };
        rerenderModels();
        Toast.success(`${modelId} downloaded successfully.`);
      },
      onError: (err) => {
        delete activeDownloads[modelId];
        rerenderModels();
        Toast.error(`Download failed: ${err.message}`);
      },
    });
  }

  function cancelDownload(modelId) {
    const dl = activeDownloads[modelId];
    if (dl?.source) dl.source.close();
    delete activeDownloads[modelId];
    rerenderModels();
  }

  async function deleteModel(modelId) {
    const ok = await confirmDialog('Remove Model', `This will delete the downloaded files for <strong>${modelId}</strong>. You can re-download it anytime.`);
    if (!ok) return;
    try {
      await API.models.delete(modelId);
      delete modelStatuses[modelId];
      rerenderModels();
      Toast.success('Model removed.');
    } catch (err) {
      Toast.error('Failed to remove model: ' + err.message);
    }
  }

  // ── Unmount ────────────────────────────────────────────────────────────────

  function unmount() {
    removePythonLogListener?.();
    removePythonLogListener = null;
    // Close any active download streams
    Object.values(activeDownloads).forEach(dl => { try { dl.source?.close(); } catch {} });
  }

  return { render, mount, unmount, downloadModel, cancelDownload, deleteModel };
})();
