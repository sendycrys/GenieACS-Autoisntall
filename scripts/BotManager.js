const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

class GenieACSBot {
    constructor(config) {
        console.log(`[${Date.now()}] Initializing bot for ${config.name}...`);
        this.config = config;
        this.name = config.name;
        
        // Validasi konfigurasi
        if (!this.validateConfig()) {
            console.error(`[${Date.now()}] Failed to validate config for ${this.name}`);
            return;
        }

        try {
            console.log(`[${Date.now()}] Creating bot instance for ${this.name}...`);
            this.bot = new TelegramBot(config.botToken, {
                polling: true,
                onlyFirstMatch: true,
                request: {
                    timeout: 30000
                }
            });

            // Test koneksi bot
            this.bot.getMe().then((botInfo) => {
                console.log(`[${Date.now()}] Bot connected successfully as @${botInfo.username}`);
                this.setupHandlers();
            }).catch((error) => {
                console.error(`[${Date.now()}] Failed to connect bot:`, error.message);
                this.bot = null;
            });

        } catch (error) {
            console.error(`[${Date.now()}] Error in constructor:`, error.message);
            this.bot = null;
        }
    }

    validateConfig() {
        if (!this.config.botToken) {
            console.error(`[${this.name}] Error: Bot token tidak ditemukan`);
            return false;
        }

        if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(this.config.botToken)) {
            console.error(`[${this.name}] Error: Format bot token tidak valid`);
            return false;
        }

        if (!Array.isArray(this.config.adminIds) || this.config.adminIds.length === 0) {
            console.error(`[${this.name}] Warning: Tidak ada admin yang terdaftar`);
        }

        if (!this.config.genieacs?.baseUrl) {
            console.error(`[${this.name}] Error: URL GenieACS tidak ditemukan`);
            return false;
        }

