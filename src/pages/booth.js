/* ── Booth Page — Recording Studio ───────────────────────────────────────── */

const BoothPage = (() => {

  let projectId = null;
  let projectData = null;
  let chapters = [];
  let voices = [];
  let selectedChapterId = null;
  let sortable = null;
  let chapterPlayer = null;
  let activeGenerations = {}; // { chapterId: EventSource }
  let autoSaveTimer = null;

  // ── Render ─────────────────────────────────────────────────────────────────

  function render(params) {
    projectId = params.projectId;
    return `
      <div class="flex h-full overflow-hidden bg-background">

        <!-- Left Panel — Chapter List -->
        <div class="flex-shrink-0 w-80 flex flex-col h-full bg-surface-container-lowest overflow-hidden" style="border-right:1px solid rgba(175,179,176,0.2)">

          <div class="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0">
            <span class="font-headline font-semibold text-sm text-on-surface">Chapters</span>
            <div class="flex items-center gap-1">
              <button class="btn-icon" title="Import text" id="import-text-btn">
                <span class="material-symbols-outlined icon-sm">upload_file</span>
              </button>
              <button class="btn-icon" title="Add chapter" id="add-chapter-btn">
                <span class="material-symbols-outlined icon-sm">add</span>
              </button>
            </div>
          </div>

          <div id="chapter-list" class="flex-1 overflow-y-auto px-3 pb-4">
            <div class="flex items-center gap-2 py-8 justify-center text-muted text-xs">
              ${spinnerHTML(18)} Loading…
            </div>
          </div>

          <!-- Export button -->
          <div class="flex-shrink-0 px-4 py-4" style="border-top:1px solid rgba(175,179,176,0.15)">
            <button class="btn-primary w-full" id="export-btn">
              <span class="material-symbols-outlined icon-sm">download</span>Export Audiobook
            </button>
            <div id="export-progress-area" class="hidden mt-3">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-label text-muted" id="export-status-label">Preparing…</span>
                <span class="text-xs font-label text-muted" id="export-pct">0%</span>
              </div>
              <div class="progress-bar"><div class="progress-fill" id="export-fill" style="width:0%"></div></div>
            </div>
          </div>
        </div>

        <!-- Right Panel — Editor -->
        <div class="flex-1 flex flex-col h-full overflow-hidden">
          <div id="chapter-editor" class="flex-1 flex flex-col overflow-hidden">
            ${renderEditorEmpty()}
          </div>
        </div>
      </div>
    `;
  }

  function renderEditorEmpty() {
    return `
      <div class="flex-1 flex items-center justify-center text-center px-8">
        <div>
          <div class="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
            <span class="material-symbols-outlined icon-lg text-muted">library_books</span>
          </div>
          <h3 class="font-headline font-semibold text-on-surface mb-1">Select a chapter</h3>
          <p class="text-sm text-muted">Choose a chapter from the list to start editing.</p>
        </div>
      </div>
    `;
  }

  function renderChapterEditor(chapter) {
    const voiceOptions = voices.map(v =>
      `<option value="${v.id}" ${chapter.voice_id === v.id ? 'selected' : ''}>${escHtml(v.name)}</option>`
    ).join('');

    const wordCount = chapter.text ? chapter.text.split(/\s+/).filter(Boolean).length : 0;

    return `
      <div class="flex items-center gap-3 px-6 py-4 flex-shrink-0" style="border-bottom:1px solid rgba(175,179,176,0.15)">
        <div class="flex-1 min-w-0">
          <input type="text" id="chapter-title-input" class="field-input font-headline text-base font-semibold"
            value="${escHtml(chapter.title)}" placeholder="Chapter title"/>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="material-symbols-outlined icon-sm text-muted">mic</span>
          <select id="chapter-voice-select" class="field-select text-sm" style="min-width:140px">
            <option value="">No voice</option>
            ${voiceOptions}
          </select>
        </div>
      </div>

      <!-- Text area -->
      <div class="flex-1 overflow-hidden px-6 py-4 flex flex-col gap-3">
        <textarea id="chapter-text-input" class="field-textarea flex-1" style="resize:none"
          placeholder="Paste or type chapter text here…">${escHtml(chapter.text || '')}</textarea>
        <div class="flex items-center justify-between text-xs font-label text-subtle">
          <span id="word-count">${wordCount} words</span>
          ${chapter.duration_seconds ? `<span>${fmtDuration(chapter.duration_seconds)}</span>` : ''}
        </div>
      </div>

      <!-- Action bar -->
      <div class="flex-shrink-0 px-6 pb-5 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <button class="btn-secondary" id="preview-chapter-btn">
            <span class="material-symbols-outlined icon-sm">play_arrow</span>Quick preview
          </button>
          <button class="btn-primary" id="generate-chapter-btn">
            <span class="material-symbols-outlined icon-sm">graphic_eq</span>Generate audio
          </button>
          ${chapter.audio_path ? `
            <button class="btn-ghost" id="clear-audio-btn" title="Clear generated audio">
              <span class="material-symbols-outlined icon-sm">delete</span>Clear audio
            </button>
          ` : ''}
          <div id="chapter-gen-status" class="flex-1 flex items-center gap-2 text-xs font-label text-muted justify-end"></div>
        </div>

        <!-- Audio player shown when audio is ready -->
        ${chapter.audio_path ? `
          <div id="chapter-audio-container">
            <div id="chapter-audio-player"></div>
          </div>
        ` : '<div id="chapter-audio-container"></div>'}
      </div>
    `;
  }

  // ── Chapter List ───────────────────────────────────────────────────────────

  function renderChapterList() {
    const list = document.getElementById('chapter-list');
    if (!list) return;

    if (chapters.length === 0) {
      list.innerHTML = `
        <div class="text-center py-10 text-muted">
          <span class="material-symbols-outlined icon-lg mb-2 block">library_add</span>
          <p class="text-xs">No chapters yet.<br/>Add one or import text.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = chapters.map((ch, i) => {
      const isSelected = ch.id === selectedChapterId;
      const statusClass = `status-dot-${ch.status || 'draft'}`;
      const voice = voices.find(v => v.id === ch.voice_id);
      return `
        <div class="chapter-item ${isSelected ? 'active' : ''}" data-id="${ch.id}" onclick="BoothPage.selectChapter('${ch.id}')">
          <span class="material-symbols-outlined drag-handle icon-sm">drag_indicator</span>
          <span class="text-xs font-label text-subtle flex-shrink-0 w-5 text-right">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-on-surface truncate">${escHtml(ch.title || `Chapter ${i + 1}`)}</p>
            ${voice ? `<p class="text-xs text-muted truncate">${escHtml(voice.name)}</p>` : ''}
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <div class="w-2 h-2 rounded-full server-dot ${statusClass}" title="${ch.status || 'draft'}"></div>
            <button class="btn-icon w-6 h-6 opacity-0 chapter-del-btn" title="Delete chapter"
              onclick="event.stopPropagation(); BoothPage.deleteChapter('${ch.id}')">
              <span class="material-symbols-outlined icon-sm" style="font-size:14px;color:#a83836">close</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Show delete buttons on hover
    list.querySelectorAll('.chapter-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.querySelector('.chapter-del-btn')?.classList.remove('opacity-0'));
      item.addEventListener('mouseleave', () => item.querySelector('.chapter-del-btn')?.classList.add('opacity-0'));
    });

    // Init/refresh Sortable
    if (sortable) sortable.destroy();
    sortable = new Sortable(list, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async (evt) => {
        const ids = [...list.querySelectorAll('[data-id]')].map(el => el.dataset.id);
        // Reorder local state
        const reordered = ids.map(id => chapters.find(c => c.id === id)).filter(Boolean);
        chapters = reordered;
        try { await API.chapters.reorder(projectId, ids); } catch {}
      },
    });
  }

  // ── Select Chapter ─────────────────────────────────────────────────────────

  function selectChapter(chapterId) {
    // Auto-save current chapter before switching
    autoSaveCurrent();

    selectedChapterId = chapterId;

    // Update list highlighting
    document.querySelectorAll('.chapter-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === chapterId);
    });

    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    // Render editor
    const editor = document.getElementById('chapter-editor');
    editor.innerHTML = `<div class="flex-1 flex flex-col overflow-hidden page-enter">${renderChapterEditor(chapter)}</div>`;

    bindEditorEvents(chapter);

    // If audio exists, set up player
    if (chapter.audio_path) {
      chapterPlayer?.destroy();
      chapterPlayer = AudioPlayer.create('chapter-audio-player');
      chapterPlayer?.load(API.chapters.audioUrl(chapterId));
    }
  }

  // ── Editor event binding ───────────────────────────────────────────────────

  function bindEditorEvents(chapter) {
    // Title auto-save — only update the list, don't re-render the editor
    const titleInput = document.getElementById('chapter-title-input');
    titleInput?.addEventListener('input', debounce(() => {
      const ch = chapters.find(c => c.id === chapter.id);
      if (ch) {
        ch.title = titleInput.value;
        renderChapterList(); // updates left panel title only, editor stays intact
      }
    }, 600));

    // Word count
    const textInput = document.getElementById('chapter-text-input');
    textInput?.addEventListener('input', () => {
      const words = textInput.value.split(/\s+/).filter(Boolean).length;
      const el = document.getElementById('word-count');
      if (el) el.textContent = `${words} words`;
    });

    // Voice select auto-save
    document.getElementById('chapter-voice-select')?.addEventListener('change', (e) => {
      const ch = chapters.find(c => c.id === chapter.id);
      if (ch) ch.voice_id = e.target.value || null;
      saveChapterFields(chapter.id);
    });

    // Quick preview (first ~300 chars)
    document.getElementById('preview-chapter-btn').onclick = () => generateAudio(chapter.id, true);

    // Full generate
    document.getElementById('generate-chapter-btn').onclick = () => generateAudio(chapter.id, false);

    // Clear audio
    document.getElementById('clear-audio-btn')?.addEventListener('click', () => clearChapterAudio(chapter.id));
  }

  // ── Auto-save ──────────────────────────────────────────────────────────────

  function autoSaveCurrent() {
    if (!selectedChapterId) return;
    saveChapterFields(selectedChapterId);
  }

  async function saveChapterFields(chapterId) {
    const titleInput = document.getElementById('chapter-title-input');
    const textInput  = document.getElementById('chapter-text-input');
    const voiceSel   = document.getElementById('chapter-voice-select');

    if (!titleInput && !textInput) return;

    const updates = {};
    if (titleInput) updates.title    = titleInput.value.trim() || 'Untitled';
    if (textInput)  updates.text     = textInput.value;
    if (voiceSel)   updates.voice_id = voiceSel.value || null;

    const ch = chapters.find(c => c.id === chapterId);
    if (ch) Object.assign(ch, updates);

    try { await API.chapters.update(chapterId, updates); } catch {}
  }

  // ── Generate Audio ─────────────────────────────────────────────────────────

  async function generateAudio(chapterId, preview) {
    // Save first
    await saveChapterFields(chapterId);

    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter?.voice_id) { Toast.error('Please assign a voice to this chapter first.'); return; }
    if (!chapter?.text?.trim()) { Toast.error('Chapter has no text.'); return; }

    if (activeGenerations[chapterId]) return; // already running

    const statusEl    = document.getElementById('chapter-gen-status');
    const genBtn      = document.getElementById('generate-chapter-btn');
    const previewBtn  = document.getElementById('preview-chapter-btn');

    if (statusEl) statusEl.innerHTML = `${spinnerHTML(14)} ${preview ? 'Generating preview…' : 'Generating full audio…'}`;
    if (genBtn)   { genBtn.disabled = true; }
    if (previewBtn) { previewBtn.disabled = true; }

    // Update chapter status in list
    chapter.status = 'generating';
    renderChapterList();
    selectChapterListItem(chapterId);

    const es = API.chapters.generateStream(chapterId, preview);
    activeGenerations[chapterId] = es;

    API.streamEvents(es, {
      onProgress: (data) => {
        if (statusEl) statusEl.innerHTML = `${spinnerHTML(14)} ${data.message || 'Generating…'}`;
      },
      onDone: async (data) => {
        delete activeGenerations[chapterId];
        chapter.status = 'ready';
        chapter.audio_path = data.audio_path || true;
        chapter.duration_seconds = data.duration_seconds;

        if (statusEl) statusEl.innerHTML = `<span class="text-primary flex items-center gap-1"><span class="material-symbols-outlined icon-sm icon-fill">check_circle</span>${preview ? 'Preview ready' : 'Audio ready'}</span>`;
        if (genBtn)   genBtn.disabled = false;
        if (previewBtn) previewBtn.disabled = false;

        renderChapterList();

        // Show player
        const container = document.getElementById('chapter-audio-container');
        if (container) {
          container.innerHTML = '<div id="chapter-audio-player"></div>';
          chapterPlayer?.destroy();
          chapterPlayer = AudioPlayer.create('chapter-audio-player');
          chapterPlayer?.load(API.chapters.audioUrl(chapterId) + `?t=${Date.now()}`);
        }
      },
      onError: (err) => {
        delete activeGenerations[chapterId];
        chapter.status = 'error';
        renderChapterList();

        if (statusEl) statusEl.innerHTML = `<span class="text-error text-xs">${escHtml(err.message)}</span>`;
        if (genBtn)   genBtn.disabled = false;
        if (previewBtn) previewBtn.disabled = false;
        Toast.error('Generation failed: ' + err.message);
      },
    });
  }

  function selectChapterListItem(chapterId) {
    document.querySelectorAll('.chapter-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === chapterId);
    });
  }

  async function clearChapterAudio(chapterId) {
    try {
      await API.chapters.update(chapterId, { clear_audio: true });
      const ch = chapters.find(c => c.id === chapterId);
      if (ch) { ch.status = 'draft'; ch.audio_path = null; ch.duration_seconds = null; }
      renderChapterList();
      selectChapter(chapterId);
      Toast.info('Audio cleared.');
    } catch (err) {
      Toast.error(err.message);
    }
  }

  // ── Add Chapter ────────────────────────────────────────────────────────────

  async function addChapter() {
    autoSaveCurrent();
    const title = `Chapter ${chapters.length + 1}`;
    try {
      const res = await API.chapters.add(projectId, [{ title, text: '', voice_id: null }]);
      const newChapter = res.chapters?.[0] || { id: res.id, title, text: '', voice_id: null, status: 'draft' };
      chapters.push(newChapter);
      renderChapterList();
      selectChapter(newChapter.id);
      Toast.info('Chapter added.');
    } catch (err) {
      Toast.error('Failed to add chapter: ' + err.message);
    }
  }

  // ── Delete Chapter ─────────────────────────────────────────────────────────

  async function deleteChapter(chapterId) {
    const ch = chapters.find(c => c.id === chapterId);
    const ok = await confirmDialog('Delete Chapter', `Delete <strong>${escHtml(ch?.title || 'this chapter')}</strong>?`);
    if (!ok) return;

    if (selectedChapterId === chapterId) {
      selectedChapterId = null;
      document.getElementById('chapter-editor').innerHTML = renderEditorEmpty();
    }

    try {
      await API.chapters.delete(chapterId);
      chapters = chapters.filter(c => c.id !== chapterId);
      renderChapterList();
      Toast.info('Chapter deleted.');
    } catch (err) {
      Toast.error(err.message);
    }
  }

  // ── Import Text Modal ──────────────────────────────────────────────────────

  function openImportModal() {
    const PRESETS = [
      { label: 'Chapter N (Chapter 1, Chapter 2…)', value: '^(Chapter|CHAPTER)\\s+\\d+' },
      { label: 'CHAPTER IN CAPS', value: '^CHAPTER\\s+' },
      { label: 'Numbered (1. or 1:)', value: '^\\d+[.:]' },
      { label: 'Part N', value: '^(Part|PART)\\s+\\d+' },
      { label: 'Roman numerals (I. II. III.)', value: '^[IVXLCDM]+\\.' },
    ];

    Modal.show({
      title: 'Import & Split Text',
      width: 'max-w-2xl',
      body: `
        <div class="flex flex-col gap-4">
          <div>
            <label class="field-label">Raw text</label>
            <textarea id="import-raw-text" class="field-textarea text-sm" rows="8"
              placeholder="Paste the full book text here…"></textarea>
          </div>

          <div class="flex gap-3 items-end">
            <div class="flex-1">
              <label class="field-label">Split pattern (regex)</label>
              <input type="text" id="import-pattern" class="field-input font-mono text-sm"
                value="^(Chapter|CHAPTER)\\s+\\d+" placeholder="regex pattern…"/>
            </div>
            <select id="import-preset" class="field-select text-sm flex-shrink-0" style="min-width:180px">
              <option value="">— Presets —</option>
              ${PRESETS.map(p => `<option value="${escHtml(p.value)}">${escHtml(p.label)}</option>`).join('')}
            </select>
          </div>

          <div class="flex items-center gap-3">
            <button class="btn-ghost" id="import-preview-btn">
              <span class="material-symbols-outlined icon-sm">visibility</span>Preview split
            </button>
            <label class="flex items-center gap-2 text-sm font-label text-muted cursor-pointer">
              <input type="radio" name="import-mode" value="append" checked class="accent-primary"> Append to existing
            </label>
            <label class="flex items-center gap-2 text-sm font-label text-muted cursor-pointer">
              <input type="radio" name="import-mode" value="replace" class="accent-primary"> Replace all chapters
            </label>
          </div>

          <div id="import-preview-result" class="hidden bg-surface-container-low rounded-xl p-4 max-h-48 overflow-y-auto">
            <p class="text-xs font-label text-muted mb-2">Detected chapters:</p>
            <div id="import-chapters-preview"></div>
          </div>
        </div>
      `,
      actions: [
        { id: 'cancel', label: 'Cancel', onClick: () => Modal.close() },
        { id: 'import', label: 'Import chapters', primary: true, onClick: doImport },
      ],
    });

    // Preset select
    document.getElementById('import-preset').onchange = (e) => {
      if (e.target.value) document.getElementById('import-pattern').value = e.target.value;
    };

    // Preview split
    document.getElementById('import-preview-btn').onclick = previewImportSplit;
  }

  function splitTextByPattern(text, patternStr) {
    let regex;
    try { regex = new RegExp(patternStr, 'gm'); } catch { return null; }

    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ index: match.index, title: match[0].trim() });
    }

    if (matches.length === 0) {
      return [{ title: 'Chapter 1', text: text.trim() }];
    }

    const chapters = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].title.length;
      const end   = i + 1 < matches.length ? matches[i + 1].index : text.length;
      chapters.push({ title: matches[i].title, text: text.slice(start, end).trim() });
    }
    return chapters;
  }

  function previewImportSplit() {
    const text    = document.getElementById('import-raw-text').value;
    const pattern = document.getElementById('import-pattern').value;
    const result  = splitTextByPattern(text, pattern);

    const container = document.getElementById('import-preview-result');
    const listEl    = document.getElementById('import-chapters-preview');
    container.classList.remove('hidden');

    if (!result) {
      listEl.innerHTML = '<p class="text-xs text-error">Invalid regex pattern.</p>';
      return;
    }

    listEl.innerHTML = result.slice(0, 30).map((ch, i) => `
      <div class="flex gap-2 text-xs py-1">
        <span class="text-subtle flex-shrink-0 font-label w-4">${i + 1}</span>
        <div>
          <span class="font-medium text-on-surface">${escHtml(ch.title)}</span>
          <span class="text-subtle ml-2">${ch.text.slice(0, 60).replace(/\n/g, ' ')}…</span>
        </div>
      </div>
    `).join('') + (result.length > 30 ? `<p class="text-xs text-subtle mt-1">…and ${result.length - 30} more</p>` : '');
  }

  async function doImport() {
    const text    = document.getElementById('import-raw-text').value.trim();
    const pattern = document.getElementById('import-pattern').value;
    const mode    = document.querySelector('input[name="import-mode"]:checked')?.value || 'append';

    if (!text) { Toast.error('Please paste some text first.'); return; }

    const result = splitTextByPattern(text, pattern);
    if (!result || result.length === 0) { Toast.error('No chapters detected. Check your pattern.'); return; }

    Modal.setActionDisabled('import', true);
    Modal.setActionLabel('import', `Importing ${result.length} chapters…`);

    try {
      if (mode === 'replace') {
        // Delete all existing chapters
        for (const ch of chapters) {
          try { await API.chapters.delete(ch.id); } catch {}
        }
        chapters = [];
      }

      const res = await API.chapters.add(projectId, result);
      const newChapters = res.chapters || [];
      chapters = mode === 'replace' ? newChapters : [...chapters, ...newChapters];

      Modal.close();
      renderChapterList();
      if (chapters.length > 0) selectChapter(chapters[0].id);
      Toast.success(`Imported ${result.length} chapters.`);
    } catch (err) {
      Toast.error('Import failed: ' + err.message);
      Modal.setActionDisabled('import', false);
      Modal.setActionLabel('import', 'Import chapters');
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  function openExportModal() {
    const readyCount = chapters.filter(c => c.status === 'ready').length;
    Modal.show({
      title: 'Export Audiobook',
      body: `
        <div class="flex flex-col gap-4">
          <div class="bg-surface-container-low rounded-xl p-4">
            <p class="text-sm text-on-surface font-medium mb-1">${projectData?.title || 'Audiobook'}</p>
            <p class="text-xs text-muted">${chapters.length} chapters · ${readyCount} with audio</p>
            ${readyCount < chapters.length
              ? `<p class="text-xs text-error mt-1">
                  <span class="material-symbols-outlined icon-sm">warning</span>
                  ${chapters.length - readyCount} chapter(s) have no audio — they will be skipped.
                </p>`
              : ''}
          </div>
          <div>
            <label class="field-label">Format</label>
            <select id="export-format" class="field-select w-full">
              <option value="m4b">M4B — Apple Books, audiobook players (recommended)</option>
              <option value="mp3zip">MP3 ZIP — individual chapter files</option>
            </select>
          </div>
          <div>
            <label class="field-label">Audio quality</label>
            <select id="export-quality" class="field-select w-full">
              <option value="128k">Standard (128 kbps)</option>
              <option value="256k">High (256 kbps)</option>
            </select>
          </div>
          <p class="text-xs text-muted">Requires <strong>ffmpeg</strong> to be installed and in your PATH.</p>
        </div>
      `,
      actions: [
        { id: 'cancel', label: 'Cancel', onClick: () => Modal.close() },
        { id: 'export-go', label: 'Start export', primary: true, onClick: startExport },
      ],
    });
  }

  async function startExport() {
    const bitrate = document.getElementById('export-quality')?.value || '128k';
    Modal.close();

    const progressArea = document.getElementById('export-progress-area');
    const statusLabel  = document.getElementById('export-status-label');
    const pctLabel     = document.getElementById('export-pct');
    const fill         = document.getElementById('export-fill');
    const btn          = document.getElementById('export-btn');

    progressArea?.classList.remove('hidden');
    if (btn) btn.disabled = true;

    const es = API.exports.m4bStream(projectId, { bitrate });

    API.streamEvents(es, {
      onProgress: (data) => {
        if (statusLabel) statusLabel.textContent = data.message || 'Exporting…';
        if (pctLabel)    pctLabel.textContent    = `${data.percent || 0}%`;
        if (fill)        fill.style.width        = `${data.percent || 0}%`;
      },
      onDone: async (data) => {
        progressArea?.classList.add('hidden');
        if (btn) btn.disabled = false;
        if (data.output_path) {
          Toast.success('Export complete!');
          const result = await window.electronAPI.saveFileDialog({
            title: 'Save Audiobook',
            defaultPath: `${projectData?.title || 'audiobook'}.m4b`,
            filters: [{ name: 'Audiobook', extensions: ['m4b'] }],
          });
          if (!result.canceled && result.filePath) {
            await fetch(`${API.BASE}/api/export/move`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ src: data.output_path, dest: result.filePath }),
            });
            window.electronAPI.showItemInFolder(result.filePath);
          }
        }
      },
      onError: (err) => {
        progressArea?.classList.add('hidden');
        if (btn) btn.disabled = false;
        Toast.error('Export failed: ' + err.message);
      },
    });
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadAll(params) {
    // Load project, voices, and chapters in parallel
    try {
      [projectData, { voices: voices }] = await Promise.all([
        API.projects.get(params.projectId),
        API.voices.list(),
      ]);
    } catch {
      voices = App.getVoices() || [];
    }

    try {
      const res = await API.chapters.list(params.projectId);
      chapters = res.chapters || [];
    } catch (err) {
      Toast.error('Could not load chapters: ' + err.message);
      chapters = [];
    }

    renderChapterList();

    // Auto-select first chapter
    if (chapters.length > 0) selectChapter(chapters[0].id);
  }

  // ── Mount / Unmount ────────────────────────────────────────────────────────

  function mount(params) {
    projectId = params.projectId;

    document.getElementById('add-chapter-btn').onclick = addChapter;
    document.getElementById('import-text-btn').onclick = openImportModal;
    document.getElementById('export-btn').onclick = openExportModal;

    loadAll(params);
  }

  function unmount() {
    autoSaveCurrent();
    if (sortable) { sortable.destroy(); sortable = null; }
    chapterPlayer?.destroy();
    Object.values(activeGenerations).forEach(es => { try { es.close(); } catch {} });
    activeGenerations = {};
    chapters = [];
    voices = [];
    selectedChapterId = null;
    projectData = null;
  }

  return {
    render, mount, unmount,
    selectChapter, addChapter, deleteChapter,
    openImportModal, openExportModal,
  };
})();
