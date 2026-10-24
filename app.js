(() => {
  "use strict";
  const STORAGE_KEY = "oneclick-organizer-items-v1";
  const CATEGORIES = [
    { name: "영감", icon: "🌷", color: "#e7a8bc", keywords: ["디자인","영감","아이디어","레퍼런스","inspiration","design","art","creative","색상","폰트"] },
    { name: "공부", icon: "📚", color: "#9d8ad1", keywords: ["공부","강의","수업","학교","시험","자료","학습","코딩","개발","tutorial","course","study","learn","교육"] },
    { name: "일", icon: "💻", color: "#83b8b1", keywords: ["업무","프로젝트","일","기획","회의","문서","생산성","work","project","github","업무"] },
    { name: "생활", icon: "🏡", color: "#e5b57f", keywords: ["요리","레시피","생활","정리","청소","여행","건강","쇼핑","식단","recipe","home","travel"] },
    { name: "취미", icon: "🎨", color: "#d5a2d2", keywords: ["취미","음악","영화","책","게임","사진","그림","운동","hobby","music","movie","photo"] },
    { name: "기타", icon: "🪴", color: "#aab4a0", keywords: [] }
  ];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  let items = loadItems();
  let activeFilter = "all";
  let activeCategory = "";
  let currentType = "link";
  let viewMode = "grid";
  let toastTimer;

  const els = {
    modal: $("#modalBackdrop"), form: $("#itemForm"), title: $("#itemTitle"), url: $("#itemUrl"),
    description: $("#itemDescription"), tags: $("#itemTags"), category: $("#itemCategory"),
    favorite: $("#itemFavorite"), type: $("#itemType"), urlField: $("#urlField"),
    duplicateWarning: $("#duplicateWarning"), search: $("#searchInput"), container: $("#itemsContainer"),
    empty: $("#emptyState"), duplicateNotice: $("#duplicateNotice")
  };

  function loadItems() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter(x => x && typeof x.id === "string") : [];
    } catch (error) { return []; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); return true; }
    catch (error) { showToast("저장 공간이 부족해요. 백업 후 불필요한 자료를 정리해 주세요."); return false; }
  }
  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  }
  function normalizeUrl(value) {
    try {
      const url = new URL(value.trim());
      if (!["http:", "https:"].includes(url.protocol)) return null;
      url.hash = "";
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
    } catch (_) { return null; }
  }
  function getDuplicate(url, excludeId = "") {
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    return items.find(item => item.type === "link" && item.id !== excludeId && normalizeUrl(item.url || "") === normalized) || null;
  }
  function categoryFor(title, description, tags) {
    const text = `${title} ${description} ${tags.join(" ")}`.toLowerCase();
    let best = { name: "기타", score: 0 };
    for (const category of CATEGORIES) {
      const score = category.keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? (keyword.length > 3 ? 2 : 1) : 0), 0);
      if (score > best.score) best = { name: category.name, score };
    }
    return best.name;
  }
  function categoryInfo(name) { return CATEGORIES.find(c => c.name === name) || CATEGORIES[CATEGORIES.length - 1]; }
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,"0")}.${String(date.getDate()).padStart(2,"0")}`;
  }
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function getFilteredItems() {
    const query = els.search.value.trim().toLowerCase();
    let filtered = items.filter(item => {
      if (activeFilter === "favorite" && !item.favorite) return false;
      if (activeFilter === "recent" && Date.now() - item.createdAt > 7 * 86400000) return false;
      if (activeCategory && item.category !== activeCategory) return false;
      if (!query) return true;
      const haystack = [item.title, item.description, item.url, item.category, ...(item.tags || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
    const sort = $("#sortSelect").value;
    filtered.sort((a,b) => {
      if (sort === "oldest") return a.createdAt - b.createdAt;
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      if (sort === "favorite") return Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt;
      return b.createdAt - a.createdAt;
    });
    return filtered;
  }
  function render() {
    renderCounts();
    renderCategoryNavigation();
    renderCategorySummary();
    const filtered = getFilteredItems();
    $("#resultCount").textContent = `${filtered.length}개의 자료`;
    $("#sectionTitle").textContent = getViewTitle();
    $("#currentViewLabel").textContent = getViewTitle();
    els.container.classList.toggle("list-view", viewMode === "list");
    els.container.innerHTML = filtered.map(renderItem).join("");
    els.empty.hidden = filtered.length > 0;
    els.container.hidden = filtered.length === 0;
    updateDuplicateNotice();
  }
  function getViewTitle() {
    if (activeCategory) return `${categoryInfo(activeCategory).icon} ${activeCategory}`;
    if (activeFilter === "favorite") return "♡ 즐겨찾기";
    if (activeFilter === "recent") return "◷ 최근 추가";
    return "모든 자료";
  }
  function renderCounts() {
    $("#allCount").textContent = items.length;
    $("#favoriteCount").textContent = items.filter(i => i.favorite).length;
    $("#statTotal").textContent = items.length;
    $("#statFavorites").textContent = items.filter(i => i.favorite).length;
    $("#statNotes").textContent = items.filter(i => i.type === "note").length;
    $("#statCategories").textContent = new Set(items.map(i => i.category)).size;
  }
  function renderCategoryNavigation() {
    const counts = {};
    items.forEach(item => counts[item.category] = (counts[item.category] || 0) + 1);
    $("#categoryList").innerHTML = CATEGORIES.filter(c => c.name !== "기타" || counts[c.name]).map(c => `
      <button class="category-filter ${activeCategory === c.name ? "active" : ""}" data-category="${escapeHTML(c.name)}">
        <span>${c.icon}</span> ${escapeHTML(c.name)} <span class="cat-count">${counts[c.name] || 0}</span>
      </button>`).join("");
  }
  function renderCategorySummary() {
    const counts = CATEGORIES.map(c => ({...c, count: items.filter(i => i.category === c.name).length})).filter(c => c.count > 0).sort((a,b) => b.count-a.count);
    const max = Math.max(1, ...counts.map(c => c.count));
    $("#categorySummary").innerHTML = counts.length ? counts.slice(0,5).map(c => `
      <div class="category-summary-row"><span>${c.icon}</span><span>${escapeHTML(c.name)}</span><div class="bar"><span style="width:${Math.round(c.count/max*100)}%;background:${c.color}"></span></div><strong>${c.count}</strong></div>`).join("") : `<p class="helper-note">자료를 추가하면 카테고리별 현황이 보여요.</p>`;
  }
  function renderItem(item) {
    const category = categoryInfo(item.category);
    const duplicate = item.type === "link" ? getDuplicate(item.url, item.id) : null;
    const safeUrl = item.type === "link" ? escapeHTML(item.url || "") : "";
    const tags = (item.tags || []).map(tag => `<span class="tag">#${escapeHTML(tag)}</span>`).join("");
    return `<article class="item-card" data-id="${escapeHTML(item.id)}">
      <div class="item-card-top"><div class="item-type-icon ${item.type === "note" ? "note" : ""}">${item.type === "note" ? "✎" : "↗"}</div>
      <div class="item-actions">
        <button class="icon-btn ${item.favorite ? "favorite-on" : ""}" data-action="favorite" data-id="${escapeHTML(item.id)}" title="즐겨찾기" aria-label="즐겨찾기">${item.favorite ? "♥" : "♡"}</button>
        <button class="icon-btn" data-action="edit" data-id="${escapeHTML(item.id)}" title="수정" aria-label="수정">✎</button>
        <button class="icon-btn" data-action="delete" data-id="${escapeHTML(item.id)}" title="삭제" aria-label="삭제">×</button>
      </div></div>
      <h3 class="item-title">${escapeHTML(item.title)}${duplicate ? '<span class="duplicate-label">중복 URL</span>' : ""}</h3>
      ${item.type === "link" ? `<a class="item-url" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>` : ""}
      ${item.description ? `<p class="item-description">${escapeHTML(item.description)}</p>` : ""}
      ${tags ? `<div class="item-tags">${tags}</div>` : ""}
      <div class="item-footer"><span class="category-chip">${category.icon} ${escapeHTML(item.category)}</span><span class="item-date">${formatDate(item.updatedAt || item.createdAt)}</span></div>
    </article>`;
  }
  function updateDuplicateNotice() {
    const groups = new Map();
    items.filter(i => i.type === "link" && normalizeUrl(i.url || "")).forEach(item => {
      const key = normalizeUrl(item.url);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const dupes = [...groups.values()].filter(group => group.length > 1);
    if (!dupes.length) {
      els.duplicateNotice.hidden = true;
      els.duplicateNotice.textContent = "";
      return;
    }
    els.duplicateNotice.hidden = false;
    els.duplicateNotice.textContent = `🔎 중복 링크 ${dupes.length}종류를 찾았어요. 총 ${dupes.reduce((n,g)=>n+g.length-1,0)}개의 중복 항목이 있어요. '정리 도우미'에서 자세히 확인할 수 있어요.`;
  }
  function openModal(type = "link", item = null) {
    currentType = type;
    els.form.reset();
    $("#modalTitle").textContent = item ? "자료 수정하기" : "새 자료 추가하기";
    $("#itemTitle").value = item?.title || "";
    $("#itemUrl").value = item?.url || "";
    $("#itemDescription").value = item?.description || "";
    $("#itemTags").value = (item?.tags || []).join(", ");
    $("#itemCategory").value = item ? item.category : "auto";
    $("#itemFavorite").checked = !!item?.favorite;
    els.form.dataset.editId = item?.id || "";
    setType(type);
    els.duplicateWarning.hidden = true;
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => els.title.focus(), 50);
  }
  function closeModal() {
    els.modal.hidden = true;
    document.body.style.overflow = "";
    els.form.dataset.editId = "";
  }
  function setType(type) {
    currentType = type;
    els.type.value = type;
    els.urlField.hidden = type === "note";
    $("#itemUrl").required = type === "link";
    $$(".type-option").forEach(button => button.classList.toggle("active", button.dataset.type === type));
  }
  function saveItem(event) {
    event.preventDefault();
    const title = els.title.value.trim();
    const urlInput = els.url.value.trim();
    const description = els.description.value.trim();
    const tags = [...new Set(els.tags.value.split(",").map(t => t.trim()).filter(Boolean))].slice(0,20);
    const editId = els.form.dataset.editId;
    let url = "";
    if (!title) return showToast("제목을 입력해 주세요.");
    if (currentType === "link") {
      url = normalizeUrl(urlInput);
      if (!url) return showToast("올바른 http 또는 https 웹 주소를 입력해 주세요.");
    }
    const duplicate = currentType === "link" ? getDuplicate(url, editId) : null;
    if (duplicate && !els.duplicateWarning.hidden) {
      // A second submit after warning explicitly confirms the duplicate.
    } else if (duplicate) {
      els.duplicateWarning.hidden = false;
      els.duplicateWarning.textContent = `⚠️ 이미 '${duplicate.title}' 자료에 같은 주소가 있어요. 한 번 더 저장을 누르면 중복 자료를 추가합니다.`;
      return;
    }
    const selectedCategory = els.category.value;
    const category = selectedCategory === "auto" ? categoryFor(title, description, tags) : selectedCategory;
    const now = Date.now();
    const existing = items.find(i => i.id === editId);
    const item = {
      id: editId || (crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(16).slice(2)}`),
      type: currentType, title, url, description, tags, category,
      favorite: els.favorite.checked,
      createdAt: existing?.createdAt || now, updatedAt: now
    };
    if (existing) items = items.map(i => i.id === editId ? item : i);
    else items.unshift(item);
    persist();
    closeModal();
    activeFilter = "all"; activeCategory = "";
    render();
    showToast(existing ? "자료를 수정했어요 ✨" : "자료를 저장했어요 ✨");
  }
  function handleItemAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const item = items.find(i => i.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === "favorite") {
      item.favorite = !item.favorite; item.updatedAt = Date.now(); persist(); render();
      showToast(item.favorite ? "즐겨찾기에 추가했어요 ♡" : "즐겨찾기에서 해제했어요");
    } else if (button.dataset.action === "edit") openModal(item.type, item);
    else if (button.dataset.action === "delete") {
      if (!confirm(`'${item.title}' 자료를 삭제할까요?`)) return;
      items = items.filter(i => i.id !== item.id); persist(); render(); showToast("자료를 삭제했어요.");
    }
  }
  function scanDuplicates() {
    const map = new Map();
    items.filter(i => i.type === "link" && normalizeUrl(i.url || "")).forEach(item => {
      const url = normalizeUrl(item.url);
      if (!map.has(url)) map.set(url, []);
      map.get(url).push(item);
    });
    const duplicates = [...map.entries()].filter(([,group]) => group.length > 1);
    if (!duplicates.length) {
      showToast("중복 링크가 없어요! 깔끔하게 정리되어 있어요 🌷");
      return;
    }
    const details = duplicates.map(([url,group]) => `• ${url}\n  ${group.map(i=>i.title).join(" / ")}`).join("\n\n");
    alert(`중복 링크 ${duplicates.length}종류를 찾았어요.\n\n${details}\n\n필요 없는 자료는 카드의 × 버튼으로 삭제할 수 있어요.`);
    els.search.value = "";
    activeFilter = "all"; activeCategory = "";
    render();
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({app:"OneClick Organizer",version:1,exportedAt:new Date().toISOString(),items}, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `oneclick-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url); showToast("자료 백업 파일을 만들었어요.");
  }
  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const imported = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(imported)) throw new Error("형식 오류");
        const valid = imported.filter(i => i && typeof i.title === "string" && ["link","note"].includes(i.type));
        if (!valid.length && imported.length) throw new Error("유효한 자료 없음");
        if (!confirm(`${valid.length}개의 자료를 불러올까요? 기존 자료와 합쳐집니다.`)) return;
        const ids = new Set(items.map(i=>i.id));
        const added = valid.map((item,index) => {
          let id = typeof item.id === "string" ? item.id : `import-${Date.now()}-${index}`;
          while (ids.has(id)) id = `${id}-copy`;
          ids.add(id);
          const category = CATEGORIES.some(c=>c.name===item.category) ? item.category : "기타";
          return {id,type:item.type,title:item.title.slice(0,120),url:item.type==="link" ? normalizeUrl(item.url||"")||"" : "",description:String(item.description||""),tags:Array.isArray(item.tags)?item.tags.filter(t=>typeof t==="string").slice(0,20):[],category,favorite:!!item.favorite,createdAt:Number(item.createdAt)||Date.now(),updatedAt:Number(item.updatedAt)||Date.now()};
        }).filter(i => i.type === "note" || i.url);
        items = [...added,...items]; persist(); render(); showToast(`${added.length}개 자료를 불러왔어요.`);
      } catch (_) { showToast("백업 파일을 읽지 못했어요. 올바른 JSON 파일인지 확인해 주세요."); }
      $("#importFile").value = "";
    };
    reader.readAsText(file);
  }

  $("#newItemBtn").addEventListener("click", () => openModal("link"));
  $("#emptyAddBtn").addEventListener("click", () => openModal("link"));
  $("#closeModalBtn").addEventListener("click", closeModal);
  $("#cancelModalBtn").addEventListener("click", closeModal);
  els.modal.addEventListener("click", e => { if (e.target === els.modal) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); els.search.focus(); }
  });
  $$(".type-option").forEach(button => button.addEventListener("click", () => setType(button.dataset.type)));
  els.form.addEventListener("submit", saveItem);
  els.url.addEventListener("input", () => { els.duplicateWarning.hidden = true; });
  els.container.addEventListener("click", handleItemAction);
  els.search.addEventListener("input", render);
  $("#sortSelect").addEventListener("change", render);
  $("#clearCategoryFilter").addEventListener("click", () => { activeCategory = ""; render(); });
  $("#categoryList").addEventListener("click", e => {
    const button = e.target.closest("[data-category]"); if (!button) return;
    activeCategory = activeCategory === button.dataset.category ? "" : button.dataset.category;
    activeFilter = "all"; render();
  });
  $$(".nav-item").forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter; activeCategory = "";
    $$(".nav-item").forEach(b => b.classList.toggle("active", b === button));
    render();
    $("#sidebar").classList.remove("open");
  }));
  $("#quickNoteBtn").addEventListener("click", () => {
    const text = $("#quickNoteText").value.trim();
    if (!text) return showToast("먼저 메모 내용을 입력해 주세요.");
    const now = Date.now();
    items.unshift({id:crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random()}`,type:"note",title:text.split("\n")[0].slice(0,80)||"빠른 메모",url:"",description:text,tags:[],category:categoryFor(text,text,[]),favorite:false,createdAt:now,updatedAt:now});
    persist(); $("#quickNoteText").value = ""; activeFilter = "all"; activeCategory = ""; render(); showToast("빠른 메모를 저장했어요 ✎");
  });
  $("#scanDuplicatesBtn").addEventListener("click", scanDuplicates);
  $("#exportBtn").addEventListener("click", exportData);
  $("#importFile").addEventListener("change", e => importData(e.target.files[0]));
  $("#gridViewBtn").addEventListener("click", () => { viewMode="grid"; $("#gridViewBtn").classList.add("active"); $("#listViewBtn").classList.remove("active"); render(); });
  $("#listViewBtn").addEventListener("click", () => { viewMode="list"; $("#listViewBtn").classList.add("active"); $("#gridViewBtn").classList.remove("active"); render(); });
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  document.addEventListener("click", e => {
    if (window.innerWidth <= 850 && $("#sidebar").classList.contains("open") && !$("#sidebar").contains(e.target) && !$("#mobileMenu").contains(e.target)) $("#sidebar").classList.remove("open");
  });

  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString("ko-KR", {month:"long",day:"numeric",weekday:"short"});
  // First-run demo examples help users understand the interface; users can delete them.
  if (!localStorage.getItem(STORAGE_KEY)) {
    const demoNow = Date.now();
    items = [
      {id:"demo-1",type:"link",title:"영감을 주는 디자인 레퍼런스",url:"https://www.awwwards.com",description:"새로운 웹 디자인과 인터랙션 아이디어를 살펴보기",tags:["디자인","영감"],category:"영감",favorite:true,createdAt:demoNow-3600000,updatedAt:demoNow-3600000},
      {id:"demo-2",type:"link",title:"JavaScript 학습 자료",url:"https://developer.mozilla.org/ko/docs/Web/JavaScript",description:"필요할 때 다시 찾아볼 자바스크립트 공식 문서",tags:["개발","공부"],category:"공부",favorite:false,createdAt:demoNow-86400000,updatedAt:demoNow-86400000},
      {id:"demo-3",type:"note",title:"웹사이트 아이디어",url:"",description:"작은 불편함을 해결하는 도구를 만들고, 실제로 써보면서 개선하기.",tags:["아이디어"],category:"영감",favorite:false,createdAt:demoNow-172800000,updatedAt:demoNow-172800000}
    ];
    persist();
  }
  render();
})();