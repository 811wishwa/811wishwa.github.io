(() => {
  const STORAGE_KEY = 'linkSaverChat';

  /** @type {{categories: string[], lastCategory: string, links: Record<string, Array<{id:string,url:string,title:string,image:string,description:string,status:'ok'|'pending'|'error'}>>}} */
  let state = loadState();

  // Elements
  const chatEl = document.getElementById('chat');
  const linkInput = document.getElementById('linkInput');
  const sendBtn = document.getElementById('sendBtn');
  const offlineBadge = document.getElementById('offlineBadge');

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
      if (name !== 'General'){
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
    const msgs = state.links[category] || [];
    for (const msg of msgs){
      chatEl.appendChild(renderMessageBubble(msg));
    }
    scrollChatToBottom();
  }

  function renderMessageBubble(msg){
    const wrapper = document.createElement('div');
    wrapper.className = 'message mine';
    wrapper.dataset.id = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const del = document.createElement('button');
    del.className = 'delete-msg';
    del.title = 'Delete';
    del.textContent = '🗑';
    del.addEventListener('click', () => deleteMessage(msg.id));

    const card = document.createElement('div');
    card.className = 'preview-card';

    const img = document.createElement('img');
    img.className = 'thumb';
    if (msg.image) img.src = msg.image; else img.style.display = 'none';
    img.alt = '';

    const info = document.createElement('div');
    info.className = 'info';

    const title = document.createElement('p');
    title.className = 'title';
    const a = document.createElement('a');
    a.href = msg.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = msg.title || msg.url;
    title.appendChild(a);

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = msg.description || '';

    const status = document.createElement('div');
    status.className = 'status-text';
    if (msg.status === 'pending') status.textContent = 'Preview pending';
    if (msg.status === 'error') { status.textContent = 'Preview unavailable'; status.classList.add('status-error'); }
    if (msg.status === 'ok') status.style.display = 'none';

    info.appendChild(title);
    info.appendChild(desc);
    info.appendChild(status);

    card.appendChild(img);
    card.appendChild(info);

    bubble.appendChild(del);
    bubble.appendChild(card);

    wrapper.appendChild(bubble);
    return wrapper;
  }

  function deleteMessage(id){
    const cat = state.lastCategory;
    const list = state.links[cat] || [];
    state.links[cat] = list.filter(m => m.id !== id);
    saveState();
    const node = chatEl.querySelector(`[data-id="${id}"]`);
    if (node) node.remove();
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
    const normalized = normalizeUrl(text);
    if (!isLikelyUrl(normalized)) return;
    showInstantPreview({ url: normalized, title: 'Fetching preview…', description: '', image: '', status: navigator.onLine ? 'pending' : 'pending' });
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
    const raw = (linkInput.value || currentPreview?.url || '').trim();
    if (!raw) return;
    const url = normalizeUrl(raw);
    if (!isLikelyUrl(url)) { alert('Please enter a valid URL.'); return; }

    sendBtn.disabled = true;
    try{
      let meta = currentPreview && currentPreview.url === url ? currentPreview : null;
      if (!meta){
        if (navigator.onLine) {
          try{ meta = await fetchPreview(url); }catch{ meta = { url, title: url, description: '', image: '', status:'error' }; }
        } else {
          meta = { url, title: url, description: '', image: '', status:'pending' };
        }
      }
      const message = { id: String(Date.now()) + Math.random().toString(36).slice(2), url, title: meta.title || url, image: meta.image || '', description: meta.description || '', status: meta.status };
      const cat = state.lastCategory;
      state.links[cat] = state.links[cat] || [];
      state.links[cat].push(message);
      saveState();
      chatEl.appendChild(renderMessageBubble(message));
      scrollChatToBottom();
      linkInput.value = '';
      hideInstantPreview();
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

  async function fetchPreview(url){
    const endpoint = 'https://jsonlink.io/api/extract?url=' + encodeURIComponent(url);
    const res = await fetch(endpoint, { headers: { 'accept':'application/json' } });
    if (!res.ok) throw new Error('Preview fetch failed');
    const data = await res.json();
    const image = (Array.isArray(data.images) && data.images[0]) || data.image || data.icon || '';
    const title = data.title || (data.url ? new URL(data.url).hostname : new URL(url).hostname);
    const description = data.description || '';
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
      const list = state.links[category] || [];
      for (const item of list){
        if (item.status === 'pending'){
          try{
            const meta = await fetchPreview(item.url);
            item.title = meta.title; item.description = meta.description; item.image = meta.image; item.status = 'ok';
            changed = true;
            // Update UI if visible
            if (category === state.lastCategory){
              const node = chatEl.querySelector(`[data-id="${item.id}"]`);
              if (node){
                const newNode = renderMessageBubble(item);
                node.replaceWith(newNode);
              }
            }
          }catch{
            item.status = 'error';
            changed = true;
          }
        }
      }
    }
    if (changed) saveState();
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        // normalize
        parsed.categories = Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : ['General'];
        parsed.lastCategory = parsed.lastCategory || parsed.categories[0];
        parsed.links = parsed.links || {};
        for (const c of parsed.categories){ parsed.links[c] = parsed.links[c] || []; }
        return parsed;
      }
    }catch{ /* ignore */ }
    // initial
    const init = { categories:['General'], lastCategory:'General', links: { 'General': [] } };
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
})();
