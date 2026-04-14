/* ── Books Page — Audiobook Library ──────────────────────────────────────── */

const BooksPage = (() => {

  const GENRES = ['Fiction', 'Non-Fiction', 'Fantasy', 'Science Fiction', 'Mystery', 'Thriller', 'Romance', 'Historical', 'Biography', 'Self-Help', 'Children', 'Classic', 'Other'];

  let projects = [];
  let coverFiles = {}; // { pending cover file before save }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    return `
      <div class="h-full overflow-y-auto bg-background">
        <div class="max-w-5xl mx-auto px-8 py-10">

          <div class="flex items-end justify-between mb-8">
            <div>
              <h1 class="font-headline text-3xl font-bold text-on-surface mb-1">Library</h1>
              <p class="text-sm text-muted">Your audiobook projects.</p>
            </div>
            <button class="btn-primary" id="new-book-btn">
              <span class="material-symbols-outlined icon-sm">add</span>New Book
            </button>
          </div>

          <div id="books-grid" class="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
            <div class="col-span-full flex items-center justify-center gap-3 py-16 text-muted">
              ${spinnerHTML(24)} Loading library…
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ── Book Cards ─────────────────────────────────────────────────────────────

  function renderBookCard(p) {
    const chapterWord = p.chapter_count === 1 ? 'chapter' : 'chapters';
    const cover = p.has_cover ? API.projects.coverUrl(p.id) : null;

    return `
      <div class="card-hover flex flex-col overflow-hidden" onclick="BooksPage.openBooth('${p.id}', ${JSON.stringify(escHtml(p.title))})">

        <!-- Cover -->
        <div class="w-full aspect-[3/4] cover-placeholder relative overflow-hidden">
          ${cover
            ? `<img src="${cover}" class="w-full h-full object-cover" alt="Cover" onerror="this.style.display='none'"/>`
            : `<div class="w-full h-full flex flex-col items-center justify-center p-4">
                <span class="material-symbols-outlined icon-lg text-primary/40 mb-2">menu_book</span>
                <p class="text-xs font-headline font-semibold text-primary/60 text-center leading-tight">${escHtml(p.title)}</p>
               </div>`
          }
        </div>

        <!-- Info -->
        <div class="p-4 flex-1 flex flex-col">
          <h3 class="font-headline font-semibold text-sm text-on-surface leading-snug mb-0.5 line-clamp-2">${escHtml(p.title)}</h3>
          <p class="text-xs text-muted mb-2">${escHtml(p.author || 'Unknown author')}</p>
          <div class="mt-auto flex items-center justify-between">
            <span class="text-xs font-label text-subtle">${p.chapter_count || 0} ${chapterWord}</span>
            <button class="btn-icon opacity-0 group-hover:opacity-100" title="Delete" onclick="event.stopPropagation(); BooksPage.deleteBook('${p.id}')">
              <span class="material-symbols-outlined icon-sm" style="color:#a83836">delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="col-span-full text-center py-24">
        <div class="w-20 h-20 rounded-full cover-placeholder mx-auto mb-5 flex items-center justify-center">
          <span class="material-symbols-outlined text-primary/40" style="font-size:32px">auto_stories</span>
        </div>
        <h3 class="font-headline font-semibold text-lg text-on-surface mb-2">Your library is empty</h3>
        <p class="text-sm text-muted mb-8 max-w-xs mx-auto">Create your first audiobook project and start narrating.</p>
        <button class="btn-primary mx-auto" id="empty-new-book-btn">
          <span class="material-symbols-outlined icon-sm">add</span>Create your first book
        </button>
      </div>
    `;
  }

  // ── New/Edit Book Modal ────────────────────────────────────────────────────

  function openNewBookModal(editProject = null) {
    const isEdit = !!editProject;
    let pendingCoverFile = null;

    Modal.show({
      title: isEdit ? 'Edit Book' : 'New Audiobook',
      width: 'max-w-xl',
      body: `
        <div class="flex gap-5">
          <!-- Cover upload -->
          <div class="flex-shrink-0">
            <div id="cover-preview" class="w-24 h-32 rounded-xl cover-placeholder flex items-center justify-center overflow-hidden cursor-pointer relative group"
                 onclick="document.getElementById('cover-file-input').click()" title="Click to upload cover">
              ${isEdit && editProject.has_cover
                ? `<img src="${API.projects.coverUrl(editProject.id)}" class="w-full h-full object-cover" id="cover-img"/>`
                : `<span class="material-symbols-outlined text-primary/40 icon-lg">add_photo_alternate</span>`
              }
              <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                <span class="material-symbols-outlined text-white icon-sm">edit</span>
              </div>
            </div>
            <input type="file" id="cover-file-input" class="hidden" accept="image/*"/>
            <p class="text-xs text-subtle text-center mt-1.5">Cover art</p>
          </div>

          <!-- Fields -->
          <div class="flex-1 flex flex-col gap-4">
            <div>
              <label class="field-label">Title <span class="text-error">*</span></label>
              <input type="text" id="book-title" class="field-input" placeholder="e.g. The Great Adventure" value="${escHtml(editProject?.title || '')}"/>
            </div>
            <div>
              <label class="field-label">Author</label>
              <input type="text" id="book-author" class="field-input" placeholder="e.g. Jane Doe" value="${escHtml(editProject?.author || '')}"/>
            </div>
            <div>
              <label class="field-label">Genre</label>
              <select id="book-genre" class="field-select w-full">
                <option value="">Select genre…</option>
                ${GENRES.map(g => `<option ${editProject?.genre === g ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <label class="field-label">Description <span class="text-subtle font-label text-xs">(optional)</span></label>
          <textarea id="book-description" class="field-textarea text-sm" rows="3"
            placeholder="A short synopsis…">${escHtml(editProject?.description || '')}</textarea>
        </div>
      `,
      actions: [
        { id: 'cancel', label: 'Cancel', onClick: () => Modal.close() },
        { id: 'save',   label: isEdit ? 'Save changes' : 'Create Book', primary: true, onClick: () => saveBook(editProject, pendingCoverFile) },
      ],
    });

    // Cover upload
    document.getElementById('cover-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      pendingCoverFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('cover-preview');
        const existing = preview.querySelector('img') || document.createElement('img');
        existing.id = 'cover-img';
        existing.src = ev.target.result;
        existing.className = 'w-full h-full object-cover';
        if (!preview.querySelector('img')) {
          preview.innerHTML = '';
          preview.appendChild(existing);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function saveBook(editProject, coverFile) {
    const title = document.getElementById('book-title').value.trim();
    if (!title) { Toast.error('Title is required.'); return; }

    Modal.setActionDisabled('save', true);
    Modal.setActionLabel('save', 'Saving…');

    try {
      const data = {
        title,
        author:      document.getElementById('book-author').value.trim(),
        genre:       document.getElementById('book-genre').value,
        description: document.getElementById('book-description').value.trim(),
      };

      let project;
      if (editProject) {
        project = await API.projects.update(editProject.id, data);
      } else {
        project = await API.projects.create(data);
      }

      // Upload cover if selected
      if (coverFile) {
        try { await API.projects.uploadCover(project.id, coverFile); } catch {}
      }

      Modal.close();
      Toast.success(editProject ? 'Book updated.' : `"${title}" created!`);
      await loadProjects();
    } catch (err) {
      Toast.error('Failed to save: ' + err.message);
      Modal.setActionDisabled('save', false);
      Modal.setActionLabel('save', editProject ? 'Save changes' : 'Create Book');
    }
  }

  // ── Open Booth ─────────────────────────────────────────────────────────────

  function openBooth(projectId, projectTitle) {
    App.navigate('booth', { projectId, projectTitle: decodeURIComponent(projectTitle) });
  }

  // ── Delete Book ────────────────────────────────────────────────────────────

  async function deleteBook(projectId) {
    const project = projects.find(p => p.id === projectId);
    const ok = await confirmDialog('Delete Book', `Permanently delete <strong>${escHtml(project?.title || projectId)}</strong> and all its chapters?`);
    if (!ok) return;
    try {
      await API.projects.delete(projectId);
      Toast.success('Book deleted.');
      await loadProjects();
    } catch (err) {
      Toast.error('Delete failed: ' + err.message);
    }
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadProjects() {
    const grid = document.getElementById('books-grid');
    if (!grid) return;

    try {
      const res = await API.projects.list();
      projects = res.projects || [];

      if (projects.length === 0) {
        grid.innerHTML = renderEmptyState();
        document.getElementById('empty-new-book-btn')?.addEventListener('click', () => openNewBookModal());
      } else {
        grid.innerHTML = projects.map(p => `<div class="group">${renderBookCard(p)}</div>`).join('');
      }
    } catch (err) {
      grid.innerHTML = `<div class="col-span-full py-12 text-center text-sm text-error">Could not load library. Is the AI engine running?</div>`;
    }
  }

  // ── Mount / Unmount ────────────────────────────────────────────────────────

  function mount() {
    document.getElementById('new-book-btn').onclick = () => openNewBookModal();
    loadProjects();
  }

  function unmount() {}

  return { render, mount, unmount, openBooth, deleteBook };
})();
