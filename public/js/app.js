(() => {
  const API = "/api";

  const state = {
    token: localStorage.getItem("nutriscan_token") || null,
    user: null,
    file: null
  };

  // ---------- Element refs ----------
  const authNav = document.getElementById("authNav");
  const userNav = document.getElementById("userNav");
  const userNameLabel = document.getElementById("userNameLabel");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalClose = document.getElementById("modalClose");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const formLogin = document.getElementById("formLogin");
  const formRegister = document.getElementById("formRegister");
  const loginError = document.getElementById("loginError");
  const registerError = document.getElementById("registerError");

  const dropzone = document.getElementById("dropzone");
  const dropzoneEmpty = document.getElementById("dropzoneEmpty");
  const fileInput = document.getElementById("fileInput");
  const previewImg = document.getElementById("previewImg");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const scanNote = document.getElementById("scanNote");

  const resultsEmpty = document.getElementById("resultsEmpty");
  const resultsLoading = document.getElementById("resultsLoading");
  const resultsContent = document.getElementById("resultsContent");

  const historyStrip = document.getElementById("historyStrip");
  const historyList = document.getElementById("historyList");

  // ---------- Modal ----------
  function openModal(mode) {
    modalOverlay.classList.remove("hidden");
    switchTab(mode);
  }
  function closeModal() {
    modalOverlay.classList.add("hidden");
    loginError.classList.add("hidden");
    registerError.classList.add("hidden");
    formLogin.reset();
    formRegister.reset();
  }
  function switchTab(mode) {
    const isLogin = mode === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabRegister.classList.toggle("active", !isLogin);
    formLogin.classList.toggle("hidden", !isLogin);
    formRegister.classList.toggle("hidden", isLogin);
  }

  document.getElementById("btnShowLogin").addEventListener("click", () => openModal("login"));
  document.getElementById("btnShowRegister").addEventListener("click", () => openModal("register"));
  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
  });
  tabLogin.addEventListener("click", () => switchTab("login"));
  tabRegister.addEventListener("click", () => switchTab("register"));

  // ---------- Auth requests ----------
  async function apiRequest(path, options = {}) {
    const res = await fetch(`${API}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function onAuthSuccess(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem("nutriscan_token", token);
    closeModal();
    updateAuthUI();
  }

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");
    const fd = new FormData(formLogin);
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") })
      });
      onAuthSuccess(data.token, data.user);
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove("hidden");
    }
  });

  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    registerError.classList.add("hidden");
    const fd = new FormData(formRegister);
    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password")
        })
      });
      onAuthSuccess(data.token, data.user);
    } catch (err) {
      registerError.textContent = err.message;
      registerError.classList.remove("hidden");
    }
  });

  document.getElementById("btnLogout").addEventListener("click", () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem("nutriscan_token");
    updateAuthUI();
    historyStrip.classList.add("hidden");
  });

  function updateAuthUI() {
    const loggedIn = Boolean(state.token && state.user);
    authNav.classList.toggle("hidden", loggedIn);
    userNav.classList.toggle("hidden", !loggedIn);
    if (loggedIn) userNameLabel.textContent = state.user.name;

    btnAnalyze.disabled = !loggedIn || !state.file;
    scanNote.textContent = loggedIn
      ? "Ready when you are."
      : "Sign in to analyze a photo.";
  }

  async function restoreSession() {
    if (!state.token) return;
    try {
      const data = await apiRequest("/auth/me", {
        headers: { Authorization: `Bearer ${state.token}` }
      });
      state.user = data.user;
      updateAuthUI();
      renderHistory(data.history || []);
    } catch (err) {
      state.token = null;
      localStorage.removeItem("nutriscan_token");
      updateAuthUI();
    }
  }

  // ---------- Upload ----------
  dropzone.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });
  ["dragover", "dragenter"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("drag-over"); })
  );
  dropzone.addEventListener("drop", (e) => {
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  });

  function setFile(file) {
    if (!file.type.startsWith("image/")) return;
    state.file = file;
    previewImg.src = URL.createObjectURL(file);
    previewImg.classList.remove("hidden");
    dropzoneEmpty.classList.add("hidden");
    updateAuthUI();
  }

  // ---------- Analyze ----------
  btnAnalyze.addEventListener("click", async () => {
    if (!state.file) return;
    if (!state.token) { openModal("login"); return; }

    resultsEmpty.classList.add("hidden");
    resultsContent.classList.add("hidden");
    resultsLoading.classList.remove("hidden");
    btnAnalyze.disabled = true;

    try {
      const fd = new FormData();
      fd.append("image", state.file);

      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");

      renderResults(data);
      restoreSession(); // refresh history strip
    } catch (err) {
      resultsContent.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
      resultsContent.classList.remove("hidden");
    } finally {
      resultsLoading.classList.add("hidden");
      btnAnalyze.disabled = false;
    }
  });

  function scoreBand(score) {
    if (score >= 80) return { cls: "healthy", label: "Healthy" };
    if (score >= 50) return { cls: "moderate", label: "Moderately Healthy" };
    return { cls: "unhealthy", label: "Unhealthy" };
  }

  function renderResults(data) {
    const score = Math.max(0, Math.min(100, parseInt(String(data.health_score).split("/")[0]) || 0));
    const band = scoreBand(score);

    const rows = [
      ["Calories", data.calories],
      ["Total Fat", data.fat],
      ["Saturated Fat", data.saturated_fat, true],
      ["Trans Fat", data.trans_fat, true],
      ["Sodium", data.sodium],
      ["Carbohydrates", data.carbohydrates],
      ["Fiber", data.fiber, true],
      ["Sugar", data.sugar, true],
      ["Protein", data.protein]
    ];

    const rowsHtml = rows
      .map(([label, value, indent]) => `
        <div class="nf-row ${indent ? "indent" : ""}">
          <span>${escapeHtml(label)}</span>
          <span>${escapeHtml(value ?? "N/A")}</span>
        </div>
      `)
      .join("");

    const benefits = (data.benefits || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    const risks = (data.risks || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");

    resultsContent.innerHTML = `
      <div class="nf-label">
        <div class="nf-head">
          <h3>${escapeHtml(data.food_name || "Unknown Food")}</h3>
          <p class="nf-category">${escapeHtml(data.category || "")}</p>
        </div>

        <div class="nf-score-row">
          <div>
            <div class="nf-score-num">${score}<span style="font-size:1rem;color:var(--muted)">/100</span></div>
            <div class="nf-score-label">Health Score</div>
          </div>
          <span class="nf-badge ${band.cls}">${escapeHtml(data.classification || band.label)}</span>
        </div>
        <div class="nf-bar-track"><div class="nf-bar-fill" style="width:${score}%"></div></div>

        ${rowsHtml}

        <div class="nf-section">
          <h4>Why</h4>
          <p style="margin:0;font-size:0.92rem;">${escapeHtml(data.recommendation || "")}</p>
        </div>

        ${benefits ? `<div class="nf-section"><h4>Benefits</h4><ul>${benefits}</ul></div>` : ""}
        ${risks ? `<div class="nf-section"><h4>Risks</h4><ul>${risks}</ul></div>` : ""}

        <div class="nf-alt">
          <strong>Healthier Alternative</strong>
          ${escapeHtml(data.alternative || "None suggested")}
        </div>

        <div class="nf-download">
          <button class="btn btn-ghost btn-block" id="btnDownload">Download JSON Report</button>
        </div>
      </div>
    `;
    resultsContent.classList.remove("hidden");

    document.getElementById("btnDownload").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "NutriScan_report.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ---------- History ----------
  function renderHistory(history) {
    if (!history.length) { historyStrip.classList.add("hidden"); return; }
    historyStrip.classList.remove("hidden");
    historyList.innerHTML = history
      .slice()
      .reverse()
      .map(
        (h) => `
        <div class="history-chip">
          <span class="hc-name">${escapeHtml(h.food_name || "Unknown")}</span>
          <span class="hc-score">${h.health_score ?? "—"}/100 · ${escapeHtml(h.classification || "")}</span>
        </div>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // ---------- Init ----------
  updateAuthUI();
  restoreSession();
})();
