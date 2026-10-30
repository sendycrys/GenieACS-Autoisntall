/**
 * Background Monitoring & Automated Alerting Engine for GenieACS Telegram Bot
 * Artha Media Network
 */

const http = require('http');
const https = require('https');

let isRunning = false;
let monitorInterval = null;
const knownOnline = new Set();
const warnedRx = new Set();
let isInitialRun = true;

function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return Promise.resolve();
  const payload = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

function getWibTime() {
  const now = new Date();
  const wib = new Date(now.getTime() + (7 * 3600 * 1000));
  return wib.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19) + ' WIB';
}

function fetchDevices(nbiUrl = 'http://127.0.0.1:7557') {
  return new Promise((resolve) => {
    http.get(`${nbiUrl}/devices?projection=_id,_lastInform,_deviceId,VirtualParameters.pppoeUsername,VirtualParameters.pppoeUsername2,VirtualParameters.RXPower`, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

async function runCheck(serverConfig) {
  const { botToken, adminIds, groupChatId, notifyOffline, notifyRxDrop, rxDropThreshold = -27.0, notifyNewDevice } = serverConfig;
  if (!botToken) return;

  const recipients = [];
  if (Array.isArray(adminIds)) recipients.push(...adminIds);
  if (groupChatId && !recipients.includes(groupChatId)) recipients.push(groupChatId);

  if (recipients.length === 0) return;

  const devices = await fetchDevices(serverConfig.genieacs?.baseUrl);
  if (!devices || devices.length === 0) return;

  const now = Date.now();
  const currentOnline = new Set();

  for (const dev of devices) {
    const id = dev._id;
    const lastInform = dev._lastInform ? new Date(dev._lastInform).getTime() : 0;
    const isOnline = (now - lastInform) <= (6 * 60 * 1000); // 6 min tolerance

    const mfr = dev._deviceId?._Manufacturer || '';
    const model = dev._deviceId?._ProductClass || '';
    const sn = dev._deviceId?._SerialNumber || id;
    const pppoe = dev.VirtualParameters?.pppoeUsername?._value || dev.VirtualParameters?.pppoeUsername2?._value || '-';
    const rxVal = dev.VirtualParameters?.RXPower?._value;
    const rx = (rxVal !== undefined && rxVal !== null && rxVal !== '') ? parseFloat(rxVal) : null;

    if (isOnline) {
      currentOnline.add(id);

      // Check if newly recovered from offline
      if (!isInitialRun && notifyOffline && knownOnline.size > 0 && !knownOnline.has(id)) {
        const msg = `🟢 *ROUTER ONLINE KEMBALI*\n\n` +
          `• *SN:* \`${sn}\`\n` +
          `• *Tipe:* ${mfr} ${model}\n` +
          `• *User PPPoE:* \`${pppoe}\`\n` +
          `• *Waktu:* ${getWibTime()}`;
        for (const r of recipients) await sendTelegramMessage(botToken, r, msg);
      }

      // Check Optical RX Drop
      if (notifyRxDrop && rx !== null && !isNaN(rx) && rx < rxDropThreshold && rx > -40) {
        if (!warnedRx.has(id)) {
          warnedRx.add(id);
          const msg = `⚠️ *PERINGATAN REDAMAN OPTIK BURUK*\n\n` +
            `• *SN:* \`${sn}\`\n` +
            `• *User PPPoE:* \`${pppoe}\`\n` +
            `• *Model:* ${mfr} ${model}\n` +
            `• *Sinyal RX:* *${rx.toFixed(2)} dBm* (Batas: ${rxDropThreshold} dBm)\n` +
            `• *Waktu:* ${getWibTime()}\n` +
            `• *Catatan:* Periksa jalur kabel fiber / ODP pelanggan.`;
          for (const r of recipients) await sendTelegramMessage(botToken, r, msg);
        }
      } else if (rx !== null && rx >= rxDropThreshold) {
        warnedRx.delete(id);
      }

    } else {
      // Device is Offline
      if (!isInitialRun && notifyOffline && knownOnline.has(id)) {
        const msg = `🔴 *PERINGATAN ROUTER OFFLINE / LOS*\n\n` +
          `• *SN:* \`${sn}\`\n` +
          `• *Tipe:* ${mfr} ${model}\n` +
          `• *User PPPoE:* \`${pppoe}\`\n` +
          `• *Waktu:* ${getWibTime()}\n` +
          `• *Status:* Padam / Kabel Terputus`;
        for (const r of recipients) await sendTelegramMessage(botToken, r, msg);
      }
    }
  }

  // Update known online set
  knownOnline.clear();
  currentOnline.forEach(id => knownOnline.add(id));
  isInitialRun = false;
}

function startMonitor(serverConfig) {
  if (isRunning) return;
  isRunning = true;
  console.log(`[${Date.now()}] Background Alert Monitor started.`);
  // Run first check after 10s
  setTimeout(() => runCheck(serverConfig), 10000);
  // Recurring check every 60s
  monitorInterval = setInterval(() => runCheck(serverConfig), 60000);
}

function stopMonitor() {
  if (monitorInterval) clearInterval(monitorInterval);
  isRunning = false;
}

module.exports = {
  startMonitor,
  stopMonitor
};
