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

    escapeMarkdown(text) {
        if (typeof text !== 'string') text = String(text || '');
        return text.replace(/[_*[\]()~`>#+=|{}.!\-]/g, '\\$&');
    }

    async safeSendMessage(chatId, text, options = {}) {
        try {
            return await this.bot.sendMessage(chatId, text, options);
        } catch (e) {
            if (options.parse_mode) {
                console.warn(`[${this.name}] Markdown send failed, fallback to plain text: ${e.message}`);
                const plain = text.replace(/\\([_*[\]()~`>#+=|{}.!\-])/g, '$1');
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
                `🆔 *ID Telegram Anda:*\n\n` +
                `\`${chatId}\`\n\n` +
                `Salin ID di atas untuk didaftarkan sebagai Admin di Panel GenieACS atau sebagai Pelanggan\\.`,
                { parse_mode: 'MarkdownV2' }
            );
        });

        // /start - Menu Utama
        this.bot.onText(/\/start/i, async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = this.config.adminIds.includes(chatId.toString());
            const customer = this.config.customers?.[chatId.toString()];

            if (!isAdmin && !customer) {
                return await this.safeSendMessage(chatId, 
                    `👋 *Selamat datang di Bot GenieACS - ARTHA MEDIA NETWORK*\n\n` +
                    `⚠️ Akun Telegram Anda belum terdaftar di sistem\\.\n\n` +
                    `📱 *Langkah Pendaftaran:*\n` +
                    `1\\. Ketik perintah /myid\n` +
                    `2\\. Salin ID Telegram Anda\n` +
                    `3\\. Berikan ke admin atau simpan di GenieACS Admin UI\\.\n`,
                    { parse_mode: 'MarkdownV2' }
                );
            }

            if (isAdmin) {
                const helpMsg = 
                    `🏢 *ARTHA MEDIA NETWORK - GENIEACS BOT*\n` +
                    `👑 *Admin Control Panel*\n\n` +
                    `📱 *Perintah Monitoring:*\n` +
                    `• \`/device\` atau \`/devices\` - Ringkasan & daftar perangkat\n` +
                    `• \`/device <nama/SN/IP>\` - Cari perangkat spesifik\n` +
                    `• \`/status <SN/User>\` - Cek detail koneksi & status ONT\n` +
                    `• \`/signal <SN/User>\` - Cek redaman optik & suhu\n` +
                    `• \`/wifi <SN/User>\` - Cek konfigurasi WiFi & total klien\n` +
                    `• \`/users <SN/User>\` - Daftar IP & MAC klien terhubung\n\n` +
                    `⚡ *Perintah Kontrol:*\n` +
                    `• \`/reboot <SN/User>\` - Restart / reboot ONT jarak jauh\n` +
                    `• \`/setwifi <SN/User> <SSID>\` - Ganti nama SSID WiFi\n` +
                    `• \`/setpass <SN/User> <Password>\` - Ganti password WiFi\n\n` +
                    `👥 *Perintah Pelanggan:*\n` +
                    `• \`/customers\` - Daftar akun pelanggan bot\n` +
                    `• \`/addcustomer <ID> <Nama> <SN>\` - Tambah akses pelanggan\n` +
                    `• \`/delcustomer <ID>\` - Hapus akses pelanggan\n\n` +
                    `💡 _Tips: Anda dapat menggunakan nama PPPoE atau Serial Number ONT untuk setiap perintah!_`;

                await this.safeSendMessage(chatId, helpMsg, { parse_mode: 'MarkdownV2' });
            } else {
                await this.safeSendMessage(chatId, 
                    `👋 *Halo ${this.escapeMarkdown(customer.name)}*\n` +
                    `Selamat datang di layanan bot mandiri ARTHA MEDIA NETWORK\\.\n\n` +
                    `📱 *Perintah yang dapat digunakan:*\n` +
                    `• \`/mystatus\` - Cek status koneksi router Anda\n` +
                    `• \`/mywifi\` - Cek nama WiFi router Anda\n` +
                    `• \`/changepass <password_baru>\` - Ubah password WiFi\n\n` +
                    `❗ _Password WiFi minimal 8 karakter kombinasi huruf dan angka\\._`,
                    { parse_mode: 'MarkdownV2' }
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
                        return await this.safeSendMessage(chatId, `❌ Tidak ada perangkat yang cocok dengan: \`${this.escapeMarkdown(query)}\``, { parse_mode: 'MarkdownV2' });
                    }

                    let message = `🔍 *Hasil Pencarian ("${this.escapeMarkdown(query)}"):* (${filtered.length} perangkat)\n\n`;
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

                        message += `*${index + 1}\\. ${this.escapeMarkdown(sn)}* [${status}]\n`;
                        message += `👤 User: \`${this.escapeMarkdown(user)}\`\n`;
                        message += `📡 IP: \`${this.escapeMarkdown(ip)}\` | RX: \`${this.escapeMarkdown(rx)} dBm\`\n`;
                        message += `👉 \`/status ${this.escapeMarkdown(targetId)}\` | \`/wifi ${this.escapeMarkdown(targetId)}\` | \`/reboot ${this.escapeMarkdown(targetId)}\`\n\n`;
                    });

                    if (filtered.length > 10) {
                        message += `_Menampilkan 10 dari ${filtered.length} hasil. Persempit pencarian untuk hasil lebih spesifik._`;
                    }
                    return await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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

                let message = `🏢 *ARTHA MEDIA NETWORK - DAFTAR DEVICE*\n`;
                message += `📊 Total: *${devices.length}* | 🟢 Online: *${onlineCount}* | 🔴 Offline: *${offlineCount}*\n`;
                message += `📄 Halaman *${currentPage}* dari *${totalPages}*\n\n`;

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

                    message += `${status} *${startIdx + index + 1}\\. ${this.escapeMarkdown(user !== '-' ? user : sn)}*\n`;
                    message += `   SN: \`${this.escapeMarkdown(sn)}\` | IP: \`${this.escapeMarkdown(ip)}\`\n`;
                    message += `   RX: \`${this.escapeMarkdown(rx)} dBm\` 👉 \`/status ${this.escapeMarkdown(targetId)}\`\n\n`;
                });

                message += `💡 *Tips:* Ketik \`/device <nama/SN/IP>\` untuk cari perangkat.\n`;
                if (currentPage < totalPages) {
                    message += `👉 Halaman berikutnya: \`/devices ${currentPage + 1}\``;
                }

                await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                return await this.safeSendMessage(chatId, '❗ Format: `/status <SN atau PPPoE Username>`', { parse_mode: 'MarkdownV2' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
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
                    `📱 *INFORMASI PERANGKAT*\n\n` +
                    `👤 *Pelanggan:* \`${this.escapeMarkdown(user)}\`\n` +
                    `📱 *SN:* \`${this.escapeMarkdown(sn)}\`\n` +
                    `🏷️ *Model:* \`${this.escapeMarkdown(model)}\`\n` +
                    `⚡ *Mode:* \`${this.escapeMarkdown(vParams.getponmode?._value || '-')}\`\n\n` +
                    `🌐 *Jaringan:*\n` +
                    `• Status: ${status}\n` +
                    `• IP PPPoE: \`${this.escapeMarkdown(vParams.pppoeIP?._value || '-')}\`\n` +
                    `• IP TR069: \`${this.escapeMarkdown(vParams.IPTR069?._value || '-')}\`\n` +
                    `• Uptime Router: \`${this.escapeMarkdown(vParams.getdeviceuptime?._value || '-')}\`\n` +
                    `• Uptime PPPoE: \`${this.escapeMarkdown(vParams.getpppuptime?._value || '-')}\`\n\n` +
                    `📶 *Optik & Suhu:*\n` +
                    `• RX Power: \`${this.escapeMarkdown(vParams.RXPower?._value || '-')} dBm\`\n` +
                    `• Suhu ONT: \`${this.escapeMarkdown(vParams.gettemp?._value || '-')} °C\`\n\n` +
                    `📡 *WiFi:*\n` +
                    `• SSID: \`${this.escapeMarkdown(vParams.WifiSSID?._value || '-')}\`\n` +
                    `• Klien Aktif: *${this.escapeMarkdown(String(vParams.activedevices?._value || '0'))} user*\n\n` +
                    `⚡ *Aksi Cepat:*\n` +
                    `\`/signal ${this.escapeMarkdown(targetId)}\` - Cek Signal\n` +
                    `\`/wifi ${this.escapeMarkdown(targetId)}\` - Info WiFi\n` +
                    `\`/reboot ${this.escapeMarkdown(targetId)}\` - Restart Device`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                return await this.safeSendMessage(chatId, '❗ Format: `/signal <SN atau PPPoE Username>`', { parse_mode: 'MarkdownV2' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
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
                    `📶 *PEMANTAUAN SINYAL OPTIK*\n\n` +
                    `👤 User: \`${this.escapeMarkdown(user)}\`\n` +
                    `📱 SN: \`${this.escapeMarkdown(sn)}\`\n` +
                    `⚡ Mode: \`${this.escapeMarkdown(vParams.getponmode?._value || 'EPON')}\`\n\n` +
                    `📊 *Hasil Pengukuran:*\n` +
                    `• RX Optical Power: *${this.escapeMarkdown(vParams.RXPower?._value || '-')} dBm*\n` +
                    `• Kondisi: ${rxStatus}\n` +
                    `• Suhu Perangkat: \`${this.escapeMarkdown(vParams.gettemp?._value || '-')} °C\``;

                await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                return await this.safeSendMessage(chatId, '❗ Format: `/wifi <SN atau PPPoE Username>`', { parse_mode: 'MarkdownV2' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                const wlan = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'];
                const targetId = user !== '-' ? user : sn;

                const message = 
                    `📡 *DETAIL WIFI (WLAN 1)*\n\n` +
                    `👤 User: \`${this.escapeMarkdown(user)}\`\n` +
                    `📱 SN: \`${this.escapeMarkdown(sn)}\`\n\n` +
                    `• Nama SSID: \`${this.escapeMarkdown(wlan?.SSID?._value || vParams.WifiSSID?._value || '-')}\`\n` +
                    `• Status Radio: ${wlan?.Enable?._value ? '🟢 Aktif (Enabled)' : '🔴 Nonaktif'}\n` +
                    `• Channel: \`${this.escapeMarkdown(String(wlan?.Channel?._value || '-'))}\`\n` +
                    `• Klien Terhubung: *${this.escapeMarkdown(String(wlan?.TotalAssociations?._value || vParams.activedevices?._value || '0'))} perangkat*\n\n` +
                    `👉 \`/users ${this.escapeMarkdown(targetId)}\` - Daftar klien WiFi\n` +
                    `👉 \`/setwifi ${this.escapeMarkdown(targetId)} <NamaSSID>\` - Ubah nama WiFi\n` +
                    `👉 \`/setpass ${this.escapeMarkdown(targetId)} <Password>\` - Ubah password WiFi`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                return await this.safeSendMessage(chatId, '❗ Format: `/users <SN atau PPPoE Username>`', { parse_mode: 'MarkdownV2' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';
                const wlan = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'];
                const assoc = wlan?.AssociatedDevice || {};
                const clientKeys = Object.keys(assoc).filter(k => !k.startsWith('_'));

                let message = `👥 *KLIEN WIFI TERHUBUNG (SSID 1)*\n\n`;
                message += `👤 User: \`${this.escapeMarkdown(user)}\`\n`;
                message += `📱 SN: \`${this.escapeMarkdown(sn)}\`\n`;
                message += `📡 SSID: \`${this.escapeMarkdown(wlan?.SSID?._value || vParams.WifiSSID?._value || '-')}\`\n`;
                message += `📊 Total Klien: *${clientKeys.length || vParams.activedevices?._value || 0} perangkat*\n\n`;

                if (clientKeys.length > 0) {
                    clientKeys.forEach((k, idx) => {
                        const cl = assoc[k];
                        const ip = cl.AssociatedDeviceIPAddress?._value || '-';
                        const mac = cl.AssociatedDeviceMACAddress?._value || '-';
                        const auth = cl.AssociatedDeviceAuthenticationState?._value || 'TRUE';
                        message += `${idx + 1}\\. IP: \`${this.escapeMarkdown(ip)}\`\n`;
                        message += `   MAC: \`${this.escapeMarkdown(mac)}\` [${auth === 'TRUE' ? '🟢 Aktif' : '⚪'}]\n`;
                    });
                } else {
                    message += `_Tidak ada klien aktif yang terhubung ke SSID 1 saat ini\\._\n`;
                }

                await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                return await this.safeSendMessage(chatId, '❗ Format: `/reboot <SN atau PPPoE Username>`', { parse_mode: 'MarkdownV2' });
            }

            try {
                const devices = await this.getDevicesFromGenieACS();
                const device = this.findDeviceMatch(searchTerm, devices);
                if (!device) {
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';

                await this.safeSendMessage(chatId, `⏳ Mengirim perintah reboot ke \`${this.escapeMarkdown(user !== '-' ? user : sn)}\`...`, { parse_mode: 'MarkdownV2' });

                await this.rebootDevice(encodeURIComponent(device._id));

                await this.safeSendMessage(chatId, 
                    `🔄 *PERINTAH REBOOT BERHASIL DIKIRIM*\n\n` +
                    `👤 User: \`${this.escapeMarkdown(user)}\`\n` +
                    `📱 SN: \`${this.escapeMarkdown(sn)}\`\n` +
                    `🌐 IP: \`${this.escapeMarkdown(vParams.pppoeIP?._value || '-')}\`\n\n` +
                    `Perangkat sedang melakukan proses restart otomatis\\.`,
                    { parse_mode: 'MarkdownV2' }
                );
            } catch (err) {
                console.error('Error in /reboot:', err);
                await this.safeSendMessage(chatId, `❌ Gagal reboot perangkat: ${this.escapeMarkdown(err.message)}`, { parse_mode: 'MarkdownV2' });
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
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';

                await this.setWiFiSSID(encodeURIComponent(device._id), newSSID);

                await this.safeSendMessage(chatId, 
                    `✅ *NAMA WIFI BERHASIL DIUBAH\\!*\n\n` +
                    `👤 User: \`${this.escapeMarkdown(user)}\`\n` +
                    `📱 SN: \`${this.escapeMarkdown(sn)}\`\n` +
                    `📡 SSID Baru: \`${this.escapeMarkdown(newSSID)}\`\n\n` +
                    `❗ Perangkat klien perlu reconnect ke SSID baru\\.`,
                    { parse_mode: 'MarkdownV2' }
                );
            } catch (err) {
                console.error('Error in /setwifi:', err);
                await this.safeSendMessage(chatId, `❌ Gagal mengubah nama WiFi: ${this.escapeMarkdown(err.message)}`, { parse_mode: 'MarkdownV2' });
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
                    return await this.safeSendMessage(chatId, `❌ Perangkat \`${this.escapeMarkdown(searchTerm)}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
                }

                const vParams = device.VirtualParameters || {};
                const devId = device._deviceId || {};
                const user = vParams.pppoeUsername?._value || vParams.pppoeUsername2?._value || '-';
                const sn = vParams.getSerialNumber?._value || devId._SerialNumber || '-';

                await this.setWiFiPassword(encodeURIComponent(device._id), newPass);

                await this.safeSendMessage(chatId, 
                    `✅ *PASSWORD WIFI BERHASIL DIUBAH\\!*\n\n` +
                    `👤 User: \`${this.escapeMarkdown(user)}\`\n` +
                    `📱 SN: \`${this.escapeMarkdown(sn)}\`\n` +
                    `🔑 Password Baru: \`${this.escapeMarkdown(newPass)}\`\n\n` +
                    `❗ Klien perlu reconnect menggunakan password baru\\.`,
                    { parse_mode: 'MarkdownV2' }
                );
            } catch (err) {
                console.error('Error in /setpass:', err);
                await this.safeSendMessage(chatId, `❌ Gagal mengubah password WiFi: ${this.escapeMarkdown(err.message)}`, { parse_mode: 'MarkdownV2' });
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
                    `📱 *STATUS ROUTER ANDA*\n\n` +
                    `Pelanggan: *${this.escapeMarkdown(customer.name)}*\n` +
                    `Status: ${status}\n` +
                    `Signal Optik: \`${this.escapeMarkdown(vParams.RXPower?._value || '-')} dBm\`\n` +
                    `IP Address: \`${this.escapeMarkdown(vParams.pppoeIP?._value || '-')}\`\n` +
                    `Uptime: \`${this.escapeMarkdown(vParams.getdeviceuptime?._value || '-')}\`\n`;

                await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                    `✅ *Password WiFi berhasil diubah\\!*\n\n` +
                    `Password baru: \`${this.escapeMarkdown(newPass)}\`\n\n` +
                    `❗ Silakan sambungkan kembali perangkat WiFi Anda dengan password baru\\.`,
                    { parse_mode: 'MarkdownV2' }
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
                    '👥 *Daftar Pelanggan Bot:*\n_Belum ada pelanggan yang didaftarkan\\._\n\n' +
                    'Gunakan: `/addcustomer <ID_TELEGRAM> <NAMA> <SN>`',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            let message = `👥 *DAFTAR PELANGGAN BOT (${keys.length}):*\n\n`;
            keys.forEach((id, idx) => {
                const c = customers[id];
                message += `${idx + 1}\\. *${this.escapeMarkdown(c.name)}*\n`;
                message += `   ID: \`${id}\` | SN: \`${this.escapeMarkdown(c.deviceSN)}\`\n`;
                message += `   Hapus: \`/delcustomer ${id}\`\n\n`;
            });

            await this.safeSendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
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
                    `✅ *Pelanggan berhasil didaftarkan\\!*\n\n` +
                    `Nama: \`${this.escapeMarkdown(customerName)}\`\n` +
                    `ID: \`${telegramId}\`\n` +
                    `SN: \`${this.escapeMarkdown(deviceSN)}\``,
                    { parse_mode: 'MarkdownV2' }
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
                await this.safeSendMessage(chatId, `✅ Pelanggan *${this.escapeMarkdown(name)}* (\`${telegramId}\`) berhasil dihapus\\.`, { parse_mode: 'MarkdownV2' });
            } else {
                await this.safeSendMessage(chatId, `❌ Pelanggan dengan ID \`${telegramId}\` tidak ditemukan\\.`, { parse_mode: 'MarkdownV2' });
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
