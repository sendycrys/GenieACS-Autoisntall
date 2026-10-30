/**
 * Telegram Settings Web UI Controller for GenieACS
 * Artha Media Network
 */

(function () {
  let tgData = null;
  let isLoading = false;
  let isSaving = false;
  let isTesting = false;

  // Show floating toast notification
  function showToast(message, type = "success") {
    const existing = document.getElementById("tg-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "tg-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: ${type === "success" ? "#059669" : type === "error" ? "#dc2626" : "#2563eb"};
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: tgFadeIn 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;
    toast.innerHTML = `<span>${type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ"}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.4s ease";
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // Fetch current settings from backend
  async function fetchSettings() {
    isLoading = true;
    updateUI();
    try {
      const res = await fetch("/api/telegram");
      if (res.status === 401) {
        showToast("Sesi login berakhir. Silakan refresh halaman.", "error");
        return;
      }
      const data = await res.json();
      if (data.ok) {
        tgData = data;
      } else {
        showToast("Gagal memuat pengaturan: " + (data.error || "Unknown"), "error");
      }
    } catch (err) {
      showToast("Koneksi API gagal: " + err.message, "error");
    } finally {
      isLoading = false;
      updateUI();
    }
  }

  // Save settings
  async function saveSettings(e) {
    if (e) e.preventDefault();
    if (isSaving) return;
    isSaving = true;

    const tokenInput = document.getElementById("tg-token-input");
    const adminInput = document.getElementById("tg-admin-input");
    const groupInput = document.getElementById("tg-group-input");
    const notifyOffline = document.getElementById("tg-notify-offline");
    const notifyRxDrop = document.getElementById("tg-notify-rx");
    const rxThreshold = document.getElementById("tg-rx-threshold");
    const notifyNewDevice = document.getElementById("tg-notify-new");

    const payload = {
      config: {
        botToken: tokenInput ? tokenInput.value.trim() : "",
        adminIds: adminInput ? adminInput.value.trim() : "",
        groupChatId: groupInput ? groupInput.value.trim() : "",
        notifyOffline: notifyOffline ? notifyOffline.checked : true,
        notifyRxDrop: notifyRxDrop ? notifyRxDrop.checked : true,
        rxDropThreshold: rxThreshold ? parseFloat(rxThreshold.value) || -27.0 : -27.0,
        notifyNewDevice: notifyNewDevice ? notifyNewDevice.checked : true
      }
    };

    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        tgData = { ...tgData, ...data };
        showToast("Pengaturan Telegram berhasil disimpan & Bot di-reload!", "success");
      } else {
        showToast("Gagal menyimpan: " + (data.error || "Error"), "error");
      }
    } catch (err) {
      showToast("Koneksi gagal: " + err.message, "error");
    } finally {
      isSaving = false;
      updateUI();
    }
  }

  // Send test message
  async function sendTestMessage() {
    if (isTesting) return;
    isTesting = true;
    updateUI();

    const tokenInput = document.getElementById("tg-token-input");
    const adminInput = document.getElementById("tg-admin-input");

    const token = tokenInput ? tokenInput.value.trim() : "";
    const adminId = adminInput ? adminInput.value.trim().split(/[,;\s]+/)[0] : "";

    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token, chatId: adminId })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || "Pesan tes berhasil dikirim ke Telegram!", "success");
      } else {
        showToast(data.error || "Gagal mengirim pesan tes.", "error");
      }
    } catch (err) {
      showToast("Gagal terhubung ke API: " + err.message, "error");
    } finally {
      isTesting = false;
      updateUI();
    }
  }

  // Service control action (start/stop/restart)
  async function controlService(action) {
    try {
      const res = await fetch("/api/telegram/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Layanan bot berhasil di-${action}!`, "success");
        setTimeout(fetchSettings, 1000);
      } else {
        showToast("Gagal mengontrol bot: " + (data.error || "Error"), "error");
      }
    } catch (err) {
      showToast("Koneksi gagal: " + err.message, "error");
    }
  }

  // Update DOM
  function updateUI() {
    const mount = document.getElementById("telegram-settings-mount");
    if (!mount) return;

    if (isLoading && !tgData) {
      mount.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #94a3b8; font-family: sans-serif;">
          <div style="font-size: 24px; margin-bottom: 12px;">⏳</div>
          <div>Memuat konfigurasi Telegram Bot...</div>
        </div>
      `;
      return;
    }

    const cfg = tgData?.config || {};
    const bot = tgData?.bot || {};
    const service = tgData?.service || {};
    const isServiceActive = service.status === "active";
    const isBotValid = bot.ok === true;

    mount.innerHTML = `
      <div class="tg-container" style="max-width: 900px; margin: 0 auto; padding: 20px 10px; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        
        <!-- Header -->
        <div style="margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 16px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #f8fafc; margin: 0 0 6px 0; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 28px;">📱</span> Pengaturan Telegram Bot & Monitoring
          </h1>
          <p style="color: #94a3b8; margin: 0; font-size: 14px;">
            Konfigurasi bot Telegram ARTHA MEDIA NETWORK untuk pemantauan ONT otomatis, redaman optik, dan notifikasi LOS.
          </p>
        </div>

        <!-- Status Card -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: ${isBotValid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                ${isBotValid ? '🤖' : '⚠️'}
              </div>
              <div>
                <div style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 4px;">
                  ${isBotValid ? (bot.bot?.first_name || 'Bot Terhubung') : 'Bot Belum Terhubung'}
                  ${isBotValid && bot.bot?.username ? `<span style="font-size: 13px; font-weight: normal; color: #38bdf8; margin-left: 8px;">@${bot.bot.username}</span>` : ''}
                </div>
                <div style="font-size: 13px; display: flex; align-items: center; gap: 12px;">
                  <span style="display: inline-flex; align-items: center; gap: 6px; color: ${isBotValid ? '#10b981' : '#ef4444'}; font-weight: 600;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isBotValid ? '#10b981' : '#ef4444'};"></span>
                    ${isBotValid ? 'Koneksi Telegram OK' : (bot.error || 'Token Tidak Valid')}
                  </span>
                  <span style="color: #64748b;">|</span>
                  <span style="color: ${isServiceActive ? '#10b981' : '#f59e0b'};">
                    Daemon: <strong>${service.status || 'inactive'}</strong>
                  </span>
                </div>
              </div>
            </div>

            <!-- Service Control Buttons -->
            <div style="display: flex; gap: 8px;">
              <button id="tg-restart-btn" style="background: #1e293b; color: #f8fafc; border: 1px solid #334155; padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                🔄 Restart Bot
              </button>
              ${isServiceActive ? `
                <button id="tg-stop-btn" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;">
                  ⏹ Stop
                </button>
              ` : `
                <button id="tg-start-btn" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;">
                  ▶ Start
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- Form Card -->
        <form id="tg-form" style="background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          
          <h2 style="font-size: 16px; font-weight: 600; color: #f8fafc; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
            <span>🔑</span> Kredensial & Akun Telegram
          </h2>

          <!-- Bot Token -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
              Bot Token (dari @BotFather) <span style="color: #ef4444;">*</span>
            </label>
            <div style="position: relative;">
              <input type="password" id="tg-token-input" value="${cfg.botToken || ''}" placeholder="1234567890:ABCdefGhIjkLmNoPqRsTuvWxYz" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 10px 40px 10px 14px; color: #f8fafc; font-family: monospace; font-size: 14px;">
              <button type="button" id="tg-toggle-token" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;">👁</button>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
              Buat bot baru melalui <a href="https://t.me/BotFather" target="_blank" style="color: #38bdf8; text-decoration: none;">@BotFather</a> lalu salin HTTP API Token ke kolom ini.
            </div>
          </div>

          <!-- Admin Telegram IDs -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
              ID Telegram Admin <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="tg-admin-input" value="${cfg.adminIds || ''}" placeholder="Contoh: 1566563344" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; color: #f8fafc; font-size: 14px;">
            <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
              ID Telegram yang berhak mengakses perintah admin. Bisa lebih dari satu ID (pisahkan dengan koma). Cek ID Anda di <a href="https://t.me/userinfobot" target="_blank" style="color: #38bdf8; text-decoration: none;">@userinfobot</a>.
            </div>
          </div>

          <!-- Group/Channel ID -->
          <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
              ID Grup / Channel Notifikasi (Opsional)
            </label>
            <input type="text" id="tg-group-input" value="${cfg.groupChatId || ''}" placeholder="Contoh: -1001234567890 (kosongkan jika hanya ingin kirim ke Admin pribadi)" style="width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; color: #f8fafc; font-size: 14px;">
            <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
              ID grup teknisi tempat bot mengirim alert alarm otomatis. Pastikan bot sudah di-add ke grup tersebut.
            </div>
          </div>

          <hr style="border: 0; border-top: 1px solid #1e293b; margin: 24px 0;">

          <!-- Automated Alerts Section -->
          <h2 style="font-size: 16px; font-weight: 600; color: #f8fafc; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
            <span>🔔</span> Alarm & Notifikasi Otomatis (Monitoring)
          </h2>

          <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
            
            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; background: #020617; padding: 12px 16px; border-radius: 8px; border: 1px solid #1e293b;">
              <input type="checkbox" id="tg-notify-offline" ${cfg.notifyOffline ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #2563eb;">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #f1f5f9;">Notifikasi Router Offline / LOS</div>
                <div style="font-size: 12px; color: #94a3b8;">Kirim pesan peringatan otomatis saat ada router pelanggan mati atau kabel optik putus.</div>
              </div>
            </label>

            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; background: #020617; padding: 12px 16px; border-radius: 8px; border: 1px solid #1e293b;">
              <input type="checkbox" id="tg-notify-rx" ${cfg.notifyRxDrop ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #2563eb;">
              <div style="flex: 1;">
                <div style="font-size: 14px; font-weight: 600; color: #f1f5f9;">Peringatan Redaman Optik Drop / Kritis</div>
                <div style="font-size: 12px; color: #94a3b8;">Kirim alert bila redaman Optical RX Power drop di bawah batas aman.</div>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;" onclick="event.stopPropagation();">
                <span style="font-size: 12px; color: #94a3b8;">Batas:</span>
                <input type="number" id="tg-rx-threshold" step="0.5" value="${cfg.rxDropThreshold !== undefined ? cfg.rxDropThreshold : -27.0}" style="width: 70px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 4px 8px; color: #f8fafc; font-size: 13px; text-align: center;">
                <span style="font-size: 12px; color: #94a3b8;">dBm</span>
              </div>
            </label>

            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; background: #020617; padding: 12px 16px; border-radius: 8px; border: 1px solid #1e293b;">
              <input type="checkbox" id="tg-notify-new" ${cfg.notifyNewDevice ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #2563eb;">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #f1f5f9;">Notifikasi ONT Baru Registrasi</div>
                <div style="font-size: 12px; color: #94a3b8;">Kirim pemberitahuan saat ada ONT baru yang pertama kali dicolok/registrasi ke GenieACS.</div>
              </div>
            </label>

          </div>

          <!-- Bottom Action Buttons -->
          <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; border-top: 1px solid #1e293b; padding-top: 20px;">
            <button type="button" id="tg-test-btn" style="background: #1e293b; color: #38bdf8; border: 1px solid #38bdf8; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
              ${isTesting ? '⏳ Mengirim...' : '📲 Tes Kirim Pesan ke Telegram'}
            </button>
            <button type="submit" id="tg-save-btn" style="background: #2563eb; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
              ${isSaving ? '⏳ Menyimpan...' : '💾 Simpan Pengaturan'}
            </button>
          </div>

        </form>

        <!-- Help Info Card -->
        <div style="background: rgba(30, 41, 59, 0.5); border: 1px dashed #334155; border-radius: 12px; padding: 16px 20px; margin-top: 24px; font-size: 13px; color: #94a3b8; line-height: 1.6;">
          <div style="font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">💡 Perintah Chat yang Tersedia di Bot Telegram:</div>
          <div>• <code>/devices</code> : Ringkasan total ONT online/offline</div>
          <div>• <code>/status &lt;SN&gt;</code> : Cek status router, redaman optik, IP, dan uptime</div>
          <div>• <code>/finduser &lt;username&gt;</code> : Cari data router berdasarkan username PPPoE</div>
          <div>• <code>/wifi &lt;SN&gt;</code> : Cek SSID & Password WiFi pelanggan</div>
          <div>• <code>/setwifi &lt;SN&gt; &lt;SSID&gt;</code> : Ganti nama SSID WiFi jarak jauh</div>
        </div>

      </div>
    `;

    // Attach event listeners
    const form = document.getElementById("tg-form");
    if (form) form.onsubmit = saveSettings;

    const testBtn = document.getElementById("tg-test-btn");
    if (testBtn) testBtn.onclick = sendTestMessage;

    const restartBtn = document.getElementById("tg-restart-btn");
    if (restartBtn) restartBtn.onclick = () => controlService("restart");

    const stopBtn = document.getElementById("tg-stop-btn");
    if (stopBtn) stopBtn.onclick = () => controlService("stop");

    const startBtn = document.getElementById("tg-start-btn");
    if (startBtn) startBtn.onclick = () => controlService("start");

    const toggleBtn = document.getElementById("tg-toggle-token");
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const input = document.getElementById("tg-token-input");
        if (input) {
          if (input.type === "password") {
            input.type = "text";
            toggleBtn.textContent = "🔒";
          } else {
            input.type = "password";
            toggleBtn.textContent = "👁";
          }
        }
      };
    }
  }

  // Mount functions called by Mithril router in app-FOJWPRV7.js
  window.renderTelegramSettingsView = function (dom) {
    if (dom) {
      dom.id = "telegram-settings-mount";
    }
    fetchSettings();
  };

  window.destroyTelegramSettingsView = function () {
    const mount = document.getElementById("telegram-settings-mount");
    if (mount) mount.innerHTML = "";
  };

  // Auto-init if element is already present
  if (document.getElementById("telegram-settings-mount")) {
    fetchSettings();
  }
})();
