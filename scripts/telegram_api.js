/**
 * Telegram API & Controller for GenieACS Admin UI
 * Artha Media Network
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { exec, execSync } = require("child_process");

const SETTINGS_PATH = "/opt/genieacs/scripts/telegram_settings.json";
const TELEBOT_CONFIG_PATH = "/opt/genieacs/telebot-acs/config.js";
const SYSTEMCTL_BIN = "sudo /bin/systemctl";

const DEFAULT_CONFIG = {
  enabled: true,
  botToken: "",
  adminIds: "1566563344",
  groupChatId: "",
  notifyOffline: true,
  notifyRxDrop: true,
  rxDropThreshold: -27.0,
  notifyNewDevice: true
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) };
    }
  } catch (e) {}

  // Fallback: extract from /root/telebot-acs/config.js if exists
  try {
    if (fs.existsSync(TELEBOT_CONFIG_PATH)) {
      delete require.cache[require.resolve(TELEBOT_CONFIG_PATH)];
      const tc = require(TELEBOT_CONFIG_PATH);
      const s1 = tc.servers?.server1;
      if (s1) {
        return {
          ...DEFAULT_CONFIG,
          botToken: s1.botToken || "",
          adminIds: Array.isArray(s1.adminIds) ? s1.adminIds.join(", ") : (s1.adminIds || "1566563344"),
          groupChatId: s1.groupChatId || ""
        };
      }
    }
  } catch (e) {}

  return { ...DEFAULT_CONFIG };
}

function saveSettings(cfg) {
  const merged = { ...DEFAULT_CONFIG, ...cfg };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), "utf8");

  // Also sync to /root/telebot-acs/config.js
  try {
    const adminList = (merged.adminIds || "")
      .split(/[,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const configJsContent = `module.exports = {
  servers: {
    server1: {
      name: "ARTHA MEDIA NETWORK",
      botToken: ${JSON.stringify(merged.botToken || "")},
      adminIds: ${JSON.stringify(adminList)},
      groupChatId: ${JSON.stringify(merged.groupChatId || "")},
      notifyOffline: ${Boolean(merged.notifyOffline)},
      notifyRxDrop: ${Boolean(merged.notifyRxDrop)},
      rxDropThreshold: ${parseFloat(merged.rxDropThreshold) || -27.0},
      notifyNewDevice: ${Boolean(merged.notifyNewDevice)},
      customers: {},
      genieacs: {
        baseUrl: "http://127.0.0.1:7557",
        username: "Sendy",
        password: "Sendy1603"
      }
    }
  }
};
`;
    fs.writeFileSync(TELEBOT_CONFIG_PATH, configJsContent, "utf8");
  } catch (err) {
    console.error("Failed to write /root/telebot-acs/config.js:", err.message);
  }

  // Attempt to restart systemd service if running
  try {
    exec(`${SYSTEMCTL_BIN} restart genieacs-telebot`, (err) => {
      if (err) console.error("Error restarting genieacs-telebot:", err.message);
    });
  } catch (e) {}

  return merged;
}

function checkTelegramToken(token) {
  return new Promise((resolve) => {
    if (!token || !token.includes(":")) {
      return resolve({ ok: false, error: "Format token tidak valid" });
    }
    const req = https.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            resolve({ ok: true, bot: json.result });
          } else {
            resolve({ ok: false, error: json.description || "Token tidak diizinkan (401)" });
          }
        } catch (e) {
          resolve({ ok: false, error: "Gagal parse respons Telegram" });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Koneksi ke Telegram timeout" });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

function sendTelegramMessage(token, chatId, text) {
  return new Promise((resolve) => {
    if (!token || !chatId) {
      return resolve({ ok: false, error: "Token atau Chat ID belum diisi" });
    }
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown"
    });

    const req = https.request({
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            resolve({ ok: true, result: json.result });
          } else {
            resolve({ ok: false, error: json.description || `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ ok: false, error: "Gagal parse respons Telegram" });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Koneksi ke Telegram timeout" });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}

function getServiceStatus() {
  try {
    const status = execSync(`${SYSTEMCTL_BIN} is-active genieacs-telebot 2>&1`, { encoding: "utf8" }).trim();
    return status;
  } catch (e) {
    return e.stdout ? e.stdout.trim() : "inactive";
  }
}

async function handleGet(ctx) {
  const config = loadSettings();
  let botCheck = { ok: false };
  if (config.botToken) {
    botCheck = await checkTelegramToken(config.botToken);
  }
  const serviceStatus = getServiceStatus();

  ctx.status = 200;
  ctx.body = {
    ok: true,
    config,
    bot: botCheck,
    service: {
      status: serviceStatus,
      name: "genieacs-telebot"
    }
  };
}

async function handleSave(ctx) {
  const body = ctx.request.body || {};
  const config = body.config || body;
  const saved = saveSettings(config);

  // Re-check token
  let botCheck = { ok: false };
  if (saved.botToken) {
    botCheck = await checkTelegramToken(saved.botToken);
  }

  ctx.status = 200;
  ctx.body = {
    ok: true,
    message: "Pengaturan Telegram berhasil disimpan!",
    config: saved,
    bot: botCheck,
    serviceStatus: getServiceStatus()
  };
}

async function handleTest(ctx) {
  const body = ctx.request.body || {};
  const token = body.botToken || loadSettings().botToken;
  const chatId = body.chatId || (loadSettings().adminIds.split(/[,;\s]+/)[0]) || loadSettings().groupChatId;

  if (!token) {
    ctx.status = 400;
    ctx.body = { ok: false, error: "Token Bot belum diisi!" };
    return;
  }
  if (!chatId) {
    ctx.status = 400;
    ctx.body = { ok: false, error: "ID Telegram tujuan belum diisi!" };
    return;
  }

  const now = new Date();
  const wibTime = new Date(now.getTime() + (7 * 3600 * 1000)).toISOString().replace("T", " ").replace("Z", "").slice(0, 19) + " WIB";
  const testMsg = `🚀 *Tes Notifikasi GenieACS*\n\n` +
    `✅ Koneksi Telegram dari *ARTHA MEDIA NETWORK* berhasil terhubung!\n` +
    `📅 Waktu: \`${wibTime}\`\n` +
    `🌐 Server: \`192.168.8.253\``;

  const result = await sendTelegramMessage(token, chatId, testMsg);
  if (result.ok) {
    ctx.status = 200;
    ctx.body = { ok: true, message: `Pesan tes berhasil dikirim ke ID: ${chatId}!` };
  } else {
    ctx.status = 400;
    ctx.body = { ok: false, error: `Gagal mengirim pesan: ${result.error}` };
  }
}

async function handleAction(ctx) {
  const body = ctx.request.body || {};
  const action = body.action || "restart";

  try {
    if (action === "restart") {
      execSync(`${SYSTEMCTL_BIN} restart genieacs-telebot`);
    } else if (action === "start") {
      execSync(`${SYSTEMCTL_BIN} start genieacs-telebot`);
    } else if (action === "stop") {
      execSync(`${SYSTEMCTL_BIN} stop genieacs-telebot`);
    }
    ctx.status = 200;
    ctx.body = { ok: true, status: getServiceStatus() };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { ok: false, error: e.message };
  }
}

module.exports = {
  handleGet,
  handleSave,
  handleTest,
  handleAction
};
