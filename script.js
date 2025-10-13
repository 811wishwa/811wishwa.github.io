(() => {
  const STORAGE_KEY = 'linkSaverChat';
  const THEME_KEY = 'linkSaverChat_theme_v1';
  const PREVIEW_CACHE_KEY = 'linkSaverChat_previewCache_v1';

  /**
   * State schema (backward-compatible):
   * categories: string[] (includes 'General' and 'Starred')
   * lastCategory: string
   * links: Record<string, Array<Message>>
   * Message: {
   *   id: string,
   *   time?: number,
   *   text?: string,
   *   starred?: boolean,
   *   // legacy single-link fields
   *   url?: string, title?: string, image?: string, description?: string, status?: 'ok'|'pending'|'error',
   *   // new multi-link support
   *   links?: Array<{ url: string, title?: string, image?: string, description?: string, status?: 'ok'|'pending'|'error' }>
   * }
   */
  let state = loadState();

  // Elements
  const chatEl = document.getElementById('chat');
  const linkInput = document.getElementById('linkInput');
  const sendBtn = document.getElementById('sendBtn');
  const offlineBadge = document.getElementById('offlineBadge');
  // Header controls
  const searchToggle = document.getElementById('searchToggle');
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsClose = document.getElementById('settingsClose');
  const themeToggle = document.getElementById('themeToggle');
  const clearDataBtn = document.getElementById('clearDataBtn');
  // Selection bar + actions
  const selectionBar = document.getElementById('selectionBar');
  const selectionCount = document.getElementById('selectionCount');
  const actionStar = document.getElementById('actionStar');
  const actionCopy = document.getElementById('actionCopy');
  const actionShare = document.getElementById('actionShare');
  const actionDelete = document.getElementById('actionDelete');

  // Dropdown elements
  const dropdown = document.getElementById('categoryDropdown');
  const categoryToggle = document.getElementById('categoryToggle');
  const categoryMenu = document.getElementById('categoryMenu');
  const categoryList = document.getElementById('categoryList');
  const currentCategoryLabel = document.getElementById('currentCategoryLabel');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const newCategoryRow = document.getElementById('newCategoryRow');
  const newCategoryInput = document.getElementById('newCategoryInput');
  const confirmAddCategory = document.getElementById('confirmAddCategory');

  // Instant preview elements
  const instantPreview = document.getElementById('instantPreview');
  const previewThumb = document.getElementById('previewThumb');
  const previewTitle = document.getElementById('previewTitle');
  const previewDesc = document.getElementById('previewDesc');
  const previewSend = document.getElementById('previewSend');
  const previewDismiss = document.getElementById('previewDismiss');

  /** @type {null | {url:string,title:string,image:string,description:string,status:'ok'|'pending'|'error'}} */
  let currentPreview = null;

  // Internal UI state
  let searchQuery = '';
  /** @type {Map<string,string>} id -> category */
  const selectedIds = new Map();

  // Theme init
  applySavedTheme();

  // Ensure special category exists
  if (!state.categories.includes('Starred')) {
    state.categories.push('Starred');
  }

  // Initialize
  setCurrentCategory(state.lastCategory || state.categories[0]);
  // Ensure MRU ordering on first load so lastCategory is first in the list
  if (state.lastCategory) {
    state.categories = [state.lastCategory, ...state.categories.filter(c => c !== state.lastCategory)];
  }
  renderCategoryDropdown();
  renderMessages(state.lastCategory);
  updateOnlineBadge();
  registerServiceWorker();

  // Dropdown open/close
  categoryToggle.addEventListener('click', () => {
    const open = dropdown.classList.toggle('open');
    categoryToggle.setAttribute('aria-expanded', String(open));
    categoryMenu.setAttribute('aria-hidden', String(!open));
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      categoryToggle.setAttribute('aria-expanded', 'false');
      categoryMenu.setAttribute('aria-hidden', 'true');
    }
  });

  // Add category UI
  addCategoryBtn.addEventListener('click', () => {
    newCategoryRow.classList.toggle('hidden');
    if (!newCategoryRow.classList.contains('hidden')) {
      setTimeout(() => newCategoryInput.focus(), 0);
    }
  });
  confirmAddCategory.addEventListener('click', onConfirmAddCategory);
  newCategoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onConfirmAddCategory();
    if (e.key === 'Escape') { newCategoryInput.value = ''; newCategoryRow.classList.add('hidden'); }
  });

  // Category list actions (select/delete)
  categoryList.addEventListener('click', (e) => {
    /** @type {HTMLElement} */
    const target = e.target;
    // Delete category
    if (target.closest && target.closest('[data-action="delete-category"]')) {
      const li = target.closest('li');
      const name = li?.dataset?.name;
      if (!name) return;
      if (name === 'General') { alert('Cannot delete the default category.'); return; }
      const confirmed = confirm(`Delete category "${name}" and all its links?`);
      if (!confirmed) return;
      deleteCategory(name);
      return;
    }
    // Select category
    const li = target.closest('li');
    if (!li) return;
    const name = li.dataset.name;
    if (!name) return;
    selectCategory(name);
  });

  function onConfirmAddCategory(){
    const name = newCategoryInput.value.trim();
    if (!name) return;
    if (state.categories.includes(name)) { alert('Category already exists.'); return; }
    state.categories.unshift(name);
    state.links[name] = [];
    setCurrentCategory(name);
    saveState();
    renderCategoryDropdown();
    renderMessages(name);
    newCategoryInput.value = '';
    newCategoryRow.classList.add('hidden');
    dropdown.classList.remove('open');
  }

  function deleteCategory(name){
    if (name === 'General' || name === 'Starred') { alert('Cannot delete this category.'); return; }
    state.categories = state.categories.filter(c => c !== name);
    delete state.links[name];
    if (state.lastCategory === name) {
      const next = state.categories[0] || 'General';
      setCurrentCategory(next);
    }
    saveState();
    renderCategoryDropdown();
    renderMessages(state.lastCategory);
  }

  function selectCategory(name){
    // MRU: move to front
    state.categories = [name, ...state.categories.filter(c => c !== name)];
    setCurrentCategory(name);
    saveState();
    renderCategoryDropdown();
    // fade transition
    chatEl.style.animation = 'fadeIn .12s ease-in';
    setTimeout(() => chatEl.style.animation = '', 200);
    renderMessages(name);
    dropdown.classList.remove('open');
    clearSelection();
    if (searchQuery) searchInput.focus();
  }

  function setCurrentCategory(name){
    state.lastCategory = name;
    currentCategoryLabel.textContent = name;
  }

  function renderCategoryDropdown(){
    categoryList.innerHTML = '';
    for (const name of state.categories){
      const li = document.createElement('li');
      li.className = 'category-item';
      li.dataset.name = name;

      const left = document.createElement('div');
      left.className = 'category-name';
      left.textContent = name;
      li.appendChild(left);

      const actions = document.createElement('div');
      actions.className = 'category-actions';
      if (name !== 'General' && name !== 'Starred'){
        const del = document.createElement('button');
        del.className = 'icon-btn';
        del.setAttribute('data-action','delete-category');
        del.setAttribute('title','Delete');
        del.textContent = '🗑';
        actions.appendChild(del);
      }
      li.appendChild(actions);
      categoryList.appendChild(li);
    }
  }

  function renderMessages(category){
    chatEl.innerHTML = '';
    const entries = collectMessages(category);
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? entries.filter(({msg}) => messageMatchesQuery(msg, q)) : entries;
    for (const { msg, category: cat } of filtered){
      chatEl.appendChild(renderMessageBubble(msg, cat));
    }
    scrollChatToBottom();
  }

  function renderMessageBubble(msg, categoryOfMsg){
    const wrapper = document.createElement('div');
    wrapper.className = 'message mine';
    wrapper.dataset.id = msg.id;
    wrapper.dataset.category = categoryOfMsg || state.lastCategory;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    // Star badge
    if (msg.starred) {
      const star = document.createElement('div');
      star.className = 'star-badge';
      star.textContent = '⭐';
      bubble.appendChild(star);
    }

    // Text content
    if (msg.text && msg.text.trim()){
      const p = document.createElement('div');
      p.style.whiteSpace = 'pre-wrap';
      p.style.marginBottom = (msg.links?.length || msg.url) ? '8px' : '0';
      p.textContent = msg.text;
      bubble.appendChild(p);
    }

    const linkCards = [];
    if (Array.isArray(msg.links) && msg.links.length){
      for (const link of msg.links){
        linkCards.push(createPreviewCard(link));
      }
    } else if (msg.url){
      linkCards.push(createPreviewCard({ url: msg.url, title: msg.title, description: msg.description, image: msg.image, status: msg.status }));
    }

    for (const card of linkCards){ bubble.appendChild(card); }

    // Selection interactions
    wrapper.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleSelect(wrapper, /*multi*/ true); });
    enableLongPress(wrapper, () => toggleSelect(wrapper, /*multi*/ true));
    wrapper.addEventListener('click', (e) => {
      if (selectionBarVisible()) {
        e.preventDefault();
        toggleSelect(wrapper, e.ctrlKey || e.metaKey || true);
      }
    });

    wrapper.appendChild(bubble);
    return wrapper;
  }

  function createPreviewCard(link){
    const card = document.createElement('div');
    card.className = 'preview-card';

    const img = document.createElement('img');
    img.className = 'thumb';
    if (link.image) img.src = link.image; else img.style.display = 'none';
    img.alt = '';

    const info = document.createElement('div');
    info.className = 'info';

    const title = document.createElement('p');
    title.className = 'title';
    const a = document.createElement('a');
    a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = link.title || link.url;
    title.appendChild(a);

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = link.description || '';

    const status = document.createElement('div');
    status.className = 'status-text';
    if (link.status === 'pending') status.textContent = 'Preview pending';
    if (link.status === 'error') { status.textContent = 'Preview unavailable'; status.classList.add('status-error'); }
    if (link.status === 'ok') status.style.display = 'none';

    info.appendChild(title);
    info.appendChild(desc);
    info.appendChild(status);

    card.appendChild(img);
    card.appendChild(info);
    return card;
  }

  function scrollChatToBottom(){
    setTimeout(() => { chatEl.scrollTop = chatEl.scrollHeight; }, 0);
  }

  // Input + sending
  sendBtn.addEventListener('click', onSend);
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onSend();
  });

  // Instant preview on paste
  linkInput.addEventListener('paste', async (e) => {
    const text = (e.clipboardData?.getData('text') || '').trim();
    if (!text) return;
    const firstUrl = extractUrls(text)[0];
    if (!firstUrl) return;
    const normalized = normalizeUrl(firstUrl);
    showInstantPreview({ url: normalized, title: 'Fetching preview…', description: '', image: '', status: 'pending' });
    if (!navigator.onLine) return; // Show pending until we go online
    try{
      const meta = await fetchPreview(normalized);
      showInstantPreview(meta);
    }catch(err){
      showInstantPreview({ url: normalized, title: 'Preview unavailable', description: '', image: '', status: 'error' });
    }
  });

  previewDismiss.addEventListener('click', () => hideInstantPreview());
  previewSend.addEventListener('click', () => onSend());

  async function onSend(){
    const inputText = (linkInput.value || '').trim();
    const urls = extractUrls(inputText);
    const textOnly = inputText.replace(urlRegexGlobal(), '').replace(/\s+/g, ' ').trim();

    const message = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      time: Date.now(),
      text: textOnly || (urls.length ? '' : inputText),
      starred: false,
    };

    if (urls.length === 0 && !message.text){
      // Maybe user relied on instant preview
      const urlFromPreview = currentPreview?.url;
      if (!urlFromPreview) return;
      urls.push(urlFromPreview);
    }

    sendBtn.disabled = true;
    try{
      if (urls.length === 1){
        // Keep legacy single-link fields for compatibility
        const url = normalizeUrl(urls[0]);
        let meta = currentPreview && currentPreview.url === url ? currentPreview : getCachedPreview(url);
        if (!meta){
          meta = navigator.onLine ? await safeFetchPreview(url) : { url, title: url, description: '', image: '', status: 'pending' };
        }
        Object.assign(message, { url, title: meta.title || url, image: meta.image || '', description: meta.description || '', status: meta.status || 'ok' });
      } else if (urls.length > 1){
        message.links = urls.map((raw) => {
          const url = normalizeUrl(raw);
          const cached = getCachedPreview(url);
          if (cached) return { url, title: cached.title || url, description: cached.description || '', image: cached.image || '', status: 'ok' };
          return { url, title: url, description: '', image: '', status: navigator.onLine ? 'pending' : 'pending' };
        });
      }

      const cat = state.lastCategory;
      state.links[cat] = state.links[cat] || [];
      state.links[cat].push(message);
      saveState();
      chatEl.appendChild(renderMessageBubble(message, cat));
      scrollChatToBottom();
      linkInput.value = '';
      hideInstantPreview();

      // Kick off async fetches for any pending links
      if (urls.length){
        if (message.links){
          // multi-link
          for (let i = 0; i < message.links.length; i++){
            const link = message.links[i];
            if (link.status === 'pending'){
              safeFetchPreview(link.url).then((meta) => {
                link.title = meta.title; link.description = meta.description; link.image = meta.image; link.status = 'ok';
                saveState();
                replaceMessageNode(message.id, cat);
              }).catch(() => {
                link.status = 'error'; saveState(); replaceMessageNode(message.id, cat);
              });
            }
          }
        } else if (message.status === 'pending'){
          safeFetchPreview(message.url).then((meta) => {
            message.title = meta.title; message.description = meta.description; message.image = meta.image; message.status = 'ok';
            saveState(); replaceMessageNode(message.id, cat);
          }).catch(() => { message.status = 'error'; saveState(); replaceMessageNode(message.id, cat); });
        }
      }
    } finally{
      sendBtn.disabled = false;
    }
  }

  function showInstantPreview(meta){
    currentPreview = meta;
    previewTitle.textContent = meta.title || meta.url || 'Link';
    previewDesc.textContent = meta.description || '';
    if (meta.image) {
      previewThumb.src = meta.image; previewThumb.style.display = '';
    } else { previewThumb.removeAttribute('src'); previewThumb.style.display = 'none'; }
    instantPreview.classList.remove('hidden');
  }
  function hideInstantPreview(){ currentPreview = null; instantPreview.classList.add('hidden'); }

  function isLikelyUrl(str){
    try{ new URL(str); return true; }catch{ return false; }
  }
  function normalizeUrl(str){
    const s = str.trim();
    if (/^https?:\/\//i.test(s)) return s;
    // If user typed domain without scheme, add https
    if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s;
    return s;
  }

  function urlRegexGlobal(){
    // Simple URL detection for http(s) or bare domains
    return /(https?:\/\/[^\s,]+|[\w.-]+\.[a-z]{2,}(?:\/\S*)?)/gi;
  }
  function extractUrls(text){
    const urls = [];
    const re = urlRegexGlobal();
    let m; let guard = 0;
    while ((m = re.exec(text)) && guard++ < 100){
      const u = normalizeUrl(m[0]);
      if (isLikelyUrl(u) && !urls.includes(u)) urls.push(u);
    }
    return urls;
  }

  function getPreviewCache(){
    try{ return JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || '{}'); }catch{ return {}; }
  }
  function setPreviewCache(cache){
    try{ localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache)); }catch{}
  }
  function getCachedPreview(url){
    const cache = getPreviewCache();
    const entry = cache[url];
    if (entry && typeof entry === 'object') return entry;
    return null;
  }
  function savePreviewToCache(meta){
    const cache = getPreviewCache();
    cache[meta.url] = { url: meta.url, title: meta.title, description: meta.description, image: meta.image };
    setPreviewCache(cache);
  }
  async function safeFetchPreview(url){
    try{
      const meta = await fetchPreview(url);
      savePreviewToCache(meta);
      return meta;
    }catch(err){
      // final failure still throws
      throw err;
    }
  }
  async function fetchPreview(url){
    // primary: jsonlink, fallback: microlink
    try{
      const j = await tryFetchJsonlink(url);
      return j;
    }catch{
      const m = await tryFetchMicrolink(url);
      return m;
    }
  }
  async function tryFetchJsonlink(url){
    const endpoint = 'https://jsonlink.io/api/extract?url=' + encodeURIComponent(url);
    const res = await fetch(endpoint, { headers: { 'accept':'application/json' } });
    if (!res.ok) throw new Error('jsonlink failed');
    const data = await res.json();
    const image = (Array.isArray(data.images) && data.images[0]) || data.image || data.icon || '';
    const title = data.title || (data.url ? new URL(data.url).hostname : new URL(url).hostname);
    const description = data.description || '';
    return { url, title, description, image, status:'ok' };
  }
  async function tryFetchMicrolink(url){
    const endpoint = 'https://api.microlink.io/?url=' + encodeURIComponent(url);
    const res = await fetch(endpoint, { headers: { 'accept':'application/json' } });
    if (!res.ok) throw new Error('microlink failed');
    const data = await res.json();
    const d = data.data || {};
    const image = (d.image && (d.image.url || d.image)) || d.logo?.url || '';
    const title = d.title || (d.url ? new URL(d.url).hostname : new URL(url).hostname);
    const description = d.description || '';
    return { url, title, description, image, status:'ok' };
  }

  // Online/offline
  window.addEventListener('online', () => { updateOnlineBadge(); syncPendingPreviews(); });
  window.addEventListener('offline', updateOnlineBadge);

  function updateOnlineBadge(){
    const isOnline = navigator.onLine;
    offlineBadge.classList.toggle('hidden', isOnline);
  }

  async function syncPendingPreviews(){
    if (!navigator.onLine) return;
    let changed = false;
    for (const category of state.categories){
      if (category === 'Starred') continue;
      const list = state.links[category] || [];
      for (const item of list){
        if (Array.isArray(item.links) && item.links.length){
          for (const link of item.links){
            if (link.status === 'pending'){
              try{
                const meta = await fetchPreview(link.url);
                link.title = meta.title; link.description = meta.description; link.image = meta.image; link.status = 'ok';
                changed = true; savePreviewToCache(meta);
                if (category === state.lastCategory || state.lastCategory === 'Starred') replaceMessageNode(item.id, category);
              }catch{ link.status = 'error'; changed = true; if (category === state.lastCategory || state.lastCategory === 'Starred') replaceMessageNode(item.id, category); }
            }
          }
        } else if (item.status === 'pending'){
          try{
            const meta = await fetchPreview(item.url);
            item.title = meta.title; item.description = meta.description; item.image = meta.image; item.status = 'ok';
            changed = true; savePreviewToCache(meta);
            if (category === state.lastCategory || state.lastCategory === 'Starred') replaceMessageNode(item.id, category);
          }catch{ item.status = 'error'; changed = true; if (category === state.lastCategory || state.lastCategory === 'Starred') replaceMessageNode(item.id, category); }
        }
      }
    }
    if (changed) saveState();
  }

  function replaceMessageNode(id, category){
    const node = chatEl.querySelector(`[data-id="${id}"]`);
    if (!node) return;
    // find the message from state
    const list = state.links[category] || [];
    const msg = list.find(m => m.id === id);
    if (!msg) return;
    const newNode = renderMessageBubble(msg, category);
    node.replaceWith(newNode);
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        // normalize
        parsed.categories = Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : ['General'];
        if (!parsed.categories.includes('Starred')) parsed.categories.push('Starred');
        parsed.lastCategory = parsed.lastCategory || parsed.categories[0];
        parsed.links = parsed.links || {};
        for (const c of parsed.categories){ if (c !== 'Starred') parsed.links[c] = Array.isArray(parsed.links[c]) ? parsed.links[c] : []; }
        // migrate messages
        for (const c of Object.keys(parsed.links)){
          const list = parsed.links[c];
          if (!Array.isArray(list)) { parsed.links[c] = []; continue; }
          for (const m of list){
            if (!m.id) m.id = String(Date.now()) + Math.random().toString(36).slice(2);
            if (typeof m.starred !== 'boolean') m.starred = false;
            if (typeof m.time !== 'number') m.time = Date.now();
            // legacy field name alignment: keep as-is
            if (m.links && !Array.isArray(m.links)) delete m.links;
          }
        }
        return parsed;
      }
    }catch{ /* ignore */ }
    // initial
    const init = { categories:['General','Starred'], lastCategory:'General', links: { 'General': [] } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }

  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{ /* ignore quota errors */ }
  }

  // Service worker registration
  function registerServiceWorker(){
    if ('serviceWorker' in navigator){
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
      });
    }
  }

  // Search UI
  if (searchToggle){
    searchToggle.addEventListener('click', () => {
      const willShow = searchBar.classList.contains('hidden');
      searchBar.classList.toggle('hidden');
      if (willShow) setTimeout(() => searchInput.focus(), 0);
      if (!willShow) { searchInput.value = ''; searchQuery = ''; renderMessages(state.lastCategory); }
    });
  }
  if (searchInput){
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value || '';
      renderMessages(state.lastCategory);
    });
  }

  function messageMatchesQuery(msg, q){
    const hay = [];
    if (msg.text) hay.push(msg.text);
    if (msg.url) hay.push(msg.url);
    if (msg.title) hay.push(msg.title);
    if (msg.description) hay.push(msg.description);
    if (Array.isArray(msg.links)){
      for (const l of msg.links){
        if (l.url) hay.push(l.url);
        if (l.title) hay.push(l.title);
        if (l.description) hay.push(l.description);
      }
    }
    return hay.join('\n').toLowerCase().includes(q);
  }

  function collectMessages(category){
    if (category === 'Starred'){
      const out = [];
      for (const c of state.categories){
        if (c === 'Starred') continue;
        for (const msg of (state.links[c] || [])){
          if (msg.starred) out.push({ msg, category: c });
        }
      }
      return out;
    }
    return (state.links[category] || []).map(msg => ({ msg, category }));
  }

  // Selection logic
  function selectionBarVisible(){ return !selectionBar.classList.contains('hidden'); }
  function updateSelectionBar(){
    const count = selectedIds.size;
    selectionCount.textContent = `${count} selected`;
    selectionBar.classList.toggle('hidden', count === 0);
  }
  function clearSelection(){
    selectedIds.clear();
    chatEl.querySelectorAll('.selected').forEach(n => n.classList.remove('selected'));
    updateSelectionBar();
  }
  function toggleSelect(wrapper, multi){
    const id = wrapper.dataset.id; const cat = wrapper.dataset.category || state.lastCategory;
    const isSelected = selectedIds.has(id);
    if (!multi && selectedIds.size > 0 && !isSelected) clearSelection();
    if (isSelected){ selectedIds.delete(id); wrapper.classList.remove('selected'); }
    else { selectedIds.set(id, cat); wrapper.classList.add('selected'); }
    updateSelectionBar();
  }
  function enableLongPress(el, handler){
    let timer = 0; let startX=0, startY=0;
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
      timer = window.setTimeout(() => handler(), 350);
    });
    const clear = () => { if (timer) { clearTimeout(timer); timer = 0; } };
    el.addEventListener('touchend', clear); el.addEventListener('touchcancel', clear); el.addEventListener('touchmove', (e) => {
      const t = e.touches[0]; if (Math.hypot(t.clientX-startX, t.clientY-startY) > 10) clear();
    });
  }
  actionDelete.addEventListener('click', () => {
    if (!selectedIds.size) return;
    const confirmed = confirm(`Delete ${selectedIds.size} message(s)?`);
    if (!confirmed) return;
    for (const [id, cat] of selectedIds){
      const list = state.links[cat] || [];
      state.links[cat] = list.filter(m => m.id !== id);
    }
    saveState();
    clearSelection();
    renderMessages(state.lastCategory);
  });
  actionStar.addEventListener('click', () => {
    if (!selectedIds.size) return;
    // If any unstarred, star all; else unstar all
    let anyUnstarred = false;
    for (const [id, cat] of selectedIds){
      const msg = (state.links[cat] || []).find(m => m.id === id);
      if (msg && !msg.starred) { anyUnstarred = true; break; }
    }
    for (const [id, cat] of selectedIds){
      const msg = (state.links[cat] || []).find(m => m.id === id);
      if (msg) msg.starred = anyUnstarred;
    }
    saveState();
    renderMessages(state.lastCategory);
  });
  actionCopy.addEventListener('click', async () => {
    if (!selectedIds.size) return;
    const lines = [];
    for (const [id, cat] of selectedIds){
      const msg = (state.links[cat] || []).find(m => m.id === id);
      if (!msg) continue;
      if (msg.text) lines.push(msg.text);
      if (msg.url) lines.push(msg.url);
      if (Array.isArray(msg.links)) for (const l of msg.links){ lines.push(l.url); }
    }
    const text = lines.join('\n');
    try{ await navigator.clipboard.writeText(text); }catch{ /* ignore */ }
    clearSelection();
  });
  actionShare.addEventListener('click', async () => {
    if (!selectedIds.size) return;
    const lines = [];
    for (const [id, cat] of selectedIds){
      const msg = (state.links[cat] || []).find(m => m.id === id);
      if (!msg) continue;
      if (msg.text) lines.push(msg.text);
      if (msg.url) lines.push(msg.url);
      if (Array.isArray(msg.links)) for (const l of msg.links){ lines.push(l.url); }
    }
    const text = lines.join('\n');
    if (navigator.share){
      try{ await navigator.share({ text }); }catch{ /* ignore */ }
    } else {
      try{ await navigator.clipboard.writeText(text); }catch{ /* ignore */ }
    }
    clearSelection();
  });

  // Settings panel and theme
  function applySavedTheme(){
    const saved = localStorage.getItem(THEME_KEY) || '';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const mode = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(mode);
    if (themeToggle) themeToggle.checked = mode === 'dark';
  }
  function applyTheme(mode){
    document.body.classList.toggle('theme-dark', mode === 'dark');
    try{ localStorage.setItem(THEME_KEY, mode); }catch{}
  }
  if (settingsBtn){ settingsBtn.addEventListener('click', openSettings); }
  if (settingsClose){ settingsClose.addEventListener('click', closeSettings); }
  if (settingsOverlay){ settingsOverlay.addEventListener('click', closeSettings); }
  function openSettings(){ settingsOverlay.classList.add('show'); settingsOverlay.classList.remove('hidden'); settingsPanel.classList.add('show'); settingsPanel.classList.remove('hidden'); }
  function closeSettings(){ settingsOverlay.classList.remove('show'); settingsPanel.classList.remove('show'); setTimeout(() => { settingsOverlay.classList.add('hidden'); settingsPanel.classList.add('hidden'); }, 200); }
  if (themeToggle){ themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked ? 'dark' : 'light')); }
  if (clearDataBtn){ clearDataBtn.addEventListener('click', () => {
    const ok = confirm('Clear all local data? This cannot be undone.');
    if (!ok) return;
    try{
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PREVIEW_CACHE_KEY);
    }catch{}
    location.reload();
  }); }
})();
