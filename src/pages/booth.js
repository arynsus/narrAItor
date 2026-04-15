/* ── Booth Page — Recording Studio ───────────────────────────────────────── */

const BoothPage = (() => {

  // ── Module state ───────────────────────────────────────────────────────────

  let projectId    = null;
  let projectData  = null;
  let chapters     = [];
  let voices       = [];
  let selectedChapterId = null;
  let sortable     = null;
  let chapterPlayer = null;
  let activeGenerations = {}; // { chapterId: EventSource } — preview only

  // ── Queue state ────────────────────────────────────────────────────────────

  let queue          = [];   // { id, chapterId, title, voiceName, status, progress, error, es }
  let queueRunning   = false;
  let queueExpanded  = true;
  let _queueJobIdCtr = 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  function render(params) {
    projectId = params.projectId;
    return `
      <div class="flex h-full overflow-hidden bg-background">

        <!-- ── Left Panel — Chapter List ── -->
        <div class="flex-shrink-0 w-80 flex flex-col h-full bg-surface-container-lowest overflow-hidden"
             style="border-right:1px solid rgba(175,179,176,0.2)">

          <!-- Header -->
          <div class="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0">
            <span class="font-headline font-semibold text-sm text-on-surface">Chapters</span>
            <div class="flex items-center gap-1">
              <button class="btn-icon" title="Queue all chapters for generation" id="queue-all-btn">
                <span class="material-symbols-outlined icon-sm">queue_play_next</span>
              </button>
              <button class="btn-icon" title="Import &amp; split text" id="import-text-btn">
                <span class="material-symbols-outlined icon-sm">upload_file</span>
              </button>
              <button class="btn-icon" title="Add chapter" id="add-chapter-btn">
                <span class="material-symbols-outlined icon-sm">add</span>
              </button>
            </div>
          </div>

          <!-- Chapter list (scrollable flex-1) -->
          <div id="chapter-list" class="flex-1 overflow-y-auto px-3 pb-4">
            <div class="flex items-center gap-2 py-8 justify-center text-muted text-xs">
              ${spinnerHTML(18)} Loading…
            </div>
          </div>

          <!-- ── Queue Panel ── -->
          <div id="queue-panel" class="flex-shrink-0"
               style="border-top:1px solid rgba(175,179,176,0.15)">
            <div class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
                 style="transition:background 150ms ease"
                 id="queue-header-row"
                 onmouseenter="this.style.background='rgba(243,244,242,0.7)'"
                 onmouseleave="this.style.background=''"
                 onclick="BoothPage.toggleQueue()">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined icon-sm text-muted">queue</span>
                <span class="font-label text-xs font-semibold text-muted">Queue</span>
                <span id="queue-count-badge"
                      class="hidden text-xs font-label font-semibold bg-primary/10 text-primary rounded-full px-1.5 leading-5">0</span>
              </div>
              <div class="flex items-center gap-1">
                <button class="btn-icon w-6 h-6" id="queue-clear-btn" title="Clear finished"
                        onclick="event.stopPropagation();BoothPage.clearDoneJobs()"
                        style="display:none">
                  <span class="material-symbols-outlined" style="font-size:14px">clear_all</span>
                </button>
                <span class="material-symbols-outlined text-muted" id="queue-chevron"
                      style="font-size:16px;transition:transform 200ms ease">expand_less</span>
              </div>
            </div>
            <div id="queue-list" class="overflow-y-auto px-3 pb-2" style="max-height:200px">
              <!-- populated by renderQueue() on mount -->
            </div>
          </div>

          <!-- Export -->
          <div class="flex-shrink-0 px-4 py-4"
               style="border-top:1px solid rgba(175,179,176,0.15)">
            <button class="btn-primary w-full" id="export-btn">
              <span class="material-symbols-outlined icon-sm">download</span>Export Audiobook
            </button>
            <div id="export-progress-area" class="hidden mt-3">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-label text-muted" id="export-status-label">Preparing…</span>
                <span class="text-xs font-label text-muted" id="export-pct">0%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" id="export-fill" style="width:0%"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Right Panel — Editor ── -->
        <div class="flex-1 flex flex-col h-full overflow-hidden">
          <div id="chapter-editor" class="flex-1 flex flex-col overflow-hidden">
            ${renderEditorEmpty()}
          </div>
        </div>
      </div>
    `;
  }

  // ── Empty editor state ─────────────────────────────────────────────────────

  function renderEditorEmpty() {
    return `
      <div class="flex-1 flex items-center justify-center text-center px-8">
        <div>
          <div class="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
            <span class="material-symbols-outlined icon-lg text-muted">library_books</span>
          </div>
          <h3 class="font-headline font-semibold text-on-surface mb-1">Select a chapter</h3>
          <p class="text-sm text-muted">Pick a chapter from the list, or import text to get started.</p>
        </div>
      </div>
    `;
  }

  // ── Chapter Editor ─────────────────────────────────────────────────────────

  function renderChapterEditor(chapter) {
    const voiceOptions = voices.map(v =>
      `<option value="${v.id}" ${chapter.voice_id === v.id ? 'selected' : ''}>${escHtml(v.name)}</option>`
    ).join('');

    const wordCount = chapter.text ? chapter.text.split(/\s+/).filter(Boolean).length : 0;
    const speed     = chapter.speed != null ? chapter.speed : 1.0;
    const speedPct  = ((speed - 0.5) / 1.5 * 100).toFixed(1); // for gradient
    const isQueued  = queue.some(j =>
      j.chapterId === chapter.id && (j.status === 'pending' || j.status === 'generating')
    );

    return `
      <div class="flex-1 flex flex-col overflow-hidden page-enter">

        <!-- ── Title + Voice row ── -->
        <div class="flex items-center gap-3 px-6 py-4 flex-shrink-0"
             style="border-bottom:1px solid rgba(175,179,176,0.15)">
          <div class="flex-1 min-w-0">
            <input type="text" id="chapter-title-input"
              class="field-input font-headline text-base font-semibold"
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

        <!-- ── Speed param row ── -->
        <div class="flex-shrink-0 flex items-center gap-3 px-6 py-2.5"
             style="border-bottom:1px solid rgba(175,179,176,0.1);background:rgba(243,244,242,0.4)">
          <span class="material-symbols-outlined icon-sm text-muted" title="Playback speed">speed</span>
          <label class="text-xs font-label text-muted whitespace-nowrap" for="chapter-speed">Speed</label>
          <input type="range" id="chapter-speed"
                 class="speed-slider" min="0.5" max="2.0" step="0.05"
                 value="${speed}"
                 style="--pct:${speedPct}%"/>
          <span id="chapter-speed-val"
                class="text-xs font-mono font-semibold text-on-surface w-10 text-right flex-shrink-0">${speed.toFixed(2)}×</span>
          <button class="btn-icon w-6 h-6 flex-shrink-0" id="reset-speed-btn"
                  title="Reset to 1.00×" style="${Math.abs(speed - 1.0) < 0.01 ? 'opacity:0.3;pointer-events:none' : ''}">
            <span class="material-symbols-outlined" style="font-size:13px">replay</span>
          </button>
        </div>

        <!-- ── Text area ── -->
        <div class="flex-1 overflow-hidden px-6 py-4 flex flex-col gap-3">
          <textarea id="chapter-text-input" class="field-textarea flex-1" style="resize:none"
            placeholder="Paste or type chapter text here…">${escHtml(chapter.text || '')}</textarea>
          <div class="flex items-center justify-between text-xs font-label text-subtle">
            <span id="word-count">${wordCount} words</span>
            ${chapter.duration_seconds
              ? `<span class="flex items-center gap-1">
                   <span class="material-symbols-outlined icon-sm" style="font-size:12px">schedule</span>
                   ${fmtDuration(chapter.duration_seconds)}
                 </span>`
              : ''}
          </div>
        </div>

        <!-- ── Action bar ── -->
        <div class="flex-shrink-0 px-6 pb-5 flex flex-col gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn-secondary flex-shrink-0" id="preview-chapter-btn">
              <span class="material-symbols-outlined icon-sm">play_circle</span>Preview
            </button>
            <button class="btn-primary flex-shrink-0" id="generate-chapter-btn" ${isQueued ? 'disabled' : ''}>
              <span class="material-symbols-outlined icon-sm">${isQueued ? 'hourglass_top' : 'queue_play_next'}</span>${isQueued ? 'Queued…' : 'Generate'}
            </button>
            ${chapter.audio_path ? `
              <button class="btn-ghost flex-shrink-0" id="clear-audio-btn" title="Clear generated audio">
                <span class="material-symbols-outlined icon-sm">delete</span>Clear
              </button>
            ` : ''}
            <div id="chapter-gen-status"
                 class="flex-1 flex items-center gap-2 text-xs font-label text-muted justify-end min-w-0"></div>
          </div>

          <!-- Audio player (rendered when audio is ready) -->
          ${chapter.audio_path
            ? `<div id="chapter-audio-container"><div id="chapter-audio-player"></div></div>`
            : `<div id="chapter-audio-container"></div>`}
        </div>
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
      const isSelected  = ch.id === selectedChapterId;
      const statusClass = `status-dot-${ch.status || 'draft'}`;
      const voice       = voices.find(v => v.id === ch.voice_id);
      const inQueue     = queue.some(j => j.chapterId === ch.id &&
                            (j.status === 'pending' || j.status === 'generating'));
      return `
        <div class="chapter-item ${isSelected ? 'active' : ''}" data-id="${ch.id}"
             onclick="BoothPage.selectChapter('${ch.id}')">
          <span class="material-symbols-outlined drag-handle icon-sm">drag_indicator</span>
          <span class="text-xs font-label text-subtle flex-shrink-0 w-5 text-right">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-on-surface truncate">${escHtml(ch.title || `Chapter ${i + 1}`)}</p>
            ${voice ? `<p class="text-xs text-muted truncate">${escHtml(voice.name)}</p>` : ''}
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${inQueue
              ? `<span class="material-symbols-outlined text-tertiary" title="In queue" style="font-size:13px">hourglass_top</span>`
              : `<div class="w-2 h-2 rounded-full server-dot ${statusClass}" title="${ch.status || 'draft'}"></div>`
            }
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
        const ids      = [...list.querySelectorAll('[data-id]')].map(el => el.dataset.id);
        const reordered = ids.map(id => chapters.find(c => c.id === id)).filter(Boolean);
        chapters = reordered;
        try { await API.chapters.reorder(projectId, ids); } catch {}
      },
    });
  }

  function selectChapterListItem(id) {
    document.querySelectorAll('.chapter-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  // ── Select Chapter ─────────────────────────────────────────────────────────

  function selectChapter(chapterId) {
    autoSaveCurrent();
    selectedChapterId = chapterId;

    selectChapterListItem(chapterId);

    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const editor = document.getElementById('chapter-editor');
    editor.innerHTML = `<div class="flex-1 flex flex-col overflow-hidden page-enter">${renderChapterEditor(chapter)}</div>`;

    bindEditorEvents(chapter);

    // If audio exists, set up player
    if (chapter.audio_path) {
      chapterPlayer?.destroy();
      chapterPlayer = AudioPlayer.create('chapter-audio-player');
      chapterPlayer?.load(API.chapters.audioUrl(chapterId));
    }

    // If actively generating in queue, reflect that in the UI
    const activeJob = queue.find(j =>
      j.chapterId === chapterId && (j.status === 'generating' || j.status === 'pending')
    );
    if (activeJob) {
      const statusEl = document.getElementById('chapter-gen-status');
      const genBtn   = document.getElementById('generate-chapter-btn');
      if (activeJob.status === 'generating') {
        if (statusEl) statusEl.innerHTML = `${spinnerHTML(14)} Generating…`;
        if (genBtn)   genBtn.disabled = true;
      }
    }
  }

  // ── Editor event binding ───────────────────────────────────────────────────

  function bindEditorEvents(chapter) {
    // Title — update list on input, save on blur/debounce
    const titleInput = document.getElementById('chapter-title-input');
    titleInput?.addEventListener('input', debounce(() => {
      const ch = chapters.find(c => c.id === chapter.id);
      if (ch) {
        ch.title = titleInput.value;
        renderChapterList();
        selectChapterListItem(chapter.id);
      }
    }, 500));

    // Word count
    document.getElementById('chapter-text-input')?.addEventListener('input', () => {
      const words = document.getElementById('chapter-text-input').value
        .split(/\s+/).filter(Boolean).length;
      const el = document.getElementById('word-count');
      if (el) el.textContent = `${words} words`;
    });

    // Voice select
    document.getElementById('chapter-voice-select')?.addEventListener('change', (e) => {
      const ch = chapters.find(c => c.id === chapter.id);
      if (ch) ch.voice_id = e.target.value || null;
      saveChapterFields(chapter.id);
    });

    // Speed slider
    const speedSlider = document.getElementById('chapter-speed');
    const speedVal    = document.getElementById('chapter-speed-val');
    const resetBtn    = document.getElementById('reset-speed-btn');

    speedSlider?.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      if (speedVal) speedVal.textContent = val.toFixed(2) + '×';
      // Update gradient
      const pct = ((val - 0.5) / 1.5 * 100).toFixed(1);
      speedSlider.style.setProperty('--pct', pct + '%');
      // Toggle reset button visibility
      if (resetBtn) {
        const nearDefault = Math.abs(val - 1.0) < 0.01;
        resetBtn.style.opacity = nearDefault ? '0.3' : '1';
        resetBtn.style.pointerEvents = nearDefault ? 'none' : '';
      }
      const ch = chapters.find(c => c.id === chapter.id);
      if (ch) ch.speed = val;
      debouncedSaveSpeed(chapter.id);
    });

    resetBtn?.addEventListener('click', () => {
      if (speedSlider) {
        speedSlider.value = 1.0;
        speedSlider.dispatchEvent(new Event('input'));
      }
    });

    // Preview button
    document.getElementById('preview-chapter-btn').onclick = () =>
      generateAudio(chapter.id, true);

    // Generate / Queue button
    document.getElementById('generate-chapter-btn').onclick = () =>
      generateAudio(chapter.id, false);

    // Clear audio
    document.getElementById('clear-audio-btn')?.addEventListener('click', () =>
      clearChapterAudio(chapter.id));
  }

  const debouncedSaveSpeed = debounce((id) => saveChapterFields(id), 800);

  // ── Auto-save ──────────────────────────────────────────────────────────────

  function autoSaveCurrent() {
    if (!selectedChapterId) return;
    saveChapterFields(selectedChapterId);
  }

  async function saveChapterFields(chapterId) {
    const titleEl = document.getElementById('chapter-title-input');
    const textEl  = document.getElementById('chapter-text-input');
    const voiceEl = document.getElementById('chapter-voice-select');
    const speedEl = document.getElementById('chapter-speed');

    if (!titleEl && !textEl) return;

    const updates = {};
    if (titleEl) updates.title    = titleEl.value.trim() || 'Untitled';
    if (textEl)  updates.text     = textEl.value;
    if (voiceEl) updates.voice_id = voiceEl.value || null;
    if (speedEl) updates.speed    = parseFloat(speedEl.value);

    const ch = chapters.find(c => c.id === chapterId);
    if (ch) Object.assign(ch, updates);

    try { await API.chapters.update(chapterId, updates); } catch {}
  }

  // ── Audio refresh helper ───────────────────────────────────────────────────

  function refreshAudioPlayer(chapterId) {
    const container = document.getElementById('chapter-audio-container');
    if (!container) return;
    container.innerHTML = '<div id="chapter-audio-player"></div>';
    chapterPlayer?.destroy();
    chapterPlayer = AudioPlayer.create('chapter-audio-player');
    chapterPlayer?.load(API.chapters.audioUrl(chapterId) + `?t=${Date.now()}`);
  }

  // ── Generate Audio (preview = immediate, full = queue) ────────────────────

  async function generateAudio(chapterId, preview) {
    await saveChapterFields(chapterId);

    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter?.voice_id) { Toast.error('Please assign a voice to this chapter first.'); return; }
    if (!chapter?.text?.trim()) { Toast.error('Chapter has no text.'); return; }

    if (!preview) {
      // Full generation → enqueue
      enqueueChapters([chapterId]);
      return;
    }

    // ── Preview: immediate generation ──────────────────────────────────────

    if (activeGenerations[chapterId]) return;

    const statusEl   = document.getElementById('chapter-gen-status');
    const previewBtn = document.getElementById('preview-chapter-btn');

    if (statusEl)   statusEl.innerHTML = `${spinnerHTML(14)} Generating preview…`;
    if (previewBtn) previewBtn.disabled = true;

    const es = API.chapters.generateStream(chapterId, true);
    activeGenerations[chapterId] = es;

    API.streamEvents(es, {
      onProgress: (data) => {
        if (statusEl) statusEl.innerHTML = `${spinnerHTML(14)} ${data.message || 'Generating…'}`;
      },
      onDone: (data) => {
        delete activeGenerations[chapterId];
        if (statusEl) statusEl.innerHTML = `
          <span class="text-primary flex items-center gap-1">
            <span class="material-symbols-outlined icon-sm icon-fill">check_circle</span>Preview ready
          </span>`;
        if (previewBtn) previewBtn.disabled = false;

        const ch = chapters.find(c => c.id === chapterId);
        if (ch) { ch.preview_audio_path = data.audio_path || true; }

        // Show preview player
        refreshAudioPlayer(chapterId);
      },
      onError: (err) => {
        delete activeGenerations[chapterId];
        if (statusEl) statusEl.innerHTML = `<span class="text-error text-xs">${escHtml(err.message)}</span>`;
        if (previewBtn) previewBtn.disabled = false;
        Toast.error('Preview failed: ' + err.message);
      },
    });
  }

  // ── Clear audio ────────────────────────────────────────────────────────────

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

  // ── Queue system ───────────────────────────────────────────────────────────

  /**
   * Add chapters by ID to the generation queue. Skips chapters that:
   *  - have no voice assigned
   *  - have no text
   *  - are already pending or generating
   */
  function enqueueChapters(chapterIds) {
    let added = 0;
    for (const id of chapterIds) {
      const ch = chapters.find(c => c.id === id);
      if (!ch || !ch.voice_id || !ch.text?.trim()) continue;
      // Already in queue (pending/generating)?
      if (queue.some(j => j.chapterId === id &&
            (j.status === 'pending' || j.status === 'generating'))) continue;

      const voice = voices.find(v => v.id === ch.voice_id);
      queue.push({
        id:        `job_${++_queueJobIdCtr}`,
        chapterId: id,
        title:     ch.title || 'Untitled',
        voiceName: voice?.name || 'Unknown voice',
        status:    'pending',
        progress:  0,
        error:     null,
        es:        null,
      });
      added++;
    }

    renderQueue();
    renderChapterList();       // reflect hourglass status icons
    // Re-render editor if selected chapter was just queued
    if (selectedChapterId && chapterIds.includes(selectedChapterId)) {
      const ch = chapters.find(c => c.id === selectedChapterId);
      if (ch) {
        const genBtn = document.getElementById('generate-chapter-btn');
        if (genBtn) {
          genBtn.disabled = true;
          genBtn.innerHTML = `<span class="material-symbols-outlined icon-sm">hourglass_top</span>Queued…`;
        }
      }
    }

    if (added === 0) {
      Toast.info('No eligible chapters — ensure each has text and a voice assigned.');
      return;
    }
    Toast.info(added === 1 ? '1 chapter queued.' : `${added} chapters queued.`);
    runQueue();
  }

  /** Queue all chapters that have a voice and text and aren't already done. */
  function enqueueAll() {
    autoSaveCurrent();
    enqueueChapters(chapters.map(c => c.id));
  }

  /** Cancel a pending job (or abort a generating one). */
  function cancelQueueJob(jobId) {
    const job = queue.find(j => j.id === jobId);
    if (!job) return;

    if (job.status === 'generating' && job.es) {
      try { job.es.close(); } catch {}
      job.es = null;
      // Reset chapter status back to what it was before
      const ch = chapters.find(c => c.id === job.chapterId);
      if (ch && ch.status === 'generating') {
        ch.status = 'draft';
        API.chapters.update(ch.id, { status: 'draft' }).catch(() => {});
      }
      renderChapterList();
    }

    queue = queue.filter(j => j.id !== jobId);
    renderQueue();
    renderChapterList();

    // Restore Generate button if the cancelled chapter is currently open
    if (selectedChapterId === job.chapterId) {
      const genBtn = document.getElementById('generate-chapter-btn');
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.innerHTML = `<span class="material-symbols-outlined icon-sm">queue_play_next</span>Generate`;
      }
    }
  }

  /** Remove all done / error jobs from the queue list. */
  function clearDoneJobs() {
    queue = queue.filter(j => j.status === 'pending' || j.status === 'generating');
    renderQueue();
  }

  /** Toggle queue panel expand/collapse. */
  function toggleQueue() {
    queueExpanded = !queueExpanded;
    const listEl   = document.getElementById('queue-list');
    const chevron  = document.getElementById('queue-chevron');
    if (listEl)  listEl.style.display = queueExpanded ? '' : 'none';
    if (chevron) chevron.style.transform = queueExpanded ? '' : 'rotate(180deg)';
  }

  /** Sequential queue runner — processes one job at a time. */
  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    try {
      while (true) {
        const job = queue.find(j => j.status === 'pending');
        if (!job) break;
        await processJob(job);
      }
    } finally {
      queueRunning = false;
    }
  }

  /** Process a single queue job via EventSource; resolves when done or errored. */
  function processJob(job) {
    return new Promise((resolve) => {
      job.status = 'generating';
      renderQueue();

      const ch = chapters.find(c => c.id === job.chapterId);
      if (ch) {
        ch.status = 'generating';
        renderChapterList();
        selectChapterListItem(selectedChapterId); // keep current selection highlighted
      }

      // Disable generate button on currently open chapter
      if (selectedChapterId === job.chapterId) {
        const genBtn = document.getElementById('generate-chapter-btn');
        if (genBtn) {
          genBtn.disabled = true;
          genBtn.innerHTML = `<span class="material-symbols-outlined icon-sm">hourglass_top</span>Generating…`;
        }
      }

      const es = API.chapters.generateStream(job.chapterId, false);
      job.es = es;

      API.streamEvents(es, {
        onProgress: (data) => {
          job.progress = data.percent || 50;
          renderQueue();
          // Live status on currently open chapter
          if (selectedChapterId === job.chapterId) {
            const statusEl = document.getElementById('chapter-gen-status');
            if (statusEl) statusEl.innerHTML = `${spinnerHTML(14)} ${data.message || 'Generating…'}`;
          }
        },
        onDone: (data) => {
          job.status = 'done';
          job.es = null;
          if (ch) {
            ch.status          = 'ready';
            ch.audio_path      = data.audio_path || true;
            ch.duration_seconds = data.duration_seconds;
          }
          renderChapterList();
          renderQueue();

          // Update open editor
          if (selectedChapterId === job.chapterId) {
            const statusEl = document.getElementById('chapter-gen-status');
            const genBtn   = document.getElementById('generate-chapter-btn');
            if (statusEl) statusEl.innerHTML = `
              <span class="text-primary flex items-center gap-1">
                <span class="material-symbols-outlined icon-sm icon-fill">check_circle</span>Audio ready
              </span>`;
            if (genBtn) {
              genBtn.disabled = false;
              genBtn.innerHTML = `<span class="material-symbols-outlined icon-sm">queue_play_next</span>Generate`;
            }
            refreshAudioPlayer(job.chapterId);
            // Update word count area duration
            const durEl = document.getElementById('chapter-dur');
            if (!durEl && data.duration_seconds) {
              const wcEl = document.getElementById('word-count');
              if (wcEl?.parentElement) {
                const durSpan = document.createElement('span');
                durSpan.className = 'flex items-center gap-1';
                durSpan.innerHTML = `<span class="material-symbols-outlined icon-sm" style="font-size:12px">schedule</span>${fmtDuration(data.duration_seconds)}`;
                wcEl.parentElement.appendChild(durSpan);
              }
            }
          }
          resolve();
        },
        onError: (err) => {
          job.status = 'error';
          job.error  = err.message;
          job.es     = null;
          if (ch) {
            ch.status = 'error';
            renderChapterList();
          }
          renderQueue();

          if (selectedChapterId === job.chapterId) {
            const statusEl = document.getElementById('chapter-gen-status');
            const genBtn   = document.getElementById('generate-chapter-btn');
            if (statusEl) statusEl.innerHTML = `<span class="text-error text-xs">${escHtml(err.message)}</span>`;
            if (genBtn) {
              genBtn.disabled = false;
              genBtn.innerHTML = `<span class="material-symbols-outlined icon-sm">queue_play_next</span>Generate`;
            }
          }
          Toast.error(`"${job.title}" failed: ${err.message}`);
          resolve();
        },
      });
    });
  }

  /** Re-render queue panel UI. */
  function renderQueue() {
    const listEl    = document.getElementById('queue-list');
    const badgeEl   = document.getElementById('queue-count-badge');
    const clearBtn  = document.getElementById('queue-clear-btn');
    if (!listEl) return;

    const pending    = queue.filter(j => j.status === 'pending').length;
    const generating = queue.filter(j => j.status === 'generating').length;
    const done       = queue.filter(j => j.status === 'done' || j.status === 'error').length;

    // Badge
    if (badgeEl) {
      const active = pending + generating;
      if (queue.length > 0) {
        badgeEl.textContent = active > 0 ? active : queue.length;
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.classList.add('hidden');
      }
    }

    // Clear-done button
    if (clearBtn) clearBtn.style.display = done > 0 ? 'inline-flex' : 'none';

    // Empty state
    if (queue.length === 0) {
      listEl.innerHTML = `
        <div class="py-3 text-center">
          <p class="text-xs text-subtle">No jobs in queue.</p>
          <p class="text-xs text-subtle">Assign a voice and click Generate.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = queue.map(job => {
      let icon = '';
      let extra = '';

      switch (job.status) {
        case 'generating':
          icon  = `<div class="flex-shrink-0 w-4 flex items-center justify-center mt-0.5">${spinnerHTML(13)}</div>`;
          extra = `<div class="progress-bar mt-1"><div class="progress-fill-indeterminate"></div></div>`;
          break;
        case 'done':
          icon = `<span class="material-symbols-outlined text-primary icon-fill flex-shrink-0 mt-0.5" style="font-size:14px">check_circle</span>`;
          break;
        case 'error':
          icon  = `<span class="material-symbols-outlined text-error icon-fill flex-shrink-0 mt-0.5" style="font-size:14px">error</span>`;
          extra = `<p class="text-xs text-error truncate mt-0.5">${escHtml(job.error || 'Error')}</p>`;
          break;
        default: // pending
          icon = `<span class="w-2 h-2 rounded-full bg-outline-variant flex-shrink-0 mt-1.5 ml-1"></span>`;
      }

      return `
        <div class="queue-item">
          ${icon}
          <div class="flex-1 min-w-0">
            <p class="text-xs font-medium text-on-surface truncate">${escHtml(job.title)}</p>
            <p class="text-xs text-muted truncate">${escHtml(job.voiceName)}</p>
            ${extra}
          </div>
          ${job.status === 'pending' ? `
            <button class="btn-icon w-5 h-5 flex-shrink-0" title="Cancel"
                    onclick="BoothPage.cancelQueueJob('${job.id}')">
              <span class="material-symbols-outlined" style="font-size:12px">close</span>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // ── Add / Delete Chapter ───────────────────────────────────────────────────

  async function addChapter() {
    autoSaveCurrent();
    const title = `Chapter ${chapters.length + 1}`;
    try {
      const res = await API.chapters.add(projectId, [{ title, text: '', voice_id: null }]);
      const newCh = res.chapters?.[0] || { id: res.id, title, text: '', voice_id: null, status: 'draft' };
      chapters.push(newCh);
      renderChapterList();
      selectChapter(newCh.id);
      Toast.info('Chapter added.');
    } catch (err) {
      Toast.error('Failed to add chapter: ' + err.message);
    }
  }

  async function deleteChapter(chapterId) {
    const ch = chapters.find(c => c.id === chapterId);
    const ok = await confirmDialog('Delete Chapter',
      `Delete <strong>${escHtml(ch?.title || 'this chapter')}</strong>?`);
    if (!ok) return;

    // Cancel any queue job for this chapter
    const job = queue.find(j => j.chapterId === chapterId);
    if (job) cancelQueueJob(job.id);

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
      { label: 'Chapter N  (Chapter 1, Chapter 2…)', value: '^(Chapter|CHAPTER)\\s+\\d+' },
      { label: 'CHAPTER IN CAPS', value: '^CHAPTER\\s+' },
      { label: 'Numbered (1. or 1:)', value: '^\\d+[.:]' },
      { label: 'Part N', value: '^(Part|PART)\\s+\\d+' },
      { label: 'Roman numerals (I. II. III.)', value: '^[IVXLCDM]+\\.' },
    ];

    Modal.show({
      title: 'Import &amp; Split Text',
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
                value="^(Chapter|CHAPTER)\\s+\\d+" placeholder="regex…"/>
            </div>
            <select id="import-preset" class="field-select text-sm flex-shrink-0" style="min-width:180px">
              <option value="">— Presets —</option>
              ${PRESETS.map(p => `<option value="${escHtml(p.value)}">${escHtml(p.label)}</option>`).join('')}
            </select>
          </div>

          <div class="flex items-center gap-3 flex-wrap">
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

          <div id="import-preview-result" class="hidden bg-surface-container-low rounded-xl p-4 max-h-52 overflow-y-auto">
            <p class="text-xs font-label text-muted mb-2">Detected chapters:</p>
            <div id="import-chapters-preview"></div>
          </div>
        </div>
      `,
      actions: [
        { id: 'cancel', label: 'Cancel',           onClick: () => Modal.close() },
        { id: 'import', label: 'Import chapters',  primary: true, onClick: doImport },
      ],
    });

    document.getElementById('import-preset').onchange = (e) => {
      if (e.target.value) document.getElementById('import-pattern').value = e.target.value;
    };
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

    const result = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].title.length;
      const end   = i + 1 < matches.length ? matches[i + 1].index : text.length;
      result.push({ title: matches[i].title, text: text.slice(start, end).trim() });
    }
    return result;
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
      <div class="flex gap-2 text-xs py-1 border-b border-outline-variant/20 last:border-0">
        <span class="text-subtle flex-shrink-0 font-label w-5 text-right">${i + 1}</span>
        <div>
          <span class="font-semibold text-on-surface">${escHtml(ch.title)}</span>
          <span class="text-subtle ml-2">${escHtml(ch.text.slice(0, 80).replace(/\n/g, ' '))}…</span>
        </div>
      </div>
    `).join('') + (result.length > 30
      ? `<p class="text-xs text-subtle mt-2">…and ${result.length - 30} more</p>` : '');
  }

  async function doImport() {
    const text    = document.getElementById('import-raw-text').value.trim();
    const pattern = document.getElementById('import-pattern').value;
    const mode    = document.querySelector('input[name="import-mode"]:checked')?.value || 'append';

    if (!text) { Toast.error('Please paste some text first.'); return; }

    const result = splitTextByPattern(text, pattern);
    if (!result?.length) { Toast.error('No chapters detected. Check your pattern.'); return; }

    Modal.setActionDisabled('import', true);
    Modal.setActionLabel('import', `Importing ${result.length} chapters…`);

    try {
      if (mode === 'replace') {
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

  // ── Export Modal ───────────────────────────────────────────────────────────

  function openExportModal() {
    const readyCount = chapters.filter(c => c.status === 'ready').length;
    const totalSecs  = chapters
      .filter(c => c.status === 'ready' && c.duration_seconds)
      .reduce((s, c) => s + c.duration_seconds, 0);

    Modal.show({
      title: 'Export Audiobook',
      width: 'max-w-lg',
      body: `
        <div class="flex flex-col gap-4">

          <!-- Summary card -->
          <div class="bg-surface-container-low rounded-xl p-4">
            <p class="text-sm font-semibold text-on-surface mb-1">${escHtml(projectData?.title || 'Audiobook')}</p>
            <div class="flex items-center gap-4 text-xs text-muted">
              <span>${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}</span>
              <span class="text-outline-variant">·</span>
              <span>${readyCount} with audio</span>
              ${totalSecs > 0 ? `<span class="text-outline-variant">·</span><span>${fmtDuration(totalSecs)} total</span>` : ''}
            </div>
            ${readyCount < chapters.length ? `
              <p class="text-xs text-error mt-2 flex items-center gap-1">
                <span class="material-symbols-outlined icon-sm">warning</span>
                ${chapters.length - readyCount} chapter(s) without audio will be skipped.
              </p>` : ''}
            ${readyCount === 0 ? `
              <p class="text-xs text-error mt-2 flex items-center gap-1">
                <span class="material-symbols-outlined icon-sm">error</span>
                No chapters have audio yet. Generate audio first.
              </p>` : ''}
          </div>

          <!-- Format -->
          <div>
            <label class="field-label">Format</label>
            <select id="export-format" class="field-select w-full">
              <option value="m4b">M4B — Audiobook (Apple Books, Overcast, chapters &amp; cover art)</option>
              <option value="mp3zip">MP3 ZIP — Individual chapter files</option>
            </select>
          </div>

          <!-- Quality -->
          <div>
            <label class="field-label">Audio quality</label>
            <select id="export-quality" class="field-select w-full">
              <option value="128k">Standard · 128 kbps</option>
              <option value="256k">High · 256 kbps</option>
              <option value="64k">Small · 64 kbps</option>
            </select>
          </div>

          <p class="text-xs text-muted flex items-center gap-1.5">
            <span class="material-symbols-outlined icon-sm">info</span>
            Requires <strong>ffmpeg</strong> in your PATH.
          </p>
        </div>
      `,
      actions: [
        { id: 'cancel',     label: 'Cancel',        onClick: () => Modal.close() },
        { id: 'export-go',  label: 'Export',  primary: true,
          disabled: readyCount === 0, onClick: startExport },
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
            title:       'Save Audiobook',
            defaultPath: `${projectData?.title || 'audiobook'}.m4b`,
            filters:     [{ name: 'Audiobook', extensions: ['m4b'] }],
          });
          if (!result.canceled && result.filePath) {
            await fetch(`${API.BASE}/api/export/move`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ src: data.output_path, dest: result.filePath }),
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
    renderQueue();  // initialise queue UI

    if (chapters.length > 0) selectChapter(chapters[0].id);
  }

  // ── Mount / Unmount ────────────────────────────────────────────────────────

  function mount(params) {
    projectId = params.projectId;

    document.getElementById('add-chapter-btn').onclick  = addChapter;
    document.getElementById('import-text-btn').onclick  = openImportModal;
    document.getElementById('queue-all-btn').onclick    = enqueueAll;
    document.getElementById('export-btn').onclick       = openExportModal;

    loadAll(params);
  }

  function unmount() {
    autoSaveCurrent();

    // Cancel active queue jobs
    queue.forEach(job => {
      if (job.es) { try { job.es.close(); } catch {} }
    });
    queue        = [];
    queueRunning = false;

    if (sortable) { sortable.destroy(); sortable = null; }
    chapterPlayer?.destroy();
    Object.values(activeGenerations).forEach(es => { try { es.close(); } catch {} });
    activeGenerations = {};

    chapters          = [];
    voices            = [];
    selectedChapterId = null;
    projectData       = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    render, mount, unmount,
    selectChapter, addChapter, deleteChapter,
    openImportModal, openExportModal,
    enqueueAll, enqueueChapters,
    cancelQueueJob, clearDoneJobs, toggleQueue,
  };
})();