        return true;
    }

    isInitialized() {
        return !!this.bot;
    }

    escapeHtml(text) {
        if (typeof text !== 'string') text = String(text ?? '');
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    async safeSendMessage(chatId, text, options = { parse_mode: 'HTML' }) {
        try {
            return await this.bot.sendMessage(chatId, text, options);
        } catch (e) {
            if (options && options.parse_mode) {
                console.warn(`[${this.name}] Formatted send failed (${e.message}), fallback to plain text`);
                const plain = text
                    .replace(/<[^>]+>/g, '')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');
                return await this.bot.sendMessage(chatId, plain, {});
            }
            throw e;
        }
    }

    findDeviceMatch(query, devices) {
        if (!query || !devices) return null;
        const q = String(query).trim().toLowerCase();
        
        // 1. Exact matches
        for (const d of devices) {
            const vp = d.VirtualParameters || {};
            const devId = d._deviceId || {};
            const sn = (vp.getSerialNumber?._value || devId._SerialNumber || "").toLowerCase();
            const user1 = (vp.pppoeUsername?._value || "").toLowerCase();
            const user2 = (vp.pppoeUsername2?._value || "").toLowerCase();
            const ip = (vp.pppoeIP?._value || "").toLowerCase();
            const rawId = (d._id || "").toLowerCase();

            if (sn === q || user1 === q || user2 === q || ip === q || rawId === q) {
                return d;
            }
        }

        // 2. Partial / substring matches
        for (const d of devices) {
            const vp = d.VirtualParameters || {};
            const devId = d._deviceId || {};
            const sn = (vp.getSerialNumber?._value || devId._SerialNumber || "").toLowerCase();
            const user1 = (vp.pppoeUsername?._value || "").toLowerCase();
            const user2 = (vp.pppoeUsername2?._value || "").toLowerCase();
            const ip = (vp.pppoeIP?._value || "").toLowerCase();
            const rawId = (d._id || "").toLowerCase();

            if ((sn && sn.includes(q)) || (user1 && user1.includes(q)) || (user2 && user2.includes(q)) || (ip && ip.includes(q)) || rawId.includes(q)) {
                return d;
            }
        }

        return null;
    }

    setupHandlers() {
        // Logging semua pesan masuk
        this.bot.on('message', (msg) => {
            console.log(`[${Date.now()}] [${msg.chat.id}] ${msg.text || ''}`);
        });

        // /myid - Dapatkan ID Telegram
        this.bot.onText(/\/myid/i, async (msg) => {
            const chatId = msg.chat.id;
            await this.safeSendMessage(chatId, 
                `🆔 <b>ID Telegram Anda:</b>\n\n` +
                `<code>${chatId}</code>\n\n` +
                `Salin ID di atas untuk didaftarkan sebagai Admin di Panel GenieACS atau sebagai Pelanggan.`,
                { parse_mode: 'HTML' }
            );
        });

        // /start - Menu Utama
        this.bot.onText(/\/start/i, async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = this.config.adminIds.includes(chatId.toString());
            const customer = this.config.customers?.[chatId.toString()];

            if (!isAdmin && !customer) {
                return await this.safeSendMessage(chatId, 
                    `👋 <b>Selamat datang di Bot GenieACS - ARTHA MEDIA NETWORK</b>\n\n` +
                    `⚠️ Akun Telegram Anda belum terdaftar di sistem.\n\n` +
                    `📋 <b>Langkah Pendaftaran:</b>\n` +
                    `1. Ketik perintah /myid\n` +
                    `2. Salin ID Telegram Anda\n` +
                    `3. Berikan ke admin atau simpan di GenieACS Admin UI.\n`,
                    { parse_mode: 'HTML' }
                );
            }

            if (isAdmin) {
                const helpMsg = 
                    `📡 <b>ARTHA MEDIA NETWORK - GENIEACS BOT</b>\n` +
                    `💻 <b>Admin Control Panel</b>\n\n` +
                    `📋 <b>Perintah Monitoring:</b>\n` +
                    `• <code>/device</code> atau <code>/devices</code> - Ringkasan &amp; daftar perangkat\n` +
                    `• <code>/device &lt;nama/SN/IP&gt;</code> - Cari perangkat spesifik\n` +
                    `• <code>/status &lt;SN/User&gt;</code> - Cek detail koneksi &amp; status ONT\n` +
                    `• <code>/signal &lt;SN/User&gt;</code> - Cek redaman optik &amp; suhu\n` +
                    `• <code>/wifi &lt;SN/User&gt;</code> - Cek konfigurasi WiFi &amp; total klien\n` +
                    `• <code>/users &lt;SN/User&gt;</code> - Daftar IP &amp; MAC klien terhubung\n\n` +
                    `⚙️ <b>Perintah Kontrol:</b>\n` +
                    `• <code>/reboot &lt;SN/User&gt;</code> - Restart / reboot ONT jarak jauh\n` +
                    `• <code>/setwifi &lt;SN/User&gt; &lt;SSID&gt;</code> - Ganti nama SSID WiFi\n` +
                    `• <code>/setpass &lt;SN/User&gt; &lt;Password&gt;</code> - Ganti password WiFi\n\n` +
                    `👥 <b>Perintah Pelanggan:</b>\n` +
                    `• <code>/customers</code> - Daftar akun pelanggan bot\n` +
                    `• <code>/addcustomer &lt;ID&gt; &lt;Nama&gt; &lt;SN&gt;</code> - Tambah akses pelanggan\n` +
                    `• <code>/delcustomer &lt;ID&gt;</code> - Hapus akses pelanggan\n\n` +
                    `💡 <i>Tips: Anda dapat menggunakan nama PPPoE atau Serial Number ONT untuk setiap perintah!</i>`;

                await this.safeSendMessage(chatId, helpMsg, { parse_mode: 'HTML' });
            } else {
                await this.safeSendMessage(chatId, 
                    `👋 <b>Halo ${this.escapeHtml(customer.name)}</b>\n` +
                    `Selamat datang di layanan bot mandiri ARTHA MEDIA NETWORK.\n\n` +
                    `📋 <b>Perintah yang dapat digunakan:</b>\n` +
                    `• <code>/mystatus</code> - Cek status koneksi router Anda\n` +
                    `• <code>/mywifi</code> - Cek nama WiFi router Anda\n` +
                    `• <code>/changepass &lt;password_baru&gt;</code> - Ubah password WiFi\n\n` +
                    `🔒 <i>Password WiFi minimal 8 karakter kombinasi huruf dan angka.</i>`,
                    { parse_mode: 'HTML' }
                );
            }
        });

        // /devices & /device - Daftar dan Pencarian Perangkat
        this.bot.onText(/\/(?:devices|device)(?:\s+(.+))?/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) {
                return await this.safeSendMessage(chatId, '❌ Anda tidak memiliki izin akses perintah admin.');
            }

            const query = match && match[1] ? match[1].trim() : null;

            try {
                const devices = await this.getDevicesFromGenieACS();
                if (!devices || devices.length === 0) {
                    return await this.safeSendMessage(chatId, '❌ Tidak ada perangkat yang terdaftar di GenieACS.');
                }

                // If query is text keyword (not a plain page number)
                if (query && isNaN(query)) {
                    const qLower = query.toLowerCase();
                    const filtered = devices.filter(d => {
                        const vp = d.VirtualParameters || {};
                        const devId = d._deviceId || {};
                        const sn = (vp.getSerialNumber?._value || devId._SerialNumber || "").toLowerCase();
                        const user1 = (vp.pppoeUsername?._value || "").toLowerCase();
                        const user2 = (vp.pppoeUsername2?._value || "").toLowerCase();
                        const ip = (vp.pppoeIP?._value || "").toLowerCase();
                        const rawId = (d._id || "").toLowerCase();
                        return sn.includes(qLower) || user1.includes(qLower) || user2.includes(qLower) || ip.includes(qLower) || rawId.includes(qLower);
                    });

                    if (filtered.length === 0) {
                        return await this.safeSendMessage(chatId, `❌ Tidak ada perangkat yang cocok dengan: <code>${this.escapeHtml(query)}</code>`, { parse_mode: 'HTML' });
                    }

                    let message = `🔍 <b>Hasil Pencarian ("${this.escapeHtml(query)}"):</b> (${filtered.length} perangkat)\n\n`;
                    filtered.slice(0, 10).forEach((device, index) => {
                        const vParams = device.VirtualParameters || {};
                        const devId = device._deviceId || {};
                        const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                        const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                        const ip = vParams.pppoeIP?._value || '-';
                        const rx = vParams.RXPower?._value || '-';
                        const isOnline = Boolean(device.Events?.Registered?._value || vParams.pppoeIP?._value || vParams.getdeviceuptime?._value);
                        const status = isOnline ? '🟢 Online' : '🔴 Offline';
                        const targetId = user !== '-' ? user : sn;

                        message += `<b>${index + 1}. ${this.escapeHtml(sn)}</b> [${status}]\n`;
                        message += `👤 User: <code>${this.escapeHtml(user)}</code>\n`;
                        message += `🌐 IP: <code>${this.escapeHtml(ip)}</code> | RX: <code>${this.escapeHtml(rx)} dBm</code>\n`;
                        message += `⚡ <code>/status ${this.escapeHtml(targetId)}</code> | <code>/wifi ${this.escapeHtml(targetId)}</code> | <code>/reboot ${this.escapeHtml(targetId)}</code>\n\n`;
                    });

                    if (filtered.length > 10) {
                        message += `<i>Menampilkan 10 dari ${filtered.length} hasil. Persempit pencarian untuk hasil lebih spesifik.</i>`;
                    }
                    return await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
                }

                // General list / pagination
                const page = (query && !isNaN(query)) ? Math.max(1, parseInt(query)) : 1;
                const pageSize = 10;
                const totalPages = Math.ceil(devices.length / pageSize) || 1;
                const currentPage = Math.min(page, totalPages);
                const startIdx = (currentPage - 1) * pageSize;
                const pagedDevices = devices.slice(startIdx, startIdx + pageSize);

                let onlineCount = 0;
                devices.forEach(d => {
                    const vp = d.VirtualParameters || {};
                    if (d.Events?.Registered?._value || vp.pppoeIP?._value || vp.getdeviceuptime?._value) onlineCount++;
                });
                const offlineCount = devices.length - onlineCount;

                let message = `📡 <b>ARTHA MEDIA NETWORK - DAFTAR DEVICE</b>\n`;
                message += `📊 Total: <b>${devices.length}</b> | 🟢 Online: <b>${onlineCount}</b> | 🔴 Offline: <b>${offlineCount}</b>\n`;
                message += `📄 Halaman <b>${currentPage}</b> dari <b>${totalPages}</b>\n\n`;

                pagedDevices.forEach((device, index) => {
                    const vParams = device.VirtualParameters || {};
                    const devId = device._deviceId || {};
                    const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                    const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                    const ip = vParams.pppoeIP?._value || '-';
                    const rx = vParams.RXPower?._value || '-';
                    const isOnline = Boolean(device.Events?.Registered?._value || vParams.pppoeIP?._value || vParams.getdeviceuptime?._value);
                    const status = isOnline ? '🟢' : '🔴';
                    const targetId = user !== '-' ? user : sn;

                    message += `${status} <b>${startIdx + index + 1}. ${this.escapeHtml(user !== '-' ? user : sn)}</b>\n`;
                    message += `   SN: <code>${this.escapeHtml(sn)}</code> | IP: <code>${this.escapeHtml(ip)}</code>\n`;
                    message += `   RX: <code>${this.escapeHtml(rx)} dBm</code> ⚡ <code>/status ${this.escapeHtml(targetId)}</code>\n\n`;
                });

                message += `💡 <b>Tips:</b> Ketik <code>/device &lt;nama/SN/IP&gt;</code> untuk cari perangkat.\n`;
                if (currentPage < totalPages) {
                    message += `⚡ Halaman berikutnya: <code>/devices ${currentPage + 1}</code>`;
                }

                await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
            } catch (error) {
                console.error(`Error in /devices:`, error);
                await this.safeSendMessage(chatId, '❌ Terjadi kesalahan saat mengambil daftar perangkat.');
            }
        });

        // /status <SN/User>
        this.bot.onText(/\/status(?:\s+(.+))?/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match && match[1] ? match[1].trim() : null;
            if (!searchTerm) {
                return await this.safeSendMessage(chatId, '❗ Format: <code>/status &lt;SN atau PPPoE Username&gt;</code>', { parse_mode: 'HTML' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const isOnline = Boolean(device.Events?.Registered?._value || vParams.pppoeIP?._value || vParams.getdeviceuptime?._value);
                const status = isOnline ? '🟢 Online' : '🔴 Offline';
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                const model = (devId._Manufacturer || '') + ' ' + (devId._ProductClass || '');
                const targetId = user !== '-' ? user : sn;

                const message = 
                    `📋 <b>INFORMASI PERANGKAT</b>\n\n` +
                    `👤 <b>Pelanggan:</b> <code>${this.escapeHtml(user)}</code>\n` +
                    `📱 <b>SN:</b> <code>${this.escapeHtml(sn)}</code>\n` +
                    `🏷️ <b>Model:</b> <code>${this.escapeHtml(model)}</code>\n` +
                    `⚡ <b>Mode:</b> <code>${this.escapeHtml(vParams.getponmode?._value || '-')}</code>\n\n` +
                    `🌐 <b>Jaringan:</b>\n` +
                    `• Status: ${status}\n` +
                    `• IP PPPoE: <code>${this.escapeHtml(vParams.pppoeIP?._value || '-')}</code>\n` +
                    `• IP TR069: <code>${this.escapeHtml(vParams.IPTR069?._value || '-')}</code>\n` +
                    `• Uptime Router: <code>${this.escapeHtml(vParams.getdeviceuptime?._value || '-')}</code>\n` +
                    `• Uptime PPPoE: <code>${this.escapeHtml(vParams.getpppuptime?._value || '-')}</code>\n\n` +
                    `📶 <b>Optik &amp; Suhu:</b>\n` +
                    `• RX Power: <code>${this.escapeHtml(vParams.RXPower?._value || '-')} dBm</code>\n` +
                    `• Suhu ONT: <code>${this.escapeHtml(vParams.gettemp?._value || '-')} °C</code>\n\n` +
                    `📡 <b>WiFi:</b>\n` +
                    `• SSID: <code>${this.escapeHtml(vParams.WifiSSID?._value || '-')}</code>\n` +
                    `• Klien Aktif: <b>${this.escapeHtml(String(vParams.activedevices?._value || '0'))} user</b>\n\n` +
                    `⚙️ <b>Aksi Cepat:</b>\n` +
                    `<code>/signal ${this.escapeHtml(targetId)}</code> - Cek Signal\n` +
                    `<code>/wifi ${this.escapeHtml(targetId)}</code> - Info WiFi\n` +
                    `<code>/reboot ${this.escapeHtml(targetId)}</code> - Restart Device`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
            } catch (err) {
                console.error('Error in /status:', err);
                await this.safeSendMessage(chatId, '❌ Gagal mengambil status perangkat.');
            }
        });

        // /signal <SN/User>
        this.bot.onText(/\/signal(?:\s+(.+))?/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match && match[1] ? match[1].trim() : null;
            if (!searchTerm) {
                return await this.safeSendMessage(chatId, '❗ Format: <code>/signal &lt;SN atau PPPoE Username&gt;</code>', { parse_mode: 'HTML' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                const rx = parseFloat(vParams.RXPower?._value);
                let rxStatus = "⚪ Belum terbaca";
                if (!isNaN(rx)) {
                    if (rx >= -24.0) rxStatus = "🟢 Sangat Bagus (Optimal)";
                    else if (rx >= -27.0) rxStatus = "🟡 Normal / Cukup";
                    else rxStatus = "🔴 Redaman Drop (Kritis)";
                }

                const message = 
                    `📶 <b>PEMANTAUAN SINYAL OPTIK</b>\n\n` +
                    `👤 User: <code>${this.escapeHtml(user)}</code>\n` +
                    `📱 SN: <code>${this.escapeHtml(sn)}</code>\n` +
                    `⚡ Mode: <code>${this.escapeHtml(vParams.getponmode?._value || 'EPON')}</code>\n\n` +
                    `📊 <b>Hasil Pengukuran:</b>\n` +
                    `• RX Optical Power: <b>${this.escapeHtml(vParams.RXPower?._value || '-')} dBm</b>\n` +
                    `• Kondisi: ${rxStatus}\n` +
                    `• Suhu Perangkat: <code>${this.escapeHtml(vParams.gettemp?._value || '-')} °C</code>`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
            } catch (err) {
                console.error('Error in /signal:', err);
                await this.safeSendMessage(chatId, '❌ Gagal membaca sinyal optik.');
            }
        });

        // /wifi <SN/User>
        this.bot.onText(/\/wifi(?:\s+(.+))?/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match && match[1] ? match[1].trim() : null;
            if (!searchTerm) {
                return await this.safeSendMessage(chatId, '❗ Format: <code>/wifi &lt;SN atau PPPoE Username&gt;</code>', { parse_mode: 'HTML' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                const wlan = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'];
                const targetId = user !== '-' ? user : sn;

                const message = 
                    `📡 <b>DETAIL WIFI (WLAN 1)</b>\n\n` +
                    `👤 User: <code>${this.escapeHtml(user)}</code>\n` +
                    `📱 SN: <code>${this.escapeHtml(sn)}</code>\n\n` +
                    `• Nama SSID: <code>${this.escapeHtml(wlan?.SSID?._value || vParams.WifiSSID?._value || '-')}</code>\n` +
                    `• Status Radio: ${wlan?.Enable?._value ? '🟢 Aktif (Enabled)' : '🔴 Nonaktif'}\n` +
                    `• Channel: <code>${this.escapeHtml(String(wlan?.Channel?._value || '-'))}</code>\n` +
                    `• Klien Terhubung: <b>${this.escapeHtml(String(wlan?.TotalAssociations?._value || vParams.activedevices?._value || '0'))} perangkat</b>\n\n` +
                    `⚡ <code>/users ${this.escapeHtml(targetId)}</code> - Daftar klien WiFi\n` +
                    `⚡ <code>/setwifi ${this.escapeHtml(targetId)} &lt;NamaSSID&gt;</code> - Ubah nama WiFi\n` +
                    `⚡ <code>/setpass ${this.escapeHtml(targetId)} &lt;Password&gt;</code> - Ubah password WiFi`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
            } catch (err) {
                console.error('Error in /wifi:', err);
                await this.safeSendMessage(chatId, '❌ Gagal mengambil data WiFi.');
            }
        });

        // /users <SN/User> - Klien WiFi terhubung
        this.bot.onText(/\/users(?:\s+(.+))?/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match && match[1] ? match[1].trim() : null;
            if (!searchTerm) {
                return await this.safeSendMessage(chatId, '❗ Format: <code>/users &lt;SN atau PPPoE Username&gt;</code>', { parse_mode: 'HTML' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                const wlan = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'];
                const assoc = wlan?.AssociatedDevice || {};
                const clientKeys = Object.keys(assoc).filter(k => !k.startsWith('_'));

                let message = `👥 <b>KLIEN WIFI TERHUBUNG (SSID 1)</b>\n\n`;
                message += `👤 User: <code>${this.escapeHtml(user)}</code>\n`;
                message += `📱 SN: <code>${this.escapeHtml(sn)}</code>\n`;
                message += `📡 SSID: <code>${this.escapeHtml(wlan?.SSID?._value || vParams.WifiSSID?._value || '-')}</code>\n`;
                message += `📊 Total Klien: <b>${clientKeys.length || vParams.activedevices?._value || 0} perangkat</b>\n\n`;

                if (clientKeys.length > 0) {
                    clientKeys.forEach((k, idx) => {
                        const cl = assoc[k];
                        const ip = cl.AssociatedDeviceIPAddress?._value || '-';
                        const mac = cl.AssociatedDeviceMACAddress?._value || '-';
                        const auth = cl.AssociatedDeviceAuthenticationState?._value || 'TRUE';
                        message += `${idx + 1}. IP: <code>${this.escapeHtml(ip)}</code>\n`;
                        message += `   MAC: <code>${this.escapeHtml(mac)}</code> [${auth === 'TRUE' ? '🟢 Aktif' : '⚪'}]\n`;
                    });
                } else {
                    message += `<i>Tidak ada klien aktif yang terhubung ke SSID 1 saat ini.</i>\n`;
                }

                await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
            } catch (err) {
                console.error('Error in /users:', err);
                await this.safeSendMessage(chatId, '❌ Gagal mengambil daftar pengguna WiFi.');
            }
        });

        // /reboot <SN/User>
        this.bot.onText(/\/reboot(?:\s+(.+))?/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match && match[1] ? match[1].trim() : null;
            if (!searchTerm) {
                return await this.safeSendMessage(chatId, '❗ Format: <code>/reboot &lt;SN atau PPPoE Username&gt;</code>', { parse_mode: 'HTML' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';

                await this.safeSendMessage(chatId, `⏳ Mengirim perintah reboot ke <code>${this.escapeHtml(user !== '-' ? user : sn)}</code>...`, { parse_mode: 'HTML' });

                await this.rebootDevice(encodeURIComponent(device._id));

                await this.safeSendMessage(chatId, 
                    `🔄 <b>PERINTAH REBOOT BERHASIL DIKIRIM</b>\n\n` +
                    `👤 User: <code>${this.escapeHtml(user)}</code>\n` +
                    `📱 SN: <code>${this.escapeHtml(sn)}</code>\n` +
                    `🌐 IP: <code>${this.escapeHtml(vParams.pppoeIP?._value || '-')}</code>\n\n` +
                    `Perangkat sedang melakukan proses restart otomatis.`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                console.error('Error in /reboot:', err);
                await this.safeSendMessage(chatId, `❌ Gagal reboot perangkat: ${this.escapeHtml(err.message)}`, { parse_mode: 'HTML' });
            }
        });

        // /setwifi <SN/User> <SSID>
        this.bot.onText(/\/setwifi\s+(\S+)\s+(.+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match[1].trim();
            const newSSID = match[2].trim();

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';

                await this.setWiFiSSID(encodeURIComponent(device._id), newSSID);

                await this.safeSendMessage(chatId, 
                    `✅ <b>NAMA WIFI BERHASIL DIUBAH!</b>\n\n` +
                    `👤 User: <code>${this.escapeHtml(user)}</code>\n` +
                    `📱 SN: <code>${this.escapeHtml(sn)}</code>\n` +
                    `📡 SSID Baru: <code>${this.escapeHtml(newSSID)}</code>\n\n` +
                    `⚠️ Perangkat klien perlu reconnect ke SSID baru.`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                console.error('Error in /setwifi:', err);
                await this.safeSendMessage(chatId, `❌ Gagal mengubah nama WiFi: ${this.escapeHtml(err.message)}`, { parse_mode: 'HTML' });
            }
        });

        // /setpass <SN/User> <Password>
        this.bot.onText(/\/setpass\s+(\S+)\s+(.+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const searchTerm = match[1].trim();
            const newPass = match[2].trim();

            if (newPass.length < 8) {
                return await this.safeSendMessage(chatId, '❌ Password WiFi minimal harus 8 karakter!');
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat <code>${this.escapeHtml(searchTerm)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';

                await this.setWiFiPassword(encodeURIComponent(device._id), newPass);

                await this.safeSendMessage(chatId, 
                    `✅ <b>PASSWORD WIFI BERHASIL DIUBAH!</b>\n\n` +
                    `👤 User: <code>${this.escapeHtml(user)}</code>\n` +
                    `📱 SN: <code>${this.escapeHtml(sn)}</code>\n` +
                    `🔑 Password Baru: <code>${this.escapeHtml(newPass)}</code>\n\n` +
                    `⚠️ Klien perlu reconnect menggunakan password baru.`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                console.error('Error in /setpass:', err);
                await this.safeSendMessage(chatId, `❌ Gagal mengubah password WiFi: ${this.escapeHtml(err.message)}`, { parse_mode: 'HTML' });
            }
        });

        // Pelanggan: /mystatus
        this.bot.onText(/\/mystatus/i, async (msg) => {
            const chatId = msg.chat.id;
            const customer = this.config.customers?.[chatId.toString()];
            if (!customer) return;

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(customer.deviceSN, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, '❌ Perangkat Anda tidak ditemukan di sistem.');
                }

                const vParams = device.VirtualParameters || {};
                const isOnline = Boolean(device.Events?.Registered?._value || vParams.pppoeIP?._value || vParams.getdeviceuptime?._value);
                const status = isOnline ? '🟢 Online' : '🔴 Offline';

                const message = 
                    `📱 <b>STATUS ROUTER ANDA</b>\n\n` +
                    `Pelanggan: <b>${this.escapeHtml(customer.name)}</b>\n` +
                    `Status: ${status}\n` +
                    `Signal Optik: <code>${this.escapeHtml(vParams.RXPower?._value || '-')} dBm</code>\n` +
                    `IP Address: <code>${this.escapeHtml(vParams.pppoeIP?._value || '-')}</code>\n` +
                    `Uptime: <code>${this.escapeHtml(vParams.getdeviceuptime?._value || '-')}</code>\n`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
            } catch (error) {
                await this.safeSendMessage(chatId, '❌ Gagal mengambil status perangkat Anda.');
            }
        });

        // Pelanggan: /changepass <password>
        this.bot.onText(/\/changepass\s+(.+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            const customer = this.config.customers?.[chatId.toString()];
            if (!customer) return;

            const newPass = match[1].trim();
            if (newPass.length < 8) {
                return await this.safeSendMessage(chatId, '❌ Password WiFi minimal harus 8 karakter!');
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(customer.deviceSN, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, '❌ Perangkat Anda tidak ditemukan.');
                }

                await this.setWiFiPassword(encodeURIComponent(device._id), newPass);
                await this.safeSendMessage(chatId, 
                    `✅ <b>Password WiFi berhasil diubah!</b>\n\n` +
                    `Password baru: <code>${this.escapeHtml(newPass)}</code>\n\n` +
                    `⚠️ Silakan sambungkan kembali perangkat WiFi Anda dengan password baru.`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                await this.safeSendMessage(chatId, '❌ Gagal mengubah password WiFi.');
            }
        });

        // Admin: /customers
        this.bot.onText(/\/customers/i, async (msg) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const customers = this.config.customers || {};
            const keys = Object.keys(customers);
            if (keys.length === 0) {
                return await this.safeSendMessage(chatId, 
                    '👥 <b>Daftar Pelanggan Bot:</b>\n<i>Belum ada pelanggan yang didaftarkan.</i>\n\n' +
                    'Gunakan: <code>/addcustomer &lt;ID_TELEGRAM&gt; &lt;NAMA&gt; &lt;SN&gt;</code>',
                    { parse_mode: 'HTML' }
                );
            }

            let message = `👥 <b>DAFTAR PELANGGAN BOT (${keys.length}):</b>\n\n`;
            keys.forEach((id, idx) => {
                const c = customers[id];
                message += `${idx + 1}. <b>${this.escapeHtml(c.name)}</b>\n`;
                message += `   ID: <code>${id}</code> | SN: <code>${this.escapeHtml(c.deviceSN)}</code>\n`;
                message += `   Hapus: <code>/delcustomer ${id}</code>\n\n`;
            });

            await this.safeSendMessage(chatId, message, { parse_mode: 'HTML' });
        });

        // Admin: /addcustomer <ID> <Nama> <SN>
        this.bot.onText(/\/addcustomer\s+(\S+)\s+(\S+)\s+(\S+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const [_, telegramId, customerName, deviceSN] = match;
            try {
                if (!this.config.customers) this.config.customers = {};
                this.config.customers[telegramId] = {
                    name: customerName,
                    deviceSN: deviceSN,
                    allowedCommands: ["wifi-status", "wifi-password"]
                };

                await this.saveConfig();

                await this.safeSendMessage(chatId, 
                    `✅ <b>Pelanggan berhasil didaftarkan!</b>\n\n` +
                    `Nama: <code>${this.escapeHtml(customerName)}</code>\n` +
                    `ID: <code>${telegramId}</code>\n` +
                    `SN: <code>${this.escapeHtml(deviceSN)}</code>`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                await this.safeSendMessage(chatId, '❌ Gagal mendaftarkan pelanggan.');
            }
        });

        // Admin: /delcustomer <ID>
        this.bot.onText(/\/delcustomer\s+(\S+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.config.adminIds.includes(chatId.toString())) return;

            const telegramId = match[1];
            if (this.config.customers && this.config.customers[telegramId]) {
                const name = this.config.customers[telegramId].name;
                delete this.config.customers[telegramId];
                await this.saveConfig();
                await this.safeSendMessage(chatId, `✅ Pelanggan <b>${this.escapeHtml(name)}</b> (<code>${telegramId}</code>) berhasil dihapus.`, { parse_mode: 'HTML' });
            } else {
                await this.safeSendMessage(chatId, `❌ Pelanggan dengan ID <code>${telegramId}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
            }
        });
    }

    async getDevicesFromGenieACS() {
        const url = `${this.config.genieacs.baseUrl}/devices`;
        const response = await axios.get(url, {
            auth: {
                username: this.config.genieacs.username,
                password: this.config.genieacs.password
            },
            timeout: 10000
        });
        return response.data;
    }

    async getDeviceInfo(deviceId) {
        const url = `${this.config.genieacs.baseUrl}/devices/${deviceId}`;
        const response = await axios.get(url, {
            auth: {
                username: this.config.genieacs.username,
                password: this.config.genieacs.password
            },
            timeout: 10000
        });
        return response.data;
    }

    async rebootDevice(deviceId) {
        const url = `${this.config.genieacs.baseUrl}/devices/${deviceId}/tasks?connection_request`;
        const response = await axios.post(url, {
            name: 'reboot'
        }, {
            auth: {
                username: this.config.genieacs.username,
                password: this.config.genieacs.password
            },
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return response.data;
    }

    async setWiFiPassword(deviceId, password) {
        const url = `${this.config.genieacs.baseUrl}/devices/${deviceId}/tasks?connection_request`;
        const response = await axios.post(url, {
            name: 'setParameterValues',
            parameterValues: [
                ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase', password, 'xsd:string'],
                ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey', password, 'xsd:string']
            ]
        }, {
            auth: {
                username: this.config.genieacs.username,
                password: this.config.genieacs.password
            },
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return response.data;
    }

    async setWiFiSSID(deviceId, ssid) {
        const url = `${this.config.genieacs.baseUrl}/devices/${deviceId}/tasks?connection_request`;
        const response = await axios.post(url, {
            name: 'setParameterValues',
            parameterValues: [
                ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID', ssid, 'xsd:string']
            ]
        }, {
            auth: {
                username: this.config.genieacs.username,
                password: this.config.genieacs.password
            },
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return response.data;
    }

    async saveConfig() {
        const fs = require('fs').promises;
        const configPath = require('path').resolve(__dirname, 'config.js');
        const configContent = `module.exports = ${JSON.stringify(this.config, null, 2)};\n`;
        await fs.writeFile(configPath, configContent);
    }
}

module.exports = GenieACSBot;
