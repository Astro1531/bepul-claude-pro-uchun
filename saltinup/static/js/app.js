/* ═══════════════════════════════════════════════════════════════
   SALTINUP — Main Application JS
═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────
let STATE = {
  token: localStorage.getItem("token") || null,
  user:  null,
  theme: localStorage.getItem("theme") || "dark",
  tasks: [],
  posts: [],
  notifCheckInterval: null,
  clockInterval: null,
  taskAlertInterval: null,
  toastTimeout: null,
  currentPage: null,
  postImageB64: null,
  selectedBgColor: "#3b82f6",
  setupAvatarB64: null,
};

// ── API helper ───────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (STATE.token) opts.headers["Authorization"] = "Bearer " + STATE.token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch("/api" + path, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ── Theme ────────────────────────────────────────────────────
function setTheme(t) {
  STATE.theme = t;
  localStorage.setItem("theme", t);
  document.body.setAttribute("data-theme", t);
}
setTheme(STATE.theme);

// ── Clock ─────────────────────────────────────────────────────
const DAYS_UZ = ["Yakshanba","Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba"];
const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];

function startClock() {
  if (STATE.clockInterval) clearInterval(STATE.clockInterval);
  STATE.clockInterval = setInterval(() => {
    const el = document.getElementById("clock-display");
    const ms = document.getElementById("clock-ms");
    const dateEl = document.getElementById("clock-date");
    if (!el) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2,"0");
    const m = String(now.getMinutes()).padStart(2,"0");
    const s = String(now.getSeconds()).padStart(2,"0");
    const msv = String(now.getMilliseconds()).padStart(3,"0");
    el.textContent = `${h}:${m}:${s}`;
    if (ms) ms.textContent = `.${msv}`;
    if (dateEl) {
      dateEl.textContent = `${DAYS_UZ[now.getDay()]}, ${now.getDate()} ${MONTHS_UZ[now.getMonth()]} ${now.getFullYear()}`;
    }
  }, 10);
}

// ── Task alert check ─────────────────────────────────────────
function startTaskAlerts() {
  if (STATE.taskAlertInterval) clearInterval(STATE.taskAlertInterval);
  STATE.taskAlertInterval = setInterval(() => {
    if (!STATE.tasks.length) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,"0");
    const mm = String(now.getMinutes()).padStart(2,"0");
    const cur = `${hh}:${mm}`;
    // check 10 minutes before start
    const nowPlus10 = new Date(now.getTime() + 10 * 60000);
    const h2 = String(nowPlus10.getHours()).padStart(2,"0");
    const m2 = String(nowPlus10.getMinutes()).padStart(2,"0");
    const soon = `${h2}:${m2}`;
    STATE.tasks.forEach(t => {
      if (t.is_done) return;
      const ts = t.time_start.substring(0,5);
      if (ts === soon) {
        showToast("⏰ Topshiriq yaqinlashmoqda!", `"${t.title}" 10 daqiqadan keyin boshlanadi (${t.time_start})`, 600000);
        playAlertSound();
      }
      if (ts === cur) {
        showToast("🚀 Topshiriq boshlandi!", `"${t.title}" hozir boshlanishi kerak!`, 600000);
        playAlertSound();
      }
    });
  }, 60000);
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.4);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.4);
    });
  } catch(e) {}
}


// ── Toast notification ────────────────────────────────────────
function showToast(title, msg, duration = 600000) {
  const toast = document.getElementById("notif-toast");
  if (!toast) return;
  toast.querySelector(".notif-toast-title").textContent = title;
  toast.querySelector(".notif-toast-msg").textContent = msg;
  toast.classList.remove("hidden");
  if (STATE.toastTimeout) clearTimeout(STATE.toastTimeout);
  STATE.toastTimeout = setTimeout(closeToast, duration);
}
function closeToast() {
  const toast = document.getElementById("notif-toast");
  if (toast) toast.classList.add("hidden");
  if (STATE.toastTimeout) clearTimeout(STATE.toastTimeout);
}

// ── Navigation ────────────────────────────────────────────────
function navigate(page, param = null) {
  STATE.currentPage = page;
  const app = document.getElementById("app");
  app.innerHTML = "";

  // Hide all static pages
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));

  if (page === "login") {
    document.getElementById("page-login").classList.remove("hidden");
    app.appendChild(document.getElementById("page-login"));
  } else if (page === "register") {
    document.getElementById("page-register").classList.remove("hidden");
    app.appendChild(document.getElementById("page-register"));
  } else if (page === "profile-setup") {
    document.getElementById("page-profile-setup").classList.remove("hidden");
    app.appendChild(document.getElementById("page-profile-setup"));
    prefillSetup();
  } else if (page === "feed") {
    renderFeedPage();
  } else if (page === "schedule") {
    renderSchedulePage();
  } else if (page === "profile") {
    renderProfilePage(param || (STATE.user ? STATE.user.id : null));
  } else if (page === "user") {
    renderProfilePage(param);
  } else if (page === "notifications") {
    renderNotificationsPage();
  } else if (page === "activity") {
    renderActivityPage();
  } else if (page === "admin") {
    renderAdminPage();
  }
  window.scrollTo(0, 0);
}

// ── Auth state init ───────────────────────────────────────────
async function initApp() {
  setTheme(STATE.theme);
  if (STATE.token) {
    const r = await api("GET", "/me");
    if (r.ok) {
      STATE.user = r.data;
      updateNavUser();
      navigate("feed");
      loadTasks();
      startClock();
      startTaskAlerts();
      startNotifPolling();
    } else {
      STATE.token = null;
      localStorage.removeItem("token");
      navigate("login");
    }
  } else {
    navigate("login");
  }
}

function updateNavUser() {
  const u = STATE.user;
  if (!u) return;
  document.getElementById("nav-links").classList.add("hidden");
  document.getElementById("nav-user").classList.remove("hidden");
  document.getElementById("nav-notif-btn").style.display = "flex";
  document.getElementById("nav-username").textContent = u.username;
  const av = document.getElementById("nav-avatar");
  if (u.avatar) {
    av.innerHTML = `<img src="/static/uploads/${u.avatar}" alt="avatar"/>`;
  } else {
    av.style.background = u.bg_color || "#3b82f6";
    av.textContent = u.username[0].toUpperCase();
  }
}

// ── LOGIN ─────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-err");
  errEl.textContent = "";
  if (!email || !pass) { errEl.textContent = "Barcha maydonlarni to'ldiring"; return; }
  const r = await api("POST", "/login", { email, password: pass });
  if (r.ok) {
    STATE.token = r.data.token;
    localStorage.setItem("token", r.data.token);
    const me = await api("GET", "/me");
    STATE.user = me.data;
    updateNavUser();
    startClock(); startTaskAlerts(); startNotifPolling();
    loadTasks();
    if (r.data.need_profile) navigate("profile-setup");
    else navigate("feed");
  } else {
    errEl.textContent = r.data.error || "Xatolik yuz berdi";
  }
}

// ── REGISTER ──────────────────────────────────────────────────
async function doRegister() {
  const username = document.getElementById("reg-username").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const phone    = document.getElementById("reg-phone").value.trim();
  const password = document.getElementById("reg-pass").value;
  const errEl    = document.getElementById("reg-err");
  errEl.textContent = "";
  if (!username || !email || !phone || !password) {
    errEl.textContent = "Barcha maydonlarni to'ldiring"; return;
  }
  const r = await api("POST", "/register", { username, email, phone, password });
  if (r.ok) {
    STATE.token = r.data.token;
    localStorage.setItem("token", r.data.token);
    const me = await api("GET", "/me");
    STATE.user = me.data;
    updateNavUser();
    startClock(); startTaskAlerts(); startNotifPolling();
    navigate("profile-setup");
  } else {
    errEl.textContent = r.data.error || "Xatolik yuz berdi";
  }
}

// ── LOGOUT ───────────────────────────────────────────────────
async function doLogout() {
  await api("POST", "/logout");
  STATE.token = null; STATE.user = null; STATE.tasks = [];
  localStorage.removeItem("token");
  if (STATE.notifCheckInterval) clearInterval(STATE.notifCheckInterval);
  if (STATE.clockInterval) clearInterval(STATE.clockInterval);
  if (STATE.taskAlertInterval) clearInterval(STATE.taskAlertInterval);
  document.getElementById("nav-links").classList.remove("hidden");
  document.getElementById("nav-user").classList.add("hidden");
  document.getElementById("nav-notif-btn").style.display = "none";
  navigate("login");
}


// ── PROFILE SETUP ─────────────────────────────────────────────
function prefillSetup() {
  if (STATE.user) {
    document.getElementById("setup-username").value = STATE.user.username || "";
    document.getElementById("setup-bio").value = STATE.user.bio || "";
    STATE.selectedBgColor = STATE.user.bg_color || "#3b82f6";
    const preview = document.getElementById("setup-avatar-preview");
    if (preview) {
      preview.style.background = STATE.selectedBgColor;
      preview.textContent = (STATE.user.username || "?")[0].toUpperCase();
    }
  }
}

function selectBgColor(el) {
  document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
  el.classList.add("active");
  STATE.selectedBgColor = el.dataset.color;
  const preview = document.getElementById("setup-avatar-preview");
  if (preview) preview.style.background = STATE.selectedBgColor;
}

function customBgColor(input) {
  STATE.selectedBgColor = input.value;
  const preview = document.getElementById("setup-avatar-preview");
  if (preview) preview.style.background = STATE.selectedBgColor;
}

function previewAvatar(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    STATE.setupAvatarB64 = e.target.result;
    const preview = document.getElementById(previewId);
    if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="avatar"/>`;
  };
  reader.readAsDataURL(file);
}

async function saveProfile() {
  const username = document.getElementById("setup-username")?.value.trim();
  const bio      = document.getElementById("setup-bio")?.value.trim();
  const body = { username, bio, bg_color: STATE.selectedBgColor };
  if (STATE.setupAvatarB64) body.avatar = STATE.setupAvatarB64;
  const r = await api("PUT", "/profile", body);
  if (r.ok) {
    const me = await api("GET", "/me");
    STATE.user = me.data;
    STATE.setupAvatarB64 = null;
    updateNavUser();
    navigate("feed");
  }
}

// ── NOTIFICATIONS polling ─────────────────────────────────────
async function startNotifPolling() {
  if (STATE.notifCheckInterval) clearInterval(STATE.notifCheckInterval);
  await checkNotifications();
  STATE.notifCheckInterval = setInterval(checkNotifications, 30000);
}

async function checkNotifications() {
  if (!STATE.token) return;
  const r = await api("GET", "/notifications");
  if (!r.ok) return;
  const unread = r.data.filter(n => !n.is_read).length;
  const badge = document.getElementById("notif-badge");
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? "flex" : "none";
  }
}

// ── SEARCH ────────────────────────────────────────────────────
let searchTimer = null;
async function handleSearch(e) {
  const q = e.target.value.trim();
  const res = document.getElementById("search-results");
  if (!q) { res.classList.add("hidden"); return; }
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const r = await api("GET", `/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return;
    res.innerHTML = "";
    if (!r.data.length) {
      res.innerHTML = `<div class="search-item text-muted">Topilmadi</div>`;
    } else {
      r.data.forEach(u => {
        const el = document.createElement("div");
        el.className = "search-item";
        el.innerHTML = `
          ${avatarHtml(u, 32)}
          <div>
            <div style="font-weight:700;font-size:13px">${esc(u.username)}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(u.bio||"")}</div>
          </div>`;
        el.onclick = () => {
          res.classList.add("hidden");
          e.target.value = "";
          navigate("user", u.id);
        };
        res.appendChild(el);
      });
    }
    res.classList.remove("hidden");
  }, 350);
}

document.addEventListener("click", e => {
  if (!e.target.closest("#nav-search-wrap")) {
    document.getElementById("search-results")?.classList.add("hidden");
  }
});


// ═══════════════════════════════════════════════════════════════
//  SCHEDULE PAGE
// ═══════════════════════════════════════════════════════════════
async function loadTasks() {
  if (!STATE.token) return;
  const r = await api("GET", "/tasks");
  if (r.ok) STATE.tasks = r.data;
}

function renderSchedulePage() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div>
      <!-- Clock -->
      <div class="clock-wrap">
        <div class="clock-label">Vaqt kutmaydi</div>
        <div class="clock-time">
          <span id="clock-display">00:00:00</span><span class="clock-ms" id="clock-ms">.000</span>
        </div>
        <div class="clock-date" id="clock-date"></div>
      </div>

      <!-- Schedule -->
      <div class="schedule-wrap">
        <div class="section-header">
          <div class="section-title">📅 Kunlik Jadval</div>
          <button class="btn-primary" onclick="openTaskModal()">+ Topshiriq qo'shish</button>
        </div>
        <div id="schedule-content">Yuklanmoqda...</div>
      </div>
    </div>
  `;
  startClock();
  loadAndRenderTasks();
}

async function loadAndRenderTasks() {
  await loadTasks();
  renderTaskTable();
}

function renderTaskTable() {
  const container = document.getElementById("schedule-content");
  if (!container) return;
  if (!STATE.tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Hali hech qanday topshiriq qo'shilmagan</p>
        <button class="btn-primary mt-3" onclick="openTaskModal()">+ Birinchi topshiriqni qo'shing</button>
      </div>`;
    return;
  }

  const now = new Date();
  const cur = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  const cats = [...new Set(STATE.tasks.map(t => t.category || "general"))];
  let html = `<div class="tabs" id="task-tabs">
    <button class="tab-btn active" onclick="filterTaskTab('all', this)">Barchasi (${STATE.tasks.length})</button>
    ${cats.map(c => `<button class="tab-btn" onclick="filterTaskTab('${c}',this)">${esc(c)}</button>`).join("")}
  </div>
  <div id="task-table-wrap">`;

  html += buildTaskTable(STATE.tasks, cur);
  html += `</div>`;
  container.innerHTML = html;
}

function buildTaskTable(tasks, cur) {
  const sorted = [...tasks].sort((a,b) => a.time_start.localeCompare(b.time_start));
  let html = `<div style="overflow-x:auto">
  <table class="schedule-table">
    <thead><tr>
      <th>#</th><th>Topshiriq</th><th>Vaqt</th><th>Kategoriya</th><th>Kun</th><th>Holat</th><th>Amallar</th>
    </tr></thead>
    <tbody>`;
  sorted.forEach((t, i) => {
    const ts = t.time_start.substring(0,5);
    const te = t.time_end.substring(0,5);
    const isActive = cur >= ts && cur <= te;
    const isDone = t.is_done;
    const rowCls = isDone ? "done-task" : isActive ? "active-task" : "";
    html += `<tr class="${rowCls}" id="task-row-${t.id}">
      <td>${i+1}</td>
      <td>
        <span class="task-color-dot" style="background:${esc(t.color||'#3b82f6')}"></span>
        <strong>${esc(t.title)}</strong>
        ${t.description ? `<div style="font-size:12px;color:var(--text2);margin-top:2px">${esc(t.description)}</div>` : ""}
      </td>
      <td>
        <span class="task-time-badge">${esc(ts)} – ${esc(te)}</span>
        ${isActive ? `<span class="badge badge-green ml-1">Hozir</span>` : ""}
      </td>
      <td><span class="task-category-badge">${esc(t.category||"general")}</span></td>
      <td>${esc(t.day_of_week||"daily")}</td>
      <td>
        ${isDone
          ? `<span class="badge badge-green">✓ Bajarildi</span>`
          : `<button class="btn-success btn-sm" onclick="markDone(${t.id})">✓ Bajarildi</button>`
        }
      </td>
      <td class="task-actions">
        <button class="btn-ghost btn-sm" onclick="openTaskModal(${t.id})">✏️</button>
        <button class="btn-danger btn-sm" onclick="deleteTask(${t.id})">🗑️</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

function filterTaskTab(cat, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const filtered = cat === "all" ? STATE.tasks : STATE.tasks.filter(t => t.category === cat);
  const now = new Date();
  const cur = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  document.getElementById("task-table-wrap").innerHTML = buildTaskTable(filtered, cur);
}


// ── Task Modal ────────────────────────────────────────────────
function openTaskModal(taskId = null) {
  const task = taskId ? STATE.tasks.find(t => t.id === taskId) : null;
  const title = task ? "Topshiriqni tahrirlash" : "Yangi topshiriq";
  const days = ["daily","Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba","Yakshanba"];
  const cats = ["general","sport","ish","ta'lim","salomatlik","dam olish","ijod","shaxsiy"];

  showModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="form-group">
      <label>Topshiriq nomi *</label>
      <input type="text" id="t-title" value="${esc(task?.title||"")}" placeholder="Masalan: Ertalabki yugurish"/>
    </div>
    <div class="form-group">
      <label>Tavsif</label>
      <textarea id="t-desc" placeholder="Qo'shimcha ma'lumot...">${esc(task?.description||"")}</textarea>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Boshlanish vaqti *</label>
        <input type="time" id="t-start" value="${task?.time_start?.substring(0,5)||"07:00"}"/>
      </div>
      <div class="form-group">
        <label>Tugash vaqti *</label>
        <input type="time" id="t-end" value="${task?.time_end?.substring(0,5)||"08:00"}"/>
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Kategoriya</label>
        <select id="t-cat">
          ${cats.map(c => `<option value="${c}" ${task?.category===c?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Kun</label>
        <select id="t-day">
          ${days.map(d => `<option value="${d}" ${task?.day_of_week===d?"selected":""}>${d}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Rang</label>
      <input type="color" id="t-color" value="${task?.color||"#3b82f6"}" style="width:50px;height:34px;border-radius:8px;cursor:pointer;border:none"/>
    </div>
    <div class="form-error" id="task-err"></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn-primary w-full" onclick="saveTask(${taskId||"null"})">
        ${task ? "Saqlash" : "Qo'shish"}
      </button>
      <button class="btn-ghost" onclick="closeModal()">Bekor</button>
    </div>
  `);
}

async function saveTask(taskId) {
  const title = document.getElementById("t-title").value.trim();
  const time_start = document.getElementById("t-start").value;
  const time_end   = document.getElementById("t-end").value;
  const errEl = document.getElementById("task-err");
  if (!title || !time_start || !time_end) {
    errEl.textContent = "Majburiy maydonlarni to'ldiring"; return;
  }
  const body = {
    title, time_start, time_end,
    description: document.getElementById("t-desc").value,
    category:    document.getElementById("t-cat").value,
    day_of_week: document.getElementById("t-day").value,
    color:       document.getElementById("t-color").value,
  };
  const r = taskId
    ? await api("PUT", `/tasks/${taskId}`, body)
    : await api("POST", "/tasks", body);
  if (r.ok) {
    closeModal();
    await loadAndRenderTasks();
  } else {
    errEl.textContent = r.data.error || "Xatolik";
  }
}

async function deleteTask(id) {
  if (!confirm("Topshiriqni o'chirasizmi?")) return;
  await api("DELETE", `/tasks/${id}`);
  await loadAndRenderTasks();
}

async function markDone(id) {
  const r = await api("POST", "/task-done", { task_id: id });
  if (r.ok) {
    STATE.tasks = STATE.tasks.map(t => t.id === id ? {...t, is_done: 1} : t);
    renderTaskTable();
    showToast("✅ Bajarildi!", `Topshiriq muvaffaqiyatli bajarildi`, 5000);
  }
}

// ── Modal helper ──────────────────────────────────────────────
function showModal(html) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modal-overlay";
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function showModalLg(html) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modal-overlay";
  overlay.innerHTML = `<div class="modal modal-lg">${html}</div>`;
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function closeModal() {
  document.getElementById("modal-overlay")?.remove();
}


// ═══════════════════════════════════════════════════════════════
//  FEED PAGE
// ═══════════════════════════════════════════════════════════════
function renderFeedPage() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div>
      <!-- Clock -->
      <div class="clock-wrap">
        <div class="clock-label">Vaqt kutmaydi</div>
        <div class="clock-time">
          <span id="clock-display">00:00:00</span><span class="clock-ms" id="clock-ms">.000</span>
        </div>
        <div class="clock-date" id="clock-date"></div>
      </div>

      <div class="feed-layout">
        <div>
          <!-- Nav tabs -->
          <div class="tabs">
            <button class="tab-btn active" onclick="showFeedTab('posts',this)">🏠 Lenta</button>
            <button class="tab-btn" onclick="showFeedTab('schedule',this)">📅 Jadval</button>
            <button class="tab-btn" onclick="showFeedTab('stats',this)">📊 Statistika</button>
          </div>

          <!-- Create post -->
          ${STATE.user ? `
          <div class="create-post-card" id="create-post-card">
            <div class="create-post-top">
              ${avatarHtml(STATE.user, 40)}
              <textarea id="post-text" placeholder="Nima haqida o'ylayapsiz?" rows="2"
                onkeydown="if(event.ctrlKey&&event.key==='Enter')submitPost()"></textarea>
            </div>
            <div id="post-img-preview"></div>
            <div class="create-post-actions">
              <label class="btn-ghost small" for="post-img-input">📷 Rasm</label>
              <input type="file" id="post-img-input" accept="image/*" style="display:none" onchange="previewPostImage(this)"/>
              <button class="btn-primary" onclick="submitPost()">Joylash</button>
            </div>
          </div>` : ""}

          <!-- Posts -->
          <div id="posts-container">Yuklanmoqda...</div>

          <!-- Schedule tab -->
          <div id="schedule-tab-content" style="display:none"></div>

          <!-- Stats tab -->
          <div id="stats-tab-content" style="display:none"></div>
        </div>

        <!-- Sidebar -->
        <div id="feed-sidebar">
          ${STATE.user ? `
          <div class="sidebar-card">
            <div class="sidebar-title">Mening profilim</div>
            <div class="sidebar-user-item" onclick="navigate('profile')">
              ${avatarHtml(STATE.user, 40)}
              <div>
                <div class="sidebar-username">${esc(STATE.user.username)}</div>
                <div style="font-size:12px;color:var(--text2)">${STATE.user.bio||""}</div>
              </div>
            </div>
            <div class="stats-grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
              <div class="stat-card" style="padding:12px">
                <div class="stat-number" style="font-size:22px">${STATE.user.stats?.tasks_total||0}</div>
                <div class="stat-label" style="font-size:10px">Topshiriq</div>
              </div>
              <div class="stat-card" style="padding:12px">
                <div class="stat-number" style="font-size:22px">${STATE.user.stats?.posts_total||0}</div>
                <div class="stat-label" style="font-size:10px">Post</div>
              </div>
              <div class="stat-card" style="padding:12px">
                <div class="stat-number" style="font-size:22px">${STATE.user.stats?.followers||0}</div>
                <div class="stat-label" style="font-size:10px">Obunachilar</div>
              </div>
              <div class="stat-card" style="padding:12px">
                <div class="stat-number" style="font-size:22px">${STATE.user.stats?.following||0}</div>
                <div class="stat-label" style="font-size:10px">Obunalar</div>
              </div>
            </div>
          </div>
          <div class="sidebar-card">
            <div class="sidebar-title">Tezkor havolalar</div>
            <button class="btn-ghost w-full mb-1" onclick="navigate('schedule')" style="text-align:left">📅 Jadvalim</button>
            <button class="btn-ghost w-full mb-1" onclick="navigate('activity')" style="text-align:left">📜 Faoliyatim</button>
            ${STATE.user?.is_admin ? `<button class="btn-ghost w-full mb-1" onclick="navigate('admin')" style="text-align:left;color:var(--warning)">⚙️ Admin panel</button>` : ""}
            <button class="btn-danger w-full mt-2 btn-sm" onclick="doLogout()">Chiqish</button>
          </div>` : ""}
        </div>
      </div>
    </div>`;

  startClock();
  loadPosts();
}

function showFeedTab(tab, btn) {
  document.querySelectorAll(".tabs .tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("posts-container").style.display = tab === "posts" ? "block" : "none";
  document.getElementById("create-post-card") && (document.getElementById("create-post-card").style.display = tab === "posts" ? "block" : "none");
  document.getElementById("schedule-tab-content").style.display = tab === "schedule" ? "block" : "none";
  document.getElementById("stats-tab-content").style.display   = tab === "stats" ? "block" : "none";

  if (tab === "schedule") {
    loadTasks().then(() => {
      const c = document.getElementById("schedule-tab-content");
      const now = new Date();
      const cur = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      c.innerHTML = `
        <div class="section-header">
          <div class="section-title">📅 Bugungi jadval</div>
          <button class="btn-primary" onclick="openTaskModal()">+ Qo'shish</button>
        </div>
        ${STATE.tasks.length ? buildTaskTable(STATE.tasks, cur) : `<div class="empty-state"><div class="empty-icon">📋</div><p>Jadval bo'sh</p></div>`}`;
    });
  }
  if (tab === "stats") loadMyStats();
}

async function loadMyStats() {
  if (!STATE.user) return;
  const r = await api("GET", `/users/${STATE.user.id}/stats`);
  if (!r.ok) return;
  const s = r.data;
  const el = document.getElementById("stats-tab-content");
  const done_pct = s.tasks_total > 0 ? Math.round((s.tasks_done/s.tasks_total)*100) : 0;
  el.innerHTML = `
    <h3 class="mb-3">📊 Mening statistikam</h3>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${s.tasks_total}</div><div class="stat-label">Jami topshiriq</div></div>
      <div class="stat-card"><div class="stat-number">${s.tasks_done}</div><div class="stat-label">Bajarilgan</div></div>
      <div class="stat-card"><div class="stat-number">${done_pct}%</div><div class="stat-label">Samaradorlik</div></div>
      <div class="stat-card"><div class="stat-number">${s.posts_total}</div><div class="stat-label">Postlar</div></div>
      <div class="stat-card"><div class="stat-number">${s.followers}</div><div class="stat-label">Obunachilar</div></div>
      <div class="stat-card"><div class="stat-number">${s.likes_received}</div><div class="stat-label">✊ Olgan</div></div>
    </div>
    <h4 class="mb-2 mt-3">So'nggi 7 kun faoliyati</h4>
    <div class="card" style="padding:20px">
      ${buildBarChart(s.weekly)}
    </div>`;
}

function buildBarChart(weekly) {
  if (!weekly || !weekly.length) return `<div class="text-muted">Ma'lumot yo'q</div>`;
  const max = Math.max(...weekly.map(d => d.cnt), 1);
  const bars = weekly.map(d => {
    const h = Math.round((d.cnt / max) * 80) + 20;
    const label = d.day ? d.day.substring(5) : "";
    return `<div class="bar-chart-col">
      <div style="font-size:11px;color:var(--text2)">${d.cnt}</div>
      <div class="bar-chart-bar" style="height:${h}px"></div>
      <div class="bar-chart-label">${label}</div>
    </div>`;
  }).join("");
  return `<div class="bar-chart">${bars}</div>`;
}


// ── Post image preview ────────────────────────────────────────
function previewPostImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    STATE.postImageB64 = e.target.result;
    const preview = document.getElementById("post-img-preview");
    if (preview) preview.innerHTML = `<img src="${e.target.result}" class="post-preview-img"/><button class="btn-ghost btn-sm mt-1" onclick="clearPostImage()">✕ Rasmni olib tashlash</button>`;
  };
  reader.readAsDataURL(file);
}
function clearPostImage() {
  STATE.postImageB64 = null;
  const preview = document.getElementById("post-img-preview");
  if (preview) preview.innerHTML = "";
  const inp = document.getElementById("post-img-input");
  if (inp) inp.value = "";
}

async function submitPost() {
  const content = document.getElementById("post-text")?.value.trim();
  if (!content && !STATE.postImageB64) { alert("Matn yoki rasm kiriting"); return; }
  const body = { content };
  if (STATE.postImageB64) body.image = STATE.postImageB64;
  const r = await api("POST", "/posts", body);
  if (r.ok) {
    document.getElementById("post-text").value = "";
    clearPostImage();
    STATE.postImageB64 = null;
    loadPosts();
  }
}

async function loadPosts() {
  const r = await api("GET", "/posts");
  if (!r.ok) return;
  STATE.posts = r.data;
  renderPosts(STATE.posts);
}

function renderPosts(posts) {
  const container = document.getElementById("posts-container");
  if (!container) return;
  if (!posts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><p>Hali postlar yo'q</p></div>`;
    return;
  }
  container.innerHTML = posts.map(p => postCardHtml(p)).join("");
}

function postCardHtml(p) {
  const canDelete = STATE.user && (STATE.user.id === p.user_id || STATE.user.is_admin);
  return `
  <div class="post-card" id="post-card-${p.id}">
    <div class="post-header">
      <div class="post-avatar" style="background:${esc(p.bg_color||'#3b82f6')}">
        ${p.avatar
          ? `<img src="/static/uploads/${esc(p.avatar)}" alt="av"/>`
          : esc((p.username||"?")[0].toUpperCase())}
      </div>
      <div style="flex:1">
        <div class="post-author" onclick="navigate('user',${p.user_id})">${esc(p.username||"")}</div>
        <div class="post-time">${formatTime(p.created_at)}</div>
      </div>
      ${canDelete ? `<button class="post-delete-btn" onclick="deletePost(${p.id})" title="O'chirish">🗑️</button>` : ""}
    </div>
    ${p.content ? `<div class="post-content">${esc(p.content)}</div>` : ""}
    ${p.image ? `<img src="/static/uploads/${esc(p.image)}" class="post-image" alt="post img"/>` : ""}
    <div class="post-actions">
      <button class="post-action-btn ${p.liked_by_me ? 'liked' : ''}" onclick="likePost(${p.id})">
        ✊ <span id="like-count-${p.id}">${p.likes_count||0}</span>
      </button>
      <button class="post-action-btn" onclick="toggleComments(${p.id})">
        💬 <span>${p.comments_count||0}</span>
      </button>
    </div>
    <div class="comments-section" id="comments-${p.id}" style="display:none"></div>
  </div>`;
}

async function likePost(pid) {
  if (!STATE.token) { alert("Iltimos kirish qiling"); return; }
  const r = await api("POST", `/posts/${pid}/like`);
  if (r.ok) {
    const btn = document.querySelector(`#post-card-${pid} .post-action-btn`);
    if (btn) btn.classList.toggle("liked", r.data.liked);
    const cnt = document.getElementById(`like-count-${pid}`);
    if (cnt) cnt.textContent = r.data.count;
  }
}

async function deletePost(pid) {
  if (!confirm("Postni o'chirasizmi?")) return;
  const r = await api("DELETE", `/posts/${pid}`);
  if (r.ok) document.getElementById(`post-card-${pid}`)?.remove();
}

async function toggleComments(pid) {
  const sec = document.getElementById(`comments-${pid}`);
  if (!sec) return;
  if (sec.style.display !== "none") { sec.style.display = "none"; return; }
  sec.style.display = "block";
  sec.innerHTML = "Yuklanmoqda...";
  const r = await api("GET", `/posts/${pid}/comments`);
  if (!r.ok) { sec.innerHTML = "Xatolik"; return; }
  const cmts = r.data;
  sec.innerHTML = `
    ${cmts.length ? cmts.map(c => `
      <div class="comment-item">
        <div class="comment-avatar" style="background:${esc(c.bg_color||'#3b82f6')}">
          ${c.avatar ? `<img src="/static/uploads/${esc(c.avatar)}" alt="av"/>` : esc((c.username||"?")[0].toUpperCase())}
        </div>
        <div class="comment-body">
          <div class="comment-author">${esc(c.username)}</div>
          <div class="comment-text">${esc(c.content)}</div>
          <div class="comment-time">${formatTime(c.created_at)}</div>
        </div>
      </div>`).join("") : `<div class="text-muted text-small" style="padding:8px 0">Hali izohlar yo'q</div>`}
    ${STATE.token ? `
    <div class="comment-input-row">
      <input type="text" id="cmt-input-${pid}" placeholder="Izoh yozing..." onkeydown="if(event.key==='Enter')submitComment(${pid})"/>
      <button class="btn-primary btn-sm" onclick="submitComment(${pid})">Yuborish</button>
    </div>` : ""}`;
}

async function submitComment(pid) {
  const inp = document.getElementById(`cmt-input-${pid}`);
  if (!inp) return;
  const content = inp.value.trim();
  if (!content) return;
  const r = await api("POST", `/posts/${pid}/comments`, { content });
  if (r.ok) {
    inp.value = "";
    // reload comments
    const sec = document.getElementById(`comments-${pid}`);
    sec.style.display = "none";
    toggleComments(pid);
  }
}


// ═══════════════════════════════════════════════════════════════
//  PROFILE PAGE
// ═══════════════════════════════════════════════════════════════
async function renderProfilePage(userId) {
  const app = document.getElementById("app");
  app.innerHTML = `<div style="text-align:center;padding:60px">Yuklanmoqda...</div>`;
  if (!userId) return;

  const [uRes, sRes, pRes] = await Promise.all([
    api("GET", `/users/${userId}`),
    api("GET", `/users/${userId}/stats`),
    api("GET", `/users/${userId}/posts`),
  ]);
  if (!uRes.ok) { app.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><p>Foydalanuvchi topilmadi</p></div>`; return; }

  const u = uRes.data;
  const s = sRes.data;
  const posts = pRes.data || [];
  const isOwn = STATE.user && STATE.user.id === u.id;

  app.innerHTML = `
    <div class="profile-card">
      <div class="profile-banner" style="background:${esc(u.bg_color||'#3b82f6')}"></div>
      <div class="profile-info">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" style="background:${esc(u.bg_color||'#3b82f6')}">
            ${u.avatar ? `<img src="/static/uploads/${esc(u.avatar)}" alt="avatar"/>` : esc((u.username||"?")[0].toUpperCase())}
          </div>
        </div>
        <div class="profile-details">
          <div class="profile-username">${esc(u.username)}</div>
          ${u.bio ? `<div class="profile-bio">${esc(u.bio)}</div>` : ""}
          <div class="profile-meta">
            <div class="profile-meta-item"><strong>${s.followers||0}</strong> Obunachilar</div>
            <div class="profile-meta-item"><strong>${s.following||0}</strong> Obunalar</div>
            <div class="profile-meta-item"><strong>${s.posts_total||0}</strong> Postlar</div>
            <div class="profile-meta-item"><strong>${s.tasks_total||0}</strong> Topshiriqlar</div>
          </div>
        </div>
        <div class="profile-actions">
          ${isOwn ? `
            <button class="btn-ghost" onclick="openEditProfile()">✏️ Tahrirlash</button>
            <button class="btn-danger btn-sm" onclick="doLogout()">Chiqish</button>
          ` : STATE.user ? `
            <button class="btn-primary ${u.is_following ? 'btn-ghost' : ''}" id="sub-btn"
              onclick="toggleSubscribe(${u.id})">
              ${u.is_following ? "✓ Obunada" : "+ Obuna bo'lish"}
            </button>
          ` : ""}
        </div>
      </div>
    </div>

    <!-- Profile tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="showProfileTab('posts',this)">📝 Postlar (${posts.length})</button>
      <button class="tab-btn" onclick="showProfileTab('stats',this)">📊 Statistika</button>
      ${isOwn ? `<button class="tab-btn" onclick="showProfileTab('activity',this)">📜 Faoliyat</button>` : ""}
    </div>

    <div id="profile-tab-posts" class="tab-content active">
      ${posts.length
        ? posts.map(p => postCardHtml(p)).join("")
        : `<div class="empty-state"><div class="empty-icon">📝</div><p>Hali postlar yo'q</p></div>`}
    </div>
    <div id="profile-tab-stats" class="tab-content">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${s.tasks_total||0}</div><div class="stat-label">Topshiriqlar</div></div>
        <div class="stat-card"><div class="stat-number">${s.tasks_done||0}</div><div class="stat-label">Bajarilgan</div></div>
        <div class="stat-card"><div class="stat-number">${s.tasks_total>0?Math.round((s.tasks_done/s.tasks_total)*100):0}%</div><div class="stat-label">Samaradorlik</div></div>
        <div class="stat-card"><div class="stat-number">${s.posts_total||0}</div><div class="stat-label">Postlar</div></div>
        <div class="stat-card"><div class="stat-number">${s.likes_received||0}</div><div class="stat-label">✊ Olgan</div></div>
        <div class="stat-card"><div class="stat-number">${s.followers||0}</div><div class="stat-label">Obunachilar</div></div>
      </div>
      <h4 class="mb-2">So'nggi 7 kun</h4>
      <div class="card" style="padding:20px">${buildBarChart(s.weekly)}</div>
    </div>
    ${isOwn ? `<div id="profile-tab-activity" class="tab-content"><div id="activity-list">Yuklanmoqda...</div></div>` : ""}
  `;
  // preload activity
  if (isOwn) loadActivityList();
}

function showProfileTab(tab, btn) {
  document.querySelectorAll(".tabs .tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll("[id^='profile-tab-']").forEach(el => el.classList.remove("active"));
  const el = document.getElementById(`profile-tab-${tab}`);
  if (el) el.classList.add("active");
}

async function toggleSubscribe(uid) {
  const r = await api("POST", `/users/${uid}/subscribe`);
  if (r.ok) {
    const btn = document.getElementById("sub-btn");
    if (btn) {
      btn.textContent = r.data.following ? "✓ Obunada" : "+ Obuna bo'lish";
      btn.className = r.data.following ? "btn-ghost" : "btn-primary";
    }
  }
}

async function loadActivityList() {
  const r = await api("GET", "/activity");
  const container = document.getElementById("activity-list");
  if (!container) return;
  if (!r.ok) { container.innerHTML = "Xatolik"; return; }
  const icons = { register:"🎉", login:"🔑", profile_update:"✏️", task_created:"📋", task_done:"✅", task_deleted:"🗑️", post_created:"📝", subscribe:"➕", unsubscribe:"➖" };
  container.innerHTML = r.data.length
    ? r.data.map(a => `
      <div class="activity-item">
        <div class="activity-icon">${icons[a.action] || "📌"}</div>
        <div>
          <div class="activity-text"><strong>${esc(a.action)}</strong> ${a.details ? `— ${esc(a.details)}` : ""}</div>
          <div class="activity-time">${formatTime(a.created_at)}</div>
        </div>
      </div>`).join("")
    : `<div class="empty-state"><div class="empty-icon">📜</div><p>Faoliyat yo'q</p></div>`;
}

function openEditProfile() {
  const u = STATE.user;
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Profilni tahrirlash</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="avatar-upload-wrap">
      <div class="avatar-preview" id="edit-avatar-preview" style="background:${esc(u.bg_color||'#3b82f6')}">
        ${u.avatar ? `<img src="/static/uploads/${esc(u.avatar)}" alt="av"/>` : esc((u.username||"?")[0].toUpperCase())}
      </div>
      <label class="btn-ghost small" for="edit-avatar-input">📷 Rasm o'zgartirish</label>
      <input type="file" id="edit-avatar-input" accept="image/*" style="display:none" onchange="previewAvatar(this,'edit-avatar-preview')"/>
    </div>
    <div class="form-group">
      <label>Username</label>
      <input type="text" id="edit-username" value="${esc(u.username||"")}"/>
    </div>
    <div class="form-group">
      <label>Bio</label>
      <textarea id="edit-bio">${esc(u.bio||"")}</textarea>
    </div>
    <div class="form-group">
      <label>Orqa fon rangi</label>
      <div class="color-picker-row" id="bg-color-picker">
        ${["#3b82f6","#8b5cf6","#ec4899","#10b981","#f59e0b","#ef4444","#1e293b"].map(c =>
          `<div class="color-dot ${u.bg_color===c?'active':''}" style="background:${c}" data-color="${c}" onclick="selectBgColor(this)"></div>`
        ).join("")}
        <input type="color" value="${esc(u.bg_color||'#3b82f6')}" onchange="customBgColor(this)"/>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn-primary w-full" onclick="submitEditProfile()">Saqlash</button>
      <button class="btn-ghost" onclick="closeModal()">Bekor</button>
    </div>
  `);
  STATE.selectedBgColor = u.bg_color || "#3b82f6";
  STATE.setupAvatarB64 = null;
}

async function submitEditProfile() {
  const body = {
    username: document.getElementById("edit-username").value.trim(),
    bio:      document.getElementById("edit-bio").value.trim(),
    bg_color: STATE.selectedBgColor,
  };
  if (STATE.setupAvatarB64) body.avatar = STATE.setupAvatarB64;
  const r = await api("PUT", "/profile", body);
  if (r.ok) {
    const me = await api("GET", "/me");
    STATE.user = me.data;
    STATE.setupAvatarB64 = null;
    closeModal();
    updateNavUser();
    renderProfilePage(STATE.user.id);
  }
}


// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS PAGE
// ═══════════════════════════════════════════════════════════════
async function renderNotificationsPage() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div class="section-title">🔔 Bildirishnomalar</div>
        <button class="btn-ghost btn-sm" onclick="markAllRead()">Barchasini o'qildi deb belgilash</button>
      </div>
      <div id="notif-list">Yuklanmoqda...</div>
    </div>`;
  const r = await api("GET", "/notifications");
  const container = document.getElementById("notif-list");
  if (!r.ok || !r.data.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><p>Bildirishnomalar yo'q</p></div>`;
    return;
  }
  const icons = { like: "✊", comment: "💬", follow: "👤" };
  container.innerHTML = r.data.map(n => `
    <div class="notif-item ${n.is_read ? "" : "unread"}">
      <div class="notif-item-icon">${icons[n.type] || "📌"}</div>
      <div>
        <div class="notif-item-text">${esc(n.message)}</div>
        <div class="notif-item-time">${formatTime(n.created_at)}</div>
      </div>
    </div>`).join("");
}

async function markAllRead() {
  await api("POST", "/notifications");
  await renderNotificationsPage();
  await checkNotifications();
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVITY PAGE
// ═══════════════════════════════════════════════════════════════
async function renderActivityPage() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="card">
      <div class="section-title mb-3">📜 Mening faoliyatim</div>
      <div id="activity-main">Yuklanmoqda...</div>
    </div>`;
  await loadActivityList();
  const list = document.getElementById("activity-list");
  if (list) document.getElementById("activity-main").innerHTML = list.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ═══════════════════════════════════════════════════════════════
async function renderAdminPage() {
  if (!STATE.user?.is_admin) { navigate("feed"); return; }
  const app = document.getElementById("app");
  app.innerHTML = `
    <div>
      <div class="section-header mb-3">
        <div class="section-title">⚙️ Admin Panel</div>
        <span class="badge badge-yellow">Admin</span>
      </div>
      <div class="admin-layout">
        <div class="admin-sidebar">
          <div class="admin-nav-item active" onclick="adminTab('dashboard',this)">📊 Dashboard</div>
          <div class="admin-nav-item" onclick="adminTab('users',this)">👥 Foydalanuvchilar</div>
          <div class="admin-nav-item" onclick="adminTab('posts',this)">📝 Postlar</div>
          <div class="admin-nav-item" onclick="adminTab('tasks',this)">📋 Topshiriqlar</div>
          <div class="admin-nav-item" onclick="adminTab('comments',this)">💬 Izohlar</div>
          <div class="admin-nav-item" onclick="adminTab('activity',this)">📜 Faoliyat logi</div>
        </div>
        <div class="admin-content" id="admin-content">Yuklanmoqda...</div>
      </div>
    </div>`;
  adminTab("dashboard", document.querySelector(".admin-nav-item"));
}

async function adminTab(tab, el) {
  document.querySelectorAll(".admin-nav-item").forEach(i => i.classList.remove("active"));
  el.classList.add("active");
  const content = document.getElementById("admin-content");
  content.innerHTML = "Yuklanmoqda...";

  if (tab === "dashboard") {
    const r = await api("GET", "/stats");
    if (!r.ok) { content.innerHTML = "Xatolik"; return; }
    const s = r.data;
    content.innerHTML = `
      <h3 class="mb-3">📊 Umumiy statistika</h3>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${s.total_users}</div><div class="stat-label">Foydalanuvchilar</div></div>
        <div class="stat-card"><div class="stat-number">${s.total_posts}</div><div class="stat-label">Postlar</div></div>
        <div class="stat-card"><div class="stat-number">${s.total_tasks}</div><div class="stat-label">Topshiriqlar</div></div>
        <div class="stat-card"><div class="stat-number">${s.total_comments}</div><div class="stat-label">Izohlar</div></div>
        <div class="stat-card"><div class="stat-number">${s.total_likes}</div><div class="stat-label">Layklar</div></div>
        <div class="stat-card"><div class="stat-number">${s.active_today}</div><div class="stat-label">Bugun faol</div></div>
        <div class="stat-card"><div class="stat-number">${s.new_users_week}</div><div class="stat-label">Yangi (7 kun)</div></div>
      </div>
      <h4 class="mb-2 mt-3">Postlar (so'nggi 7 kun)</h4>
      <div class="card" style="padding:20px">${buildBarChart(s.posts_per_day)}</div>`;
  }

  else if (tab === "users") {
    const r = await api("GET", "/admin/users");
    if (!r.ok) { content.innerHTML = "Xatolik"; return; }
    content.innerHTML = `
      <div class="section-header mb-3">
        <h3>👥 Foydalanuvchilar (${r.data.length})</h3>
      </div>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Postlar</th><th>Topshiriqlar</th><th>Admin</th><th>Faol</th><th>Ro'yxat</th><th>Amallar</th></tr></thead>
        <tbody>
          ${r.data.map(u => `
          <tr>
            <td>${u.id}</td>
            <td><strong>${esc(u.username)}</strong></td>
            <td><span class="text-muted">${esc(u.email)}</span></td>
            <td>${u.posts_count}</td>
            <td>${u.tasks_count}</td>
            <td>${u.is_admin ? `<span class="badge badge-yellow">Admin</span>` : "-"}</td>
            <td>${u.is_active ? `<span class="badge badge-green">Ha</span>` : `<span class="badge badge-red">Yo'q</span>`}</td>
            <td><span class="text-small text-muted">${formatDate(u.created_at)}</span></td>
            <td style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn-ghost btn-sm" onclick="adminToggleActive(${u.id},${u.is_active})">${u.is_active?"Bloklash":"Aktivlashtirish"}</button>
              ${u.id !== STATE.user.id ? `<button class="btn-danger btn-sm" onclick="adminDeleteUser(${u.id})">O'chirish</button>` : ""}
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }

  else if (tab === "posts") {
    const r = await api("GET", "/admin/posts");
    if (!r.ok) { content.innerHTML = "Xatolik"; return; }
    content.innerHTML = `
      <h3 class="mb-3">📝 Postlar (${r.data.length})</h3>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Muallif</th><th>Matn</th><th>Rasm</th><th>✊</th><th>💬</th><th>Sana</th><th>Amal</th></tr></thead>
        <tbody>
          ${r.data.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${esc(p.username)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.content||"")}</td>
            <td>${p.image ? "✓" : "-"}</td>
            <td>${p.likes_count}</td>
            <td>${p.comments_count}</td>
            <td><span class="text-small text-muted">${formatDate(p.created_at)}</span></td>
            <td><button class="btn-danger btn-sm" onclick="adminDeletePost(${p.id})">O'chirish</button></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }

  else if (tab === "tasks") {
    const r = await api("GET", "/admin/tasks");
    if (!r.ok) { content.innerHTML = "Xatolik"; return; }
    content.innerHTML = `
      <h3 class="mb-3">📋 Topshiriqlar (${r.data.length})</h3>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Muallif</th><th>Nomi</th><th>Vaqt</th><th>Kategoriya</th><th>Bajarildi</th><th>Amal</th></tr></thead>
        <tbody>
          ${r.data.map(t => `
          <tr>
            <td>${t.id}</td>
            <td>${esc(t.username)}</td>
            <td>${esc(t.title)}</td>
            <td>${esc(t.time_start.substring(0,5))} – ${esc(t.time_end.substring(0,5))}</td>
            <td><span class="badge badge-blue">${esc(t.category)}</span></td>
            <td>${t.is_done ? `<span class="badge badge-green">Ha</span>` : "-"}</td>
            <td><button class="btn-danger btn-sm" onclick="adminDeleteTask(${t.id})">O'chirish</button></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }

  else if (tab === "comments") {
    const r = await api("GET", "/admin/comments");
    if (!r.ok) { content.innerHTML = "Xatolik"; return; }
    content.innerHTML = `
      <h3 class="mb-3">💬 Izohlar (${r.data.length})</h3>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Muallif</th><th>Izoh</th><th>Sana</th><th>Amal</th></tr></thead>
        <tbody>
          ${r.data.map(c => `
          <tr>
            <td>${c.id}</td>
            <td>${esc(c.username)}</td>
            <td style="max-width:300px">${esc(c.content)}</td>
            <td><span class="text-small text-muted">${formatDate(c.created_at)}</span></td>
            <td><button class="btn-danger btn-sm" onclick="adminDeleteComment(${c.id})">O'chirish</button></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }

  else if (tab === "activity") {
    const r = await api("GET", "/admin/activity");
    if (!r.ok) { content.innerHTML = "Xatolik"; return; }
    const icons = { register:"🎉", login:"🔑", profile_update:"✏️", task_created:"📋", task_done:"✅", task_deleted:"🗑️", post_created:"📝", subscribe:"➕", unsubscribe:"➖" };
    content.innerHTML = `
      <h3 class="mb-3">📜 Faoliyat logi (${r.data.length})</h3>
      ${r.data.map(a => `
        <div class="activity-item">
          <div class="activity-icon">${icons[a.action]||"📌"}</div>
          <div>
            <div class="activity-text"><strong>${esc(a.username)}</strong> — ${esc(a.action)} ${a.details ? `(${esc(a.details)})` : ""}</div>
            <div class="activity-time">${formatTime(a.created_at)}</div>
          </div>
        </div>`).join("")}`;
  }
}

async function adminToggleActive(uid, isActive) {
  await api("PUT", `/admin/users/${uid}`, { is_active: isActive ? 0 : 1 });
  adminTab("users", document.querySelector(".admin-nav-item.active"));
}
async function adminDeleteUser(uid) {
  if (!confirm("Foydalanuvchini o'chirasizmi? Bu amalni qaytarib bo'lmaydi!")) return;
  await api("DELETE", `/admin/users/${uid}`);
  adminTab("users", document.querySelector(".admin-nav-item.active"));
}
async function adminDeletePost(pid) {
  if (!confirm("Postni o'chirasizmi?")) return;
  await api("DELETE", `/admin/posts/${pid}`);
  adminTab("posts", document.querySelector(".admin-nav-item.active"));
}
async function adminDeleteTask(tid) {
  if (!confirm("Topshiriqni o'chirasizmi?")) return;
  await api("DELETE", `/admin/tasks/${tid}`);
  adminTab("tasks", document.querySelector(".admin-nav-item.active"));
}
async function adminDeleteComment(cid) {
  if (!confirm("Izohni o'chirasizmi?")) return;
  await api("DELETE", `/admin/comments/${cid}`);
  adminTab("comments", document.querySelector(".admin-nav-item.active"));
}


// ═══════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function avatarHtml(u, size = 40) {
  if (!u) return "";
  const bg = u.bg_color || "#3b82f6";
  const letter = (u.username || "?")[0].toUpperCase();
  return `<div class="post-avatar" style="width:${size}px;height:${size}px;background:${esc(bg)};border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size*0.4)}px">
    ${u.avatar ? `<img src="/static/uploads/${esc(u.avatar)}" alt="av" style="width:100%;height:100%;object-fit:cover"/>` : esc(letter)}
  </div>`;
}

function formatTime(dt) {
  if (!dt) return "";
  const d = new Date(dt.replace(" ", "T") + (dt.includes("+") ? "" : "Z"));
  if (isNaN(d)) return dt;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)   return "Hozir";
  if (diff < 3600) return `${Math.floor(diff/60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff/3600)} soat oldin`;
  if (diff < 604800) return `${Math.floor(diff/86400)} kun oldin`;
  return d.toLocaleDateString("uz-UZ");
}

function formatDate(dt) {
  if (!dt) return "";
  return new Date(dt.replace(" ","T")).toLocaleDateString("uz-UZ");
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initApp);
