/* ── Casting Page — Voice Library ─────────────────────────────────────────── */

const CastingPage = (() => {

  const SPEAKERS = [
    { id: 'Vivian',   label: 'Vivian',    desc: 'Bright, slightly edgy young female',     lang: 'Chinese' },
    { id: 'Serena',   label: 'Serena',    desc: 'Warm, gentle young female',               lang: 'Chinese' },
    { id: 'Uncle_Fu', label: 'Uncle Fu',  desc: 'Seasoned male, low mellow timbre',        lang: 'Chinese' },
    { id: 'Dylan',    label: 'Dylan',     desc: 'Youthful Beijing male, clear natural',    lang: 'Chinese (Beijing)' },
    { id: 'Eric',     label: 'Eric',      desc: 'Lively Chengdu male, slightly husky',     lang: 'Chinese (Sichuan)' },
    { id: 'Ryan',     label: 'Ryan',      desc: 'Dynamic male, strong rhythmic drive',     lang: 'English' },
    { id: 'Aiden',    label: 'Aiden',     desc: 'Sunny American male, clear midrange',     lang: 'English' },
    { id: 'Ono_Anna', label: 'Ono Anna',  desc: 'Playful Japanese female, light nimble',   lang: 'Japanese' },
    { id: 'Sohee',    label: 'Sohee',     desc: 'Warm Korean female, rich emotion',        lang: 'Korean' },
  ];

  const LANGUAGES = ['Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'];

  let voices = [];
  let drawerOpen = false;
  let editVoiceId = null;
  let previewPlayer = null;
  let draftPreviewPlayer = null;
  let activeTab = 'preset';

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    return `
      <div class="flex h-full overflow-hidden">

        <!-- Voice Library -->
        <div class="flex-1 overflow-y-auto bg-background" id="casting-main">
          <div class="max-w-4xl mx-auto px-8 py-10">
            <div class="flex items-end justify-between mb-8">
              <div>
                <h1 class="font-headline text-3xl font-bold text-on-surface mb-1">Voice Library</h1>
                <p class="text-sm text-muted">Create and manage voices for your audiobooks.</p>
              </div>
              <button class="btn-primary" id="new-voice-btn">
                <span class="material-symbols-outlined icon-sm">add</span>New Voice
              </button>
            </div>

            <div id="voices-grid" class="grid grid-cols-1 gap-3">
              <div class="flex items-center gap-3 py-12 justify-center text-muted">
                ${spinnerHTML(24)} Loading voices…
              </div>
            </div>
          </div>
        </div>

        <!-- Side Drawer -->
        <div id="voice-drawer" class="hidden flex-shrink-0 w-96 h-full bg-surface-container-lowest overflow-y-auto flex-col" style="border-left:1px solid rgba(175,179,176,0.2)">
          <!-- Drawer content injected by openDrawer() -->
        </div>
      </div>
    `;
  }

  // ── Voice Cards ────────────────────────────────────────────────────────────

  function renderVoiceCard(v) {
    const typeIcons  = { preset: 'record_voice_over', designed: 'auto_awesome', cloned: 'content_copy' };
    const typeLabels = { preset: 'Preset', designed: 'Designed', cloned: 'Cloned' };

    return `
      <div class="card p-5 flex items-center gap-4" id="voice-card-${v.id}">
        <div class="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary">${typeIcons[v.type] || 'mic'}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-sm text-on-surface">${escHtml(v.name)}</span>
            <span class="badge badge-neutral">${typeLabels[v.type] || v.type}</span>
            ${v.type === 'preset' ? `<span class="text-xs font-label text-muted">${v.speaker || ''}</span>` : ''}
          </div>
          <p class="text-xs text-muted mt-0.5 truncate">${escHtml(voiceSubtitle(v))}</p>
          <div id="voice-player-${v.id}"></div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button class="btn-icon" title="Preview voice" onclick="CastingPage.previewVoice('${v.id}')">
            <span class="material-symbols-outlined icon-sm">play_circle</span>
          </button>
          <button class="btn-icon" title="Edit voice" onclick="CastingPage.editVoice('${v.id}')">
            <span class="material-symbols-outlined icon-sm">edit</span>
          </button>
          <button class="btn-icon" title="Delete voice" onclick="CastingPage.deleteVoice('${v.id}')">
            <span class="material-symbols-outlined icon-sm" style="color:#a83836">delete</span>
          </button>
        </div>
      </div>
    `;
  }

  function voiceSubtitle(v) {
    if (v.type === 'preset')   return `${v.language || 'Auto'} · ${v.instruct || 'No style instruction'}`;
    if (v.type === 'designed') return v.description || '—';
    if (v.type === 'cloned')   return 'Cloned from audio reference';
    return '';
  }

  function renderEmptyState() {
    return `
      <div class="text-center py-20">
        <div class="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
          <span class="material-symbols-outlined icon-lg text-muted">mic_off</span>
        </div>
        <h3 class="font-headline font-semibold text-on-surface mb-1">No voices yet</h3>
        <p class="text-sm text-muted mb-6">Create a voice to start narrating your audiobooks.</p>
        <button class="btn-primary mx-auto" onclick="CastingPage.openDrawer()">
          <span class="material-symbols-outlined icon-sm">add</span>Create first voice
        </button>
      </div>
    `;
  }

  // ── Drawer ─────────────────────────────────────────────────────────────────

  function openDrawer(voiceId = null) {
    editVoiceId = voiceId;
    const voice = voiceId ? voices.find(v => v.id === voiceId) : null;
    const drawer = document.getElementById('voice-drawer');
    drawer.classList.remove('hidden');
    drawer.classList.add('flex');
    drawerOpen = true;
    activeTab = voice?.type || 'preset';
    renderDrawer(voice);
  }

  function closeDrawer() {
    const drawer = document.getElementById('voice-drawer');
    drawer.classList.add('hidden');
    drawer.classList.remove('flex');
    drawerOpen = false;
    editVoiceId = null;
    draftPreviewPlayer?.destroy();
    draftPreviewPlayer = null;
  }

  function renderDrawer(existingVoice) {
    const isEdit = !!existingVoice;
    const drawer = document.getElementById('voice-drawer');

    drawer.innerHTML = `
      <div class="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0" style="border-bottom:1px solid rgba(175,179,176,0.15)">
        <h2 class="font-headline font-semibold text-base">${isEdit ? 'Edit Voice' : 'New Voice'}</h2>
        <button class="btn-icon" onclick="CastingPage.closeDrawer()">
          <span class="material-symbols-outlined icon-sm">close</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-6 py-5">
        <!-- Name -->
        <div class="mb-5">
          <label class="field-label">Voice name</label>
          <input type="text" id="voice-name-input" class="field-input" placeholder="e.g. The Narrator" value="${escHtml(existingVoice?.name || '')}"/>
        </div>

        ${isEdit ? '' : `
        <!-- Type tabs -->
        <div class="mb-5">
          <label class="field-label">Voice type</label>
          <div class="tab-bar mt-1">
            <button class="tab-btn ${activeTab === 'preset'   ? 'active' : ''}" onclick="CastingPage.switchTab('preset')">Preset</button>
            <button class="tab-btn ${activeTab === 'designed' ? 'active' : ''}" onclick="CastingPage.switchTab('designed')">Design</button>
            <button class="tab-btn ${activeTab === 'cloned'   ? 'active' : ''}" onclick="CastingPage.switchTab('cloned')">Clone</button>
          </div>
        </div>
        `}

        <!-- Tab content -->
        <div id="voice-tab-content">
          ${renderTabContent(activeTab, existingVoice)}
        </div>

        <!-- Preview -->
        <div class="mt-6" style="border-top:1px solid rgba(175,179,176,0.18); padding-top:1.25rem">
          <label class="field-label">Preview text</label>
          <textarea id="preview-text-input" class="field-textarea text-sm" rows="2"
            placeholder="Enter text to preview…">The ancient forest stretched endlessly in every direction, its canopy thick with secrets.</textarea>

          <div class="flex gap-2 mt-3">
            <button class="btn-secondary flex-1" id="preview-draft-btn">
              <span class="material-symbols-outlined icon-sm">play_arrow</span>Preview voice
            </button>
          </div>
          <div id="draft-preview-loading" class="hidden flex items-center gap-2 mt-2 text-xs text-muted">
            ${spinnerHTML(16)} Generating preview…
          </div>
          <div id="draft-player-container" class="mt-2"></div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 px-6 py-4 flex gap-2 justify-end" style="border-top:1px solid rgba(175,179,176,0.15)">
        <button class="btn-ghost" onclick="CastingPage.closeDrawer()">Cancel</button>
        <button class="btn-primary" id="save-voice-btn">
          <span class="material-symbols-outlined icon-sm">save</span>${isEdit ? 'Save changes' : 'Add to library'}
        </button>
      </div>
    `;

    // Bind events
    bindDrawerEvents(existingVoice);
  }

  function renderTabContent(tab, voice) {
    if (tab === 'preset') {
      const sel = voice?.speaker || 'Ryan';
      const lang = voice?.language || 'Auto';
      return `
        <div class="mb-4">
          <label class="field-label">Speaker</label>
          <div class="grid grid-cols-1 gap-2 mt-1" id="speaker-grid">
            ${SPEAKERS.map(s => `
              <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${sel === s.id ? 'bg-primary-container' : 'hover:bg-surface-container-low'}" style="cursor:pointer">
                <input type="radio" name="speaker" value="${s.id}" class="hidden" ${sel === s.id ? 'checked' : ''}/>
                <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">${s.label[0]}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-on-surface">${s.label}</div>
                  <div class="text-xs text-muted truncate">${s.desc} · ${s.lang}</div>
                </div>
                ${sel === s.id ? '<span class="material-symbols-outlined icon-sm text-primary">check_circle</span>' : ''}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="mb-4">
          <label class="field-label">Language</label>
          <select id="voice-lang" class="field-select w-full">
            ${LANGUAGES.map(l => `<option ${lang === l ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label">Style instruction <span class="text-subtle font-label text-xs">(optional)</span></label>
          <input type="text" id="voice-instruct" class="field-input"
            placeholder='e.g. "Speak slowly and calmly"'
            value="${escHtml(voice?.instruct || '')}"/>
          <p class="text-xs text-subtle mt-1">Natural language style hint, e.g. "with slight excitement" or "in a hushed bedtime tone".</p>
        </div>
        <div class="mt-3">
          <label class="field-label">Model size</label>
          <select id="voice-model-size" class="field-select w-full">
            <option value="1.7B" ${(voice?.model_size || '1.7B') === '1.7B' ? 'selected' : ''}>1.7B — Best quality</option>
            <option value="0.6B" ${voice?.model_size === '0.6B' ? 'selected' : ''}>0.6B — Faster</option>
          </select>
        </div>
      `;
    }

    if (tab === 'designed') {
      return `
        <div class="mb-4">
          <label class="field-label">Voice description</label>
          <textarea id="voice-design-desc" class="field-textarea" rows="5"
            placeholder="Describe the voice you want…&#10;&#10;Example: A warm, measured elderly British male narrator with a slightly gravelly quality, speaking at a calm, unhurried pace."
          >${escHtml(voice?.description || '')}</textarea>
          <p class="text-xs text-subtle mt-1">Describe timbre, age, gender, accent, pace, and emotional quality.</p>
        </div>
      `;
    }

    if (tab === 'cloned') {
      const hasRef = !!voice?.reference_audio;
      return `
        <div class="mb-4">
          <label class="field-label">Reference audio</label>
          <div id="clone-upload-zone" class="upload-zone p-6 text-center mt-1 ${hasRef ? 'hidden' : ''}">
            <span class="material-symbols-outlined icon-lg text-muted mb-2 block">audio_file</span>
            <p class="text-sm text-on-surface font-medium mb-1">Drop a WAV or MP3 file here</p>
            <p class="text-xs text-muted mb-3">3–30 seconds of clean speech</p>
            <button class="btn-ghost" onclick="CastingPage.browseRefAudio()">
              <span class="material-symbols-outlined icon-sm">folder_open</span>Browse file
            </button>
            <input type="file" id="ref-audio-file" class="hidden" accept=".wav,.mp3,.flac,.m4a"/>
          </div>
          ${hasRef ? `
            <div id="clone-ref-display" class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low">
              <span class="material-symbols-outlined text-primary">audio_file</span>
              <span class="text-sm font-medium flex-1 truncate">${escHtml(voice.reference_audio?.split(/[\\/]/).pop() || 'Reference audio')}</span>
              <button class="btn-icon" onclick="CastingPage.clearRefAudio()">
                <span class="material-symbols-outlined icon-sm">close</span>
              </button>
            </div>
          ` : '<div id="clone-ref-display" class="hidden"></div>'}
        </div>
        <div class="mb-4">
          <label class="field-label">Reference transcript <span class="text-subtle font-label text-xs">(optional but improves quality)</span></label>
          <textarea id="clone-transcript" class="field-textarea text-sm" rows="3"
            placeholder="Type what the speaker says in the reference audio…"
          >${escHtml(voice?.transcription || '')}</textarea>
        </div>
        <div>
          <label class="field-label">Model size</label>
          <select id="voice-model-size" class="field-select w-full">
            <option value="1.7B" ${(voice?.model_size || '1.7B') === '1.7B' ? 'selected' : ''}>1.7B — Best quality</option>
            <option value="0.6B" ${voice?.model_size === '0.6B' ? 'selected' : ''}>0.6B — Faster</option>
          </select>
        </div>
      `;
    }
    return '';
  }

  function bindDrawerEvents(existingVoice) {
    // Speaker radio visual update
    document.querySelectorAll('input[name="speaker"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('#speaker-grid label').forEach(label => {
          const isSelected = label.querySelector('input').value === radio.value;
          label.className = `flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-primary-container' : 'hover:bg-surface-container-low'}`;
          const check = label.querySelector('.material-symbols-outlined');
          if (isSelected && !check) {
            label.insertAdjacentHTML('beforeend', '<span class="material-symbols-outlined icon-sm text-primary">check_circle</span>');
          } else if (!isSelected && check && check.textContent === 'check_circle') {
            check.remove();
          }
        });
      });
    });

    // Clone file drop zone
    const zone = document.getElementById('clone-upload-zone');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleRefAudioFile(file);
      });
    }

    const fileInput = document.getElementById('ref-audio-file');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleRefAudioFile(fileInput.files[0]);
      });
    }

    // Preview draft
    document.getElementById('preview-draft-btn').onclick = previewDraft;

    // Save
    document.getElementById('save-voice-btn').onclick = () => saveVoice(existingVoice);
  }

  let refAudioPath = null;

  function browseRefAudio() {
    document.getElementById('ref-audio-file')?.click();
  }

  function handleRefAudioFile(file) {
    refAudioPath = file.path || file.name;
    const zone    = document.getElementById('clone-upload-zone');
    const display = document.getElementById('clone-ref-display');
    if (zone)    zone.classList.add('hidden');
    if (display) {
      display.classList.remove('hidden');
      display.innerHTML = `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low">
          <span class="material-symbols-outlined text-primary">audio_file</span>
          <span class="text-sm font-medium flex-1 truncate">${escHtml(file.name)}</span>
          <button class="btn-icon" onclick="CastingPage.clearRefAudio()">
            <span class="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>
      `;
    }
  }

  function clearRefAudio() {
    refAudioPath = null;
    const zone    = document.getElementById('clone-upload-zone');
    const display = document.getElementById('clone-ref-display');
    if (zone)    zone.classList.remove('hidden');
    if (display) display.classList.add('hidden');
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase().startsWith(tab.substring(0, 3)));
    });
    const content = document.getElementById('voice-tab-content');
    if (content) content.innerHTML = renderTabContent(tab, null);
    bindDrawerEvents(null);
  }

  // ── Build voice config from form ───────────────────────────────────────────

  function buildVoiceConfig() {
    const name = document.getElementById('voice-name-input')?.value.trim();
    if (!name) { Toast.error('Please enter a voice name.'); return null; }

    const type = editVoiceId ? voices.find(v => v.id === editVoiceId)?.type : activeTab;

    if (type === 'preset') {
      const speaker   = document.querySelector('input[name="speaker"]:checked')?.value;
      const language  = document.getElementById('voice-lang')?.value || 'Auto';
      const instruct  = document.getElementById('voice-instruct')?.value.trim() || '';
      const modelSize = document.getElementById('voice-model-size')?.value || '1.7B';
      if (!speaker) { Toast.error('Please select a speaker.'); return null; }
      return { name, type: 'preset', speaker, language, instruct, model_size: modelSize };
    }

    if (type === 'designed') {
      const description = document.getElementById('voice-design-desc')?.value.trim();
      if (!description) { Toast.error('Please enter a voice description.'); return null; }
      return { name, type: 'designed', description };
    }

    if (type === 'cloned') {
      const transcript = document.getElementById('clone-transcript')?.value.trim() || '';
      const modelSize  = document.getElementById('voice-model-size')?.value || '1.7B';
      const ref        = refAudioPath || (editVoiceId ? voices.find(v => v.id === editVoiceId)?.reference_audio : null);
      if (!ref) { Toast.error('Please provide a reference audio file.'); return null; }
      return { name, type: 'cloned', reference_audio: ref, transcription: transcript, model_size: modelSize };
    }

    return null;
  }

  // ── Preview (draft — not yet saved) ───────────────────────────────────────

  async function previewDraft() {
    const config = buildVoiceConfig();
    if (!config) return;
    const text = document.getElementById('preview-text-input')?.value.trim() || 'The ancient forest stretched endlessly in every direction.';

    const loading = document.getElementById('draft-preview-loading');
    loading?.classList.remove('hidden');
    document.getElementById('preview-draft-btn').disabled = true;

    try {
      const res = await API.voices.previewDraft(config, text);
      loading?.classList.add('hidden');
      document.getElementById('preview-draft-btn').disabled = false;

      const container = document.getElementById('draft-player-container');
      if (container) {
        container.innerHTML = '<div id="draft-audio-player"></div>';
        draftPreviewPlayer?.destroy();
        draftPreviewPlayer = AudioPlayer.create('draft-audio-player');
        draftPreviewPlayer?.load(`${API.BASE}${res.audio_url}?t=${Date.now()}`);
      }
    } catch (err) {
      loading?.classList.add('hidden');
      document.getElementById('preview-draft-btn').disabled = false;
      Toast.error('Preview failed: ' + err.message);
    }
  }

  // ── Preview (saved voice) ──────────────────────────────────────────────────

  async function previewVoice(voiceId) {
    const voice = voices.find(v => v.id === voiceId);
    if (!voice) return;

    const btn = document.querySelector(`#voice-card-${voiceId} [title="Preview voice"]`);
    if (btn) { btn.innerHTML = `<span class="material-symbols-outlined icon-sm" style="animation:spin 0.8s linear infinite">refresh</span>`; }

    try {
      const text = 'The ancient forest stretched endlessly, its canopy thick with the secrets of ages past.';
      const res  = await API.voices.preview(voiceId, text);

      const container = document.getElementById(`voice-player-${voiceId}`);
      if (container) {
        container.innerHTML = '<div id="voice-inline-player-' + voiceId + '"></div>';
        const player = AudioPlayer.create('voice-inline-player-' + voiceId);
        player?.load(`${API.BASE}${res.audio_url}?t=${Date.now()}`);
      }
    } catch (err) {
      Toast.error('Preview failed: ' + err.message);
    } finally {
      if (btn) btn.innerHTML = `<span class="material-symbols-outlined icon-sm">play_circle</span>`;
    }
  }

  // ── Save voice ─────────────────────────────────────────────────────────────

  async function saveVoice(existingVoice) {
    const config = buildVoiceConfig();
    if (!config) return;

    const btn = document.getElementById('save-voice-btn');
    btn.disabled = true;
    btn.innerHTML = spinnerHTML(16) + ' Saving…';

    try {
      if (editVoiceId) {
        await API.voices.update(editVoiceId, config);
        Toast.success('Voice updated.');
      } else {
        await API.voices.create(config);
        Toast.success(`"${config.name}" added to your library.`);
      }
      closeDrawer();
      App.invalidateVoices();
      await loadVoices();
    } catch (err) {
      Toast.error('Failed to save voice: ' + err.message);
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined icon-sm">save</span>' + (editVoiceId ? 'Save changes' : 'Add to library');
    }
  }

  // ── Edit / Delete ──────────────────────────────────────────────────────────

  function editVoice(voiceId) { openDrawer(voiceId); }

  async function deleteVoice(voiceId) {
    const voice = voices.find(v => v.id === voiceId);
    const ok = await confirmDialog('Delete Voice', `Delete <strong>${escHtml(voice?.name || voiceId)}</strong>? This cannot be undone.`);
    if (!ok) return;
    try {
      await API.voices.delete(voiceId);
      App.invalidateVoices();
      Toast.success('Voice deleted.');
      await loadVoices();
    } catch (err) {
      Toast.error('Failed to delete: ' + err.message);
    }
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  async function loadVoices() {
    const grid = document.getElementById('voices-grid');
    if (!grid) return;

    try {
      const res = await API.voices.list();
      voices = res.voices || [];
      App.state.voices = voices;

      if (voices.length === 0) {
        grid.innerHTML = renderEmptyState();
      } else {
        grid.innerHTML = voices.map(renderVoiceCard).join('');
      }
    } catch (err) {
      grid.innerHTML = `<p class="text-sm text-error py-8 text-center">Could not load voices: ${escHtml(err.message)}</p>`;
    }
  }

  // ── Mount / Unmount ────────────────────────────────────────────────────────

  function mount() {
    document.getElementById('new-voice-btn').onclick = () => openDrawer(null);
    refAudioPath = null;
    loadVoices();
  }

  function unmount() {
    closeDrawer();
    draftPreviewPlayer?.destroy();
    previewPlayer?.destroy();
  }

  return {
    render, mount, unmount,
    openDrawer, closeDrawer, switchTab,
    previewVoice, previewDraft, editVoice, deleteVoice,
    browseRefAudio, clearRefAudio,
  };
})();
