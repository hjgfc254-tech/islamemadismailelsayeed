/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — طبقة المرفقات (Attachments Layer) — V7 — ملف جديد
   ───────────────────────────────────────────────────────────────
   الغرض:
   • تخزين الصور والفيديو المرفقة بالطلبات خارج LocalStorage.
   • IndexedDB كقاعدة، لا DataURL داخل LocalStorage.
   • ربط كل مرفق بمعرّف الطلب (reqId) وبمسودة اختيارية (draftId).
   • معاينة، حذف، استرجاع، حد أقصى، تحقق النوع والحجم.

   الواجهة العامة (AT):
   • AT.addFiles(reqId, files, opts)   → Promise<{ ok, added[], errors[] }>
   • AT.listForReq(reqId)              → Promise<Attachment[]>
   • AT.get(id)                        → Promise<Attachment|null>
   • AT.getBlobUrl(id)                 → Promise<string|null>  (URL للمعاينة، يُحرَّر عند الإنهاء)
   • AT.remove(id)                     → Promise<boolean>
   • AT.removeForReq(reqId)            → Promise<number>       (حذف كل مرفقات طلب)
   • AT.migrateDraftAttachments(draftId, reqId) → Promise<number>
   • AT.limits()                       → { maxFiles, maxImageMB, maxVideoMB, acceptImage, acceptVideo }
   • AT.validateFiles(files, existingCount) → { ok:boolean, valid[], errors[] }
   • AT.stats(reqId)                   → Promise<{count, bytes}>
   • AT.clearAll()                     → Promise<void>        (اختبار/إعادة ضبط)

   ملاحظات تصميمية:
   • كل مرفق يحمل: { id, reqId, draftId?, kind:'image'|'video', name, mime, size, thumb, createdAt, blob }
     - thumb: صورة مصغّرة (Base64 صغيرة <= 30KB) تُستخدم لتفادي قراءة الـ blob عند العرض المتكرر.
     - blob: الملف الأصلي كـ Blob.
   • الصور المصغّرة تُعاد للواجهة كـ objectURLs عند الطلب، وعلى الواجهة تحريرها.
   • هذه الطبقة لا تعرف شيئاً عن MP أو الواجهة. مستقلة تماماً، قابلة للاستبدال بـ API لاحقاً.
   • عند فشل IndexedDB (متصفح قديم/خاص)، تعمل الطبقة في وضع ذاكرة (in-memory) وتُعلم الواجهة بذلك.
   • عند رفع الأصلي إلى Backend مستقبلاً: تُستبدل addFiles/listForReq فقط، وتبقى الواجهة كما هي.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const AT = (() => {
  const DB_NAME = 'hs_attachments_v1';
  const DB_VERSION = 1;
  const STORE = 'files';

  /* ═════════ حدود الاستخدام (متوافقة مع متطلبات المرحلة 2 — الخطوة 6) ═════════ */
  const LIMITS = {
    maxFiles: 6,                /* حد أقصى شامل لكل طلب */
    maxImageMB: 8,              /* حجم أقصى للصورة الواحدة */
    maxVideoMB: 40,             /* حجم أقصى للفيديو الواحد */
    maxVideoCount: 1,           /* فيديو واحد على الأكثر لكل طلب */
    acceptImage: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
    acceptVideo: 'video/mp4,video/quicktime,video/webm',
    thumbMaxSide: 320,          /* بكسلات أقصى للبُعد الأكبر في المصغّرة */
    thumbQuality: 0.72,
    thumbMaxBytes: 30 * 1024    /* حجم أقصى معقول للمصغّرة Base64 */
  };
  const IMAGE_MIMES = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
  const VIDEO_MIMES = new Set(['video/mp4','video/quicktime','video/webm']);

  /* ═════════ حالة الاتصال ═════════ */
  let db = null;
  let memoryMode = false;
  const memory = new Map();       /* id → record (fallback) */
  let readyPromise = null;

  /* ═════════ أدوات ═════════ */
  const nowIso = () => new Date().toISOString();
  const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const bytesToMB = b => b / (1024 * 1024);
  const isImage = f => f.type && IMAGE_MIMES.has(f.type);
  const isVideo = f => f.type && VIDEO_MIMES.has(f.type);
  const clampSize = (b, maxMB) => b <= maxMB * 1024 * 1024;
  const byCreatedAsc = (a,b) => (a.createdAt < b.createdAt ? -1 : 1);

  /* ═════════ اتصال IndexedDB ═════════ */
  const openDB = () => {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(resolve => {
      if (typeof indexedDB === 'undefined') { memoryMode = true; return resolve(null); }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch { memoryMode = true; return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath:'id' });
          s.createIndex('reqId', 'reqId', { unique:false });
          s.createIndex('draftId', 'draftId', { unique:false });
          s.createIndex('createdAt', 'createdAt', { unique:false });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror   = () => { memoryMode = true; resolve(null); };
      req.onblocked = () => { memoryMode = true; resolve(null); };
    });
    return readyPromise;
  };

  /* ═════════ مساعدات المتجر ═════════ */
  const withStore = (mode, fn) => new Promise((resolve, reject) => {
    openDB().then(() => {
      if (memoryMode || !db) {
        try { resolve(fn(null)); } catch(e) { reject(e); }
        return;
      }
      let tx;
      try { tx = db.transaction(STORE, mode); } catch(e) { return reject(e); }
      const store = tx.objectStore(STORE);
      let out;
      try { out = fn(store); } catch(e) { return reject(e); }
      tx.oncomplete = () => resolve(out);
      tx.onerror     = () => reject(tx.error || new Error('tx error'));
      tx.onabort     = () => reject(tx.error || new Error('tx aborted'));
    }).catch(reject);
  });

  const putRecord = (rec) => withStore('readwrite', store => {
    if (memoryMode || !store) { memory.set(rec.id, rec); return rec; }
    store.put(rec); return rec;
  });

  const getRecord = (id) => new Promise(resolve => {
    openDB().then(() => {
      if (memoryMode || !db) return resolve(memory.get(id) || null);
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  });

  const deleteRecord = (id) => withStore('readwrite', store => {
    if (memoryMode || !store) { memory.delete(id); return true; }
    store.delete(id); return true;
  });

  const allRecords = () => new Promise(resolve => {
    openDB().then(() => {
      if (memoryMode || !db) return resolve(Array.from(memory.values()));
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  });

  /* ═════════ إنشاء مصغّرة للصورة (Base64) ═════════
     لا نُخزّن DataURL للصورة الأصلية — فقط مصغّرة صغيرة للعرض السريع. */
  const makeThumb = file => new Promise(resolve => {
    if (!isImage(file)) return resolve('');
    let url;
    try { url = URL.createObjectURL(file); } catch { return resolve(''); }
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = LIMITS.thumbMaxSide;
        const ratio = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width||1) * ratio));
        const h = Math.max(1, Math.round((img.height||1) * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#140d16'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img, 0, 0, w, h);
        let data = canvas.toDataURL('image/jpeg', LIMITS.thumbQuality);
        if (data.length > LIMITS.thumbMaxBytes * 1.4) {
          data = canvas.toDataURL('image/jpeg', 0.55);
        }
        URL.revokeObjectURL(url);
        resolve(data);
      } catch { try { URL.revokeObjectURL(url); } catch {} resolve(''); }
    };
    img.onerror = () => { try { URL.revokeObjectURL(url); } catch {} resolve(''); };
    img.src = url;
  });

  /* ═════════ التحقق من الملفات قبل الإضافة ═════════ */
  const validateFiles = (files, existingCount = 0) => {
    const valid = [], errors = [];
    const arr = Array.from(files || []);
    const existingImages = existingCount;
    let toAdd = 0;
    for (const f of arr) {
      if (!f) continue;
      const kind = isImage(f) ? 'image' : isVideo(f) ? 'video' : null;
      if (!kind) { errors.push({ name:f.name||'', reason:'صيغة غير مدعومة' }); continue; }
      if (kind === 'image' && !clampSize(f.size, LIMITS.maxImageMB)) {
        errors.push({ name:f.name||'', reason:`الصورة أكبر من ${LIMITS.maxImageMB}MB` }); continue;
      }
      if (kind === 'video' && !clampSize(f.size, LIMITS.maxVideoMB)) {
        errors.push({ name:f.name||'', reason:`الفيديو أكبر من ${LIMITS.maxVideoMB}MB` }); continue;
      }
      if (existingCount + toAdd >= LIMITS.maxFiles) {
        errors.push({ name:f.name||'', reason:`الحد الأقصى ${LIMITS.maxFiles} مرفقات لكل طلب` }); continue;
      }
      valid.push(f);
      toAdd++;
    }
    return { ok: errors.length === 0, valid, errors };
  };

  /* ═════════ إضافة ملفات ═════════
     opts = { draftId?, existingCount? }   (existingCount يُستخدم عند الإضافة لمسودة قبل إنشاء الطلب)
     يعيد قائمة السجلات المضافة + أخطاء التحقق. */
  const addFiles = async (reqId, files, opts = {}) => {
    await openDB();
    const existing = reqId ? await listForReq(reqId) : [];
    const draftId = opts.draftId || '';
    const existingVideos = existing.filter(x => x.kind === 'video').length;
    const existingImgs   = existing.filter(x => x.kind === 'image').length;

    const { valid, errors } = validateFiles(files, existing.length);
    const added = [];
    let videoAdded = 0;

    for (const f of valid) {
      if (isVideo(f) && existingVideos + videoAdded >= LIMITS.maxVideoCount) {
        errors.push({ name:f.name||'', reason:`الحد الأقصى ${LIMITS.maxVideoCount} فيديو لكل طلب` });
        continue;
      }
      const id = uid('att');
      const thumb = isImage(f) ? await makeThumb(f) : '';
      const rec = {
        id, reqId: reqId || '', draftId,
        kind: isImage(f) ? 'image' : 'video',
        name: f.name || ('attachment-' + Date.now()),
        mime: f.type || '',
        size: f.size || 0,
        thumb,
        createdAt: nowIso(),
        blob: f
      };
      try { await putRecord(rec); added.push(rec); }
      catch(e) { errors.push({ name:rec.name, reason:'تعذّر الحفظ' }); }
      if (rec.kind === 'video') videoAdded++;
    }
    return { ok: added.length > 0, added, errors };
  };

  /* ═════════ قراءة ═════════ */
  const listForReq = async (reqId) => {
    await openDB();
    const all = await allRecords();
    return all.filter(x => x.reqId === reqId).sort(byCreatedAsc);
  };

  const get = async (id) => { await openDB(); return getRecord(id); };

  const getBlobUrl = async (id) => {
    const rec = await getRecord(id);
    if (!rec || !rec.blob) return null;
    try { return URL.createObjectURL(rec.blob); } catch { return null; }
  };

  const stats = async (reqId) => {
    const list = await listForReq(reqId);
    return { count: list.length, bytes: list.reduce((s,x)=>s+(x.size||0),0) };
  };

  /* ═════════ حذف ═════════ */
  const remove = async (id) => {
    try { await deleteRecord(id); return true; } catch { return false; }
  };

  const removeForReq = async (reqId) => {
    await openDB();
    const all = await allRecords();
    const ids = all.filter(x => x.reqId === reqId).map(x => x.id);
    let n = 0;
    for (const id of ids) { if (await remove(id)) n++; }
    return n;
  };

  /* ═════════ ترحيل مرفقات المسودة إلى الطلب بعد الإرسال ═════════ */
  const migrateDraftAttachments = async (draftId, reqId) => {
    if (!draftId || !reqId) return 0;
    await openDB();
    const all = await allRecords();
    let n = 0;
    for (const rec of all.filter(x => x.draftId === draftId && !x.reqId)) {
      rec.reqId = reqId; rec.draftId = '';
      try { await putRecord(rec); n++; } catch {}
    }
    return n;
  };

  /* ═════════ إعادة الضبط الكامل (اختبار/إعادة تهيئة) ═════════ */
  const clearAll = async () => {
    await openDB();
    if (memoryMode || !db) { memory.clear(); return; }
    await new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  };

  /* ═════════ واجهة عامة ═════════ */
  return {
    limits: () => ({ ...LIMITS }),
    validateFiles,
    addFiles, listForReq, get, getBlobUrl, remove, removeForReq,
    migrateDraftAttachments, stats, clearAll,
    /* تشخيص/إفادة الواجهة بحالة التخزين */
    isMemoryMode: () => memoryMode,
    /* تحويل مرفقات إلى ملخص آمن للعرض بدون Blob (لحفظه في الطلب) */
    toSummary: (rec) => rec ? ({
      id: rec.id, kind: rec.kind, name: rec.name, mime: rec.mime,
      size: rec.size, thumb: rec.thumb, createdAt: rec.createdAt
    }) : null
  };
})();