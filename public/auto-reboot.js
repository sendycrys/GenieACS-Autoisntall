/**
 * Auto Reboot Web UI Controller
 * Artha Media Network - GenieACS
 */

(function () {
  let autoRebootData = null;
  let isLoading = false;

  // Fetch data from backend API
  async function fetchData() {
    isLoading = true;
    try {
      const res = await fetch("/api/auto-reboot");
      if (res.status === 401) {
        showToast("Sesi habis, silakan login kembali.", "error");
        return;
      }
      const data = await res.json();
      if (data.ok) {
        autoRebootData = data;
        updateUI();
      } else {
        showToast("Gagal memuat data: " + (data.error || "Unknown"), "error");
      }
    } catch (err) {
      showToast("Koneksi API gagal: " + err.message, "error");
    } finally {
      isLoading = false;
    }
  }

  // Save settings
  async function saveSettings(e) {
    if (e) e.preventDefault();
    const saveBtn = document.getElementById("arb-save-btn");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Menyimpan...";
    }

    const enabled = document.getElementById("arb-enabled-toggle").checked;
    const intervalDays = parseInt(document.getElementById("arb-interval-select").value) || 3;
    const targetHour = parseInt(document.getElementById("arb-hour-select").value) || 3;
    const targetModel = document.getElementById("arb-model-input").value.trim() || "F663NV9";
    const minUptimeHours = parseInt(document.getElementById("arb-uptime-input").value) || 12;
    const staggerSeconds = parseInt(document.getElementById("arb-stagger-input").value) || 2;

    const payload = {
      config: {
        enabled,
        intervalDays,
        targetHour,
        targetMinute: 0,
        targetModel,
        minUptimeHours,
        staggerSeconds
      }
    };

    try {
      const res = await fetch("/api/auto-reboot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Pengaturan Auto-Reboot berhasil disimpan!", "success");
        await fetchData();
      } else {
        showToast("Gagal menyimpan: " + (data.error || "Gagal"), "error");
      }
    } catch (err) {
      showToast("Kesalahan jaringan: " + err.message, "error");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = "💾 Simpan Pengaturan";
      }
    }
  }

  // Trigger Action (Dry Run, Trigger Now, or Reboot Single)
  async function triggerAction(actionName, extraParams = {}) {
    const isNow = actionName === "trigger-now";
    const isSingle = actionName === "reboot-single";

    if (isNow) {
      const confirmRun = confirm(
        "PERINGATAN: Anda akan me-reboot seluruh ONT F663NV9 yang memenuhi kriteria sekarang juga!\n\nLanjutkan eksekusi reboot?"
      );
      if (!confirmRun) return;
    }

    if (isSingle) {
      const confirmSingle = confirm(
        `Konfirmasi reboot ONT ${extraParams.deviceId} (${extraParams.user || "Pelanggan"}) sekarang?`
      );
      if (!confirmSingle) return;
    }

    showToast(
      isNow ? "Memulai proses reboot seluruh target..." :
      isSingle ? `Mengirim perintah reboot ke ${extraParams.deviceId}...` :
      "Menjalankan simulasi (Dry Run)...",
      "info"
    );

    try {
      const res = await fetch("/api/auto-reboot/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, ...extraParams })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(
          isNow ? "Perintah reboot berhasil dikirim ke antrean!" :
          isSingle ? `Perintah reboot ONT ${extraParams.deviceId} berhasil!` :
          "Simulasi selesai! Silakan periksa log aktivitas.",
          "success"
        );
        await fetchData();
      } else {
        showToast("Gagal: " + (data.error || "Terjadi kesalahan"), "error");
      }
    } catch (err) {
      showToast("Kesalahan: " + err.message, "error");
    }
  }

  // Toast Notification
  function showToast(message, type = "info") {
    let container = document.getElementById("arb-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "arb-toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `arb-toast arb-toast-${type}`;
    const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
    toast.innerHTML = `<span class="arb-toast-icon">${icon}</span><span class="arb-toast-msg">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("arb-toast-fade");
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // Render main view into DOM
  function renderAutoRebootView(targetMount) {
    let mount = targetMount || document.getElementById("auto-reboot-mount");
    if (!mount) return;

    document.title = "Auto Reboot - GenieACS";

    if (!autoRebootData) {
      mount.innerHTML = `
        <div class="arb-loading-box">
          <div class="arb-spinner"></div>
          <div style="margin-top: 15px; font-weight: 500; color: #94a3b8;">Memuat Pengaturan & Parameter Lengkap ONT F663NV9...</div>
        </div>
      `;
      fetchData();
      return;
    }

    updateUI(mount);
  }

  function destroyAutoRebootView() {
    // Unmounted by Mithril router
  }

  // Update DOM with data
  function updateUI(targetMount) {
    const mount = targetMount || document.getElementById("auto-reboot-mount");
    if (!mount || !autoRebootData) return;

    const { config, state, devices, logs } = autoRebootData;
    const isEnabled = config.enabled;
    const targetCount = devices ? devices.length : 0;
    const onlineCount = devices ? devices.filter(d => d.isOnline).length : 0;

    mount.innerHTML = `
      <div class="arb-container">
        <!-- Top Hero Header -->
        <div class="arb-hero-header">
          <div>
            <div class="arb-hero-title">
              <span class="arb-title-icon">⚡</span> Auto Reboot ONT Manager
            </div>
            <div class="arb-hero-sub">
              Penjadwalan Reboot Otomatis Berkala Khusus Model <strong>${config.targetModel}</strong> &bull; ARTHA MEDIA NETWORK
            </div>
          </div>
          <div class="arb-hero-actions">
            <span class="arb-status-badge ${isEnabled ? 'arb-status-active' : 'arb-status-inactive'}">
              <span class="arb-status-dot"></span>
              ${isEnabled ? 'AUTO-REBOOT AKTIF' : 'AUTO-REBOOT NONAKTIF'}
            </span>
            <button id="arb-refresh-btn" class="arb-btn arb-btn-outline" title="Refresh data">
              🔄 Refresh
            </button>
          </div>
        </div>

        <!-- 4 Quick Stat Cards -->
        <div class="arb-stats-grid">
          <div class="arb-stat-card">
            <div class="arb-stat-label">TARGET PERANGKAT</div>
            <div class="arb-stat-value text-cyan">${targetCount} <span class="arb-stat-unit">ONT</span></div>
            <div class="arb-stat-desc">Model: <strong>${config.targetModel}</strong> (${onlineCount} Online)</div>
          </div>
          <div class="arb-stat-card">
            <div class="arb-stat-label">JADWAL RUTIN</div>
            <div class="arb-stat-value text-blue">Setiap ${config.intervalDays} Hari</div>
            <div class="arb-stat-desc">Pukul <strong>${String(config.targetHour).padStart(2, "0")}:00 WIB</strong> (Pagi)</div>
          </div>
          <div class="arb-stat-card">
            <div class="arb-stat-label">STATUS EKSEKUSI TERAKHIR</div>
            <div class="arb-stat-value text-emerald">${state.rebooted || 0} <span class="arb-stat-unit">Reboot</span></div>
            <div class="arb-stat-desc">${state.lastRunWib || "Belum ada eksekusi"}</div>
          </div>
          <div class="arb-stat-card">
            <div class="arb-stat-label">PROTEKSI UPTIME</div>
            <div class="arb-stat-value text-amber">${config.minUptimeHours} <span class="arb-stat-unit">Jam</span></div>
            <div class="arb-stat-desc">Lewati ONT baru restart (< ${config.minUptimeHours}h)</div>
          </div>
        </div>

        <!-- Main Content 2 Columns -->
        <div class="arb-main-grid">
          <!-- Left Column: Form Settings -->
          <div class="arb-card">
            <div class="arb-card-header">
              <div class="arb-card-title">⚙️ Konfigurasi Jadwal & Parameter</div>
            </div>
            <div class="arb-card-body">
              <form id="arb-settings-form">
                <!-- Toggle Enable -->
                <div class="arb-form-group">
                  <div class="arb-toggle-wrapper">
                    <div>
                      <div class="arb-label-bold">Aktifkan Auto-Reboot Berkala</div>
                      <div class="arb-help-text">Jika aktif, cron akan mengeksekusi reboot secara otomatis sesuai jadwal.</div>
                    </div>
                    <label class="arb-switch">
                      <input type="checkbox" id="arb-enabled-toggle" ${isEnabled ? "checked" : ""}>
                      <span class="arb-slider"></span>
                    </label>
                  </div>
                </div>

                <div class="arb-form-row">
                  <!-- Interval Days -->
                  <div class="arb-form-group" style="flex: 1;">
                    <label class="arb-label">Interval Frekuensi</label>
                    <select id="arb-interval-select" class="arb-select">
                      <option value="1" ${config.intervalDays === 1 ? "selected" : ""}>Setiap 1 Hari (Harian)</option>
                      <option value="2" ${config.intervalDays === 2 ? "selected" : ""}>Setiap 2 Hari</option>
                      <option value="3" ${config.intervalDays === 3 ? "selected" : ""}>Setiap 3 Hari Sekali (Rekomendasi NOC)</option>
                      <option value="5" ${config.intervalDays === 5 ? "selected" : ""}>Setiap 5 Hari</option>
                      <option value="7" ${config.intervalDays === 7 ? "selected" : ""}>Setiap 7 Hari (Mingguan)</option>
                      <option value="10" ${config.intervalDays === 10 ? "selected" : ""}>Setiap 10 Hari</option>
                    </select>
                  </div>

                  <!-- Hour Select -->
                  <div class="arb-form-group" style="flex: 1;">
                    <label class="arb-label">Jam Eksekusi (WIB)</label>
                    <select id="arb-hour-select" class="arb-select">
                      ${[...Array(24).keys()].map(h => `
                        <option value="${h}" ${config.targetHour === h ? "selected" : ""}>
                          Jam ${String(h).padStart(2, "0")}:00 WIB ${h === 3 ? "(Rekomendasi Jam 3 Pagi)" : ""}
                        </option>
                      `).join("")}
                    </select>
                  </div>
                </div>

                <div class="arb-form-row">
                  <!-- Model Target -->
                  <div class="arb-form-group" style="flex: 1;">
                    <label class="arb-label">Filter Model Target ONT</label>
                    <input type="text" id="arb-model-input" class="arb-input" value="${config.targetModel}" placeholder="Contoh: F663NV9" />
                    <div class="arb-help-text">Hanya ONT dengan ProductClass / ID ini yang direboot.</div>
                  </div>

                  <!-- Min Uptime Protection -->
                  <div class="arb-form-group" style="flex: 1;">
                    <label class="arb-label">Proteksi Uptime Minimal (Jam)</label>
                    <input type="number" id="arb-uptime-input" class="arb-input" value="${config.minUptimeHours}" min="1" max="168" />
                    <div class="arb-help-text">Jika ONT baru menyala < ${config.minUptimeHours} jam, dilewati.</div>
                  </div>
                </div>

                <!-- Stagger Delay -->
                <div class="arb-form-group">
                  <label class="arb-label">Jeda Stagger Antar ONT (Detik)</label>
                  <input type="number" id="arb-stagger-input" class="arb-input" value="${config.staggerSeconds}" min="1" max="30" />
                  <div class="arb-help-text">Delay antrean reboot bertahap agar OLT & PPPoE tidak lonjak sekaligus.</div>
                </div>

                <!-- Action Button Group -->
                <div class="arb-btn-group">
                  <button type="submit" id="arb-save-btn" class="arb-btn arb-btn-primary">
                    💾 Simpan Pengaturan
                  </button>
                  <button type="button" id="arb-dryrun-btn" class="arb-btn arb-btn-secondary">
                    🧪 Jalankan Simulasi (Dry Run)
                  </button>
                  <button type="button" id="arb-now-btn" class="arb-btn arb-btn-danger">
                    ⚡ Reboot Semua Sekarang
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- Right Column: Live Terminal Log Viewer -->
          <div class="arb-card">
            <div class="arb-card-header">
              <div class="arb-card-title">📜 Log Eksekusi & Riwayat Terakhir</div>
              <button id="arb-refresh-log-btn" class="arb-btn arb-btn-xs arb-btn-outline">
                🔄 Refresh Log
              </button>
            </div>
            <div class="arb-card-body" style="padding: 0;">
              <div class="arb-terminal-box" id="arb-log-box">
                ${logs && logs.length ? logs.map(line => {
                  let cls = "text-slate";
                  if (line.includes("[SUCCESS]")) cls = "text-emerald";
                  else if (line.includes("[WARN]") || line.includes("[SKIP]")) cls = "text-amber";
                  else if (line.includes("[ERROR]") || line.includes("[FAILED]")) cls = "text-rose";
                  else if (line.includes("[INFO]")) cls = "text-cyan";
                  return `<div class="arb-terminal-line ${cls}">${escapeHtml(line)}</div>`;
                }).join("") : '<div class="arb-terminal-line text-slate">Belum ada catatan log.</div>'}
              </div>
            </div>
          </div>
        </div>

        <!-- Full Width Bottom Section: Target ONT Device Table -->
        <div class="arb-card" style="margin-top: 24px;">
          <div class="arb-card-header">
            <div>
              <div class="arb-card-title">📡 Daftar Lengkap Parameter ONT F663NV9 (${devices ? devices.length : 0} Perangkat)</div>
              <div class="arb-help-text" style="margin-top: 4px;">Informasi lengkap Username PPPoE, WiFi SSID, Optical RX Power, IP Address, dan status uptime.</div>
            </div>
            <div>
              <input type="text" id="arb-search-input" class="arb-input" placeholder="🔍 Cari ID, User, SSID, IP..." style="width: 280px; padding: 7px 14px; font-size: 13px;" />
            </div>
          </div>
          <div class="arb-card-body" style="padding: 0; overflow-x: auto;">
            <table class="arb-table" id="arb-devices-table">
              <thead>
                <tr>
                  <th style="width: 35px;">#</th>
                  <th>ID / NAMA PELANGGAN</th>
                  <th>WIFI SSID</th>
                  <th>OPTICAL RX</th>
                  <th>IP PPPOE</th>
                  <th>SERIAL NUMBER</th>
                  <th>UPTIME</th>
                  <th>STATUS JADWAL</th>
                  <th style="text-align: center; width: 90px;">AKSI</th>
                </tr>
              </thead>
              <tbody>
                ${devices && devices.length ? devices.map((d, idx) => {
                  const isEligible = d.uptime >= (config.minUptimeHours * 3600);
                  const uptimeBadge = isEligible
                    ? `<span class="arb-badge arb-badge-warning">Perlu Reboot (${d.uptimeFormatted})</span>`
                    : `<span class="arb-badge arb-badge-safe">Baru Reboot (${d.uptimeFormatted})</span>`;

                  // Format RX Power badge
                  let rxVal = parseFloat(d.rx);
                  let rxClass = "text-emerald";
                  if (!isNaN(rxVal)) {
                    if (rxVal <= -27) rxClass = "text-rose";
                    else if (rxVal <= -24) rxClass = "text-amber";
                  }

                  const searchText = `${d.id} ${d.serial} ${d.user} ${d.ssid} ${d.ip} ${d.tr069Ip}`.toLowerCase();

                  return `
                    <tr class="arb-device-row" data-search="${escapeHtml(searchText)}">
                      <td style="color: #64748b; font-size: 12px;">${idx + 1}</td>
                      <td>
                        <div style="font-weight: 600; color: #f8fafc; font-size: 13.5px;">${d.user ? escapeHtml(d.user) : escapeHtml(d.id)}</div>
                        <div style="font-family: monospace; font-size: 11px; color: #38bdf8; margin-top: 2px;">${escapeHtml(d.id)}</div>
                      </td>
                      <td>
                        <span style="font-weight: 500; color: #e2e8f0;">${d.ssid !== '-' ? escapeHtml(d.ssid) : '<span style="color:#64748b;">-</span>'}</span>
                      </td>
                      <td>
                        <span class="${rxClass}" style="font-family: monospace; font-weight: 600; font-size: 12.5px;">${escapeHtml(d.rx)}</span>
                      </td>
                      <td>
                        <span style="font-family: monospace; font-size: 12px; color: #38bdf8;">${d.ip && d.ip !== '0.0.0.0' ? escapeHtml(d.ip) : '<span style="color:#64748b;">-</span>'}</span>
                      </td>
                      <td style="font-family: monospace; font-size: 12px; color: #94a3b8;">${escapeHtml(d.serial)}</td>
                      <td style="font-weight: 500;">${d.uptimeFormatted}</td>
                      <td>${uptimeBadge}</td>
                      <td style="text-align: center;">
                        <button class="arb-btn-reboot-single arb-btn arb-btn-xs arb-btn-secondary" data-id="${escapeHtml(d.id)}" data-user="${escapeHtml(d.user || d.id)}" title="Reboot hanya ONT ini">
                          🔄 Reboot
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("") : `
                  <tr><td colspan="9" style="text-align: center; padding: 24px; color: #64748b;">Tidak ada ONT yang cocok dengan model ${config.targetModel}</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    const form = document.getElementById("arb-settings-form");
    if (form) form.addEventListener("submit", saveSettings);

    const refreshBtn = document.getElementById("arb-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => {
      showToast("Memperbarui data...", "info");
      fetchData();
    });

    const refreshLogBtn = document.getElementById("arb-refresh-log-btn");
    if (refreshLogBtn) refreshLogBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/auto-reboot/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fetch-logs" })
        });
        const data = await res.json();
        if (data.ok && data.logs) {
          autoRebootData.logs = data.logs;
          const logBox = document.getElementById("arb-log-box");
          if (logBox) {
            logBox.innerHTML = data.logs.map(line => {
              let cls = "text-slate";
              if (line.includes("[SUCCESS]")) cls = "text-emerald";
              else if (line.includes("[WARN]") || line.includes("[SKIP]")) cls = "text-amber";
              else if (line.includes("[ERROR]") || line.includes("[FAILED]")) cls = "text-rose";
              else if (line.includes("[INFO]")) cls = "text-cyan";
              return `<div class="arb-terminal-line ${cls}">${escapeHtml(line)}</div>`;
            }).join("");
            logBox.scrollTop = logBox.scrollHeight;
          }
          showToast("Log diperbarui!", "success");
        }
      } catch (e) {}
    });

    const dryrunBtn = document.getElementById("arb-dryrun-btn");
    if (dryrunBtn) dryrunBtn.addEventListener("click", () => triggerAction("dry-run"));

    const nowBtn = document.getElementById("arb-now-btn");
    if (nowBtn) nowBtn.addEventListener("click", () => triggerAction("trigger-now"));

    // Single Reboot buttons
    document.querySelectorAll(".arb-btn-reboot-single").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const user = e.currentTarget.getAttribute("data-user");
        triggerAction("reboot-single", { deviceId: id, user });
      });
    });

    // Realtime Search
    const searchInput = document.getElementById("arb-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const val = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll(".arb-device-row");
        rows.forEach(r => {
          const text = r.getAttribute("data-search") || "";
          r.style.display = text.includes(val) ? "" : "none";
        });
      });
    }

    // Auto scroll terminal log to bottom
    const logBox = document.getElementById("arb-log-box");
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Expose methods for Mithril component lifecycle
  window.renderAutoRebootView = renderAutoRebootView;
  window.destroyAutoRebootView = destroyAutoRebootView;
  window.initAutoRebootApp = renderAutoRebootView;

  // Initial render if mount point is already in DOM
  const existingMount = window.__arbMount || document.getElementById("auto-reboot-mount");
  if (existingMount) {
    renderAutoRebootView(existingMount);
  }
})();