/* ── narrAItor API client ──────────────────────────────────────────────────
   Thin wrapper around fetch() that points to the Python FastAPI server.
   All methods return a Promise that resolves to parsed JSON or throws.
────────────────────────────────────────────────────────────────────────── */

const API = (() => {
  const PORT = 4892;
  const BASE = `http://localhost:${PORT}`;

  async function request(method, path, body, opts = {}) {
    const url = `${BASE}${path}`;
    const headers = {};
    let bodyData;

    if (body instanceof FormData) {
      bodyData = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyData = JSON.stringify(body);
    }

    const res = await fetch(url, { method, headers, body: bodyData, ...opts });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.detail || err.error || msg;
      } catch {}
      throw new Error(msg);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res;
  }

  const get  = (path)       => request('GET',    path);
  const post = (path, body) => request('POST',   path, body);
  const put  = (path, body) => request('PUT',    path, body);
  const del  = (path)       => request('DELETE', path);

  // ── Server ────────────────────────────────────────────────────────────────

  const ping    = () => get('/api/ping');
  const getInfo = () => get('/api/info');

  // ── Models ────────────────────────────────────────────────────────────────

  const models = {
    list:   ()        => get('/api/models'),
    delete: (id)      => del(`/api/models/${encodeURIComponent(id)}`),

    /** Returns an EventSource for download progress.
     *  Events: { status:'downloading'|'done'|'error', percent:number, message:string } */
    downloadStream(modelId, source = 'huggingface') {
      const url = `${BASE}/api/models/${encodeURIComponent(modelId)}/download?source=${source}`;
      return new EventSource(url);
    },
  };

  // ── Voices ────────────────────────────────────────────────────────────────

  const voices = {
    list:   ()           => get('/api/voices'),
    create: (data)       => post('/api/voices', data),
    update: (id, data)   => put(`/api/voices/${id}`, data),
    delete: (id)         => del(`/api/voices/${id}`),

    /** Generate preview audio. Returns { audio_url, duration } */
    preview: (id, text)  => post(`/api/voices/${id}/preview`, { text }),

    /** Create a preview for a not-yet-saved voice config */
    previewDraft: (config, text) => post('/api/voices/preview-draft', { config, text }),

    audioUrl: (id) => `${BASE}/api/voices/${id}/audio`,
  };

  // ── Projects ──────────────────────────────────────────────────────────────

  const projects = {
    list:   ()         => get('/api/projects'),
    get:    (id)       => get(`/api/projects/${id}`),
    create: (data)     => post('/api/projects', data),
    update: (id, data) => put(`/api/projects/${id}`, data),
    delete: (id)       => del(`/api/projects/${id}`),

    uploadCover(id, file) {
      const fd = new FormData();
      fd.append('file', file);
      return request('POST', `/api/projects/${id}/cover`, fd);
    },
    coverUrl: (id) => `${BASE}/api/projects/${id}/cover?t=${Date.now()}`,
  };

  // ── Chapters ──────────────────────────────────────────────────────────────

  const chapters = {
    list:    (projectId)         => get(`/api/chapters/${projectId}`),
    add:     (projectId, items)  => post(`/api/chapters/${projectId}`, { chapters: items }),
    update:  (chapterId, data)   => put(`/api/chapters/${chapterId}`, data),
    delete:  (chapterId)         => del(`/api/chapters/${chapterId}`),
    reorder: (projectId, ids)    => post(`/api/chapters/${projectId}/reorder`, { ids }),

    /** Returns EventSource streaming: { status, percent, message } */
    generateStream(chapterId, preview = false) {
      const url = `${BASE}/api/chapters/${chapterId}/generate?preview=${preview}`;
      return new EventSource(url);
    },

    audioUrl: (chapterId) => `${BASE}/api/chapters/${chapterId}/audio?t=${Date.now()}`,
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exports = {
    /** Returns EventSource: { status, percent, message, output_path? } */
    m4bStream(projectId, opts = {}) {
      const params = new URLSearchParams({ bitrate: opts.bitrate || '128k' });
      return new EventSource(`${BASE}/api/export/${projectId}/m4b?${params}`);
    },
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Consume an EventSource and call callbacks. Returns a cancel fn. */
  function streamEvents(source, { onProgress, onDone, onError }) {
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === 'done')  { source.close(); onDone?.(data); }
        else if (data.status === 'error') { source.close(); onError?.(new Error(data.error || 'Unknown error')); }
        else onProgress?.(data);
      } catch {}
    };
    source.onerror = (e) => {
      source.close();
      onError?.(new Error('Stream connection error'));
    };
    return () => source.close();
  }

  return { ping, getInfo, models, voices, projects, chapters, exports, streamEvents, BASE };
})();
