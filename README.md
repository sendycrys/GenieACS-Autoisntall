# 🚀 GenieACS Premium Edition - Auto Installer

<div align="center">

![GenieACS Premium](https://img.shields.io/badge/GenieACS-v1.2.13-cyan.svg)
![Node.js](https://img.shields.io/badge/Node.js-18%20LTS-green.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-brightgreen.svg)
![OS](https://img.shields.io/badge/Ubuntu%20%7C%20Debian-Supported-orange.svg)
![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)

**GenieACS Auto-Installer siap pakai lengkap dengan tema Dark Premium, pencarian PPPoE, parameter tabel komprehensif, dan perbaikan STUN TR-111 untuk semua merk ONT (Huawei, ZTE, FiberHome, Totolink, CMDC).**

</div>

---

## ✨ Fitur Unggulan

- 🎨 **Tampilan Dark Premium Cyberpunk:** Desain visual UI modern, bersih, kontras tinggi, dan responsif.
- 🔍 **Pencarian Cepat PPPoE & SN:** Filter instan berdasarkan *PPPoE Username*, *IP PPPoE*, *SSID*, dan *Serial Number (SN)* langsung dari kolom pencarian atas.
- 📊 **Tabel Parameter Lengkap:**
  - Status Online / Offline
  - SSID & Jumlah Perangkat Aktif (WiFi Clients)
  - Redaman Optik (RX Power) dengan badge warna status (**Bagus** `<= -21 dBm`, **Sedang** `-21 s/d -25.99 dBm`, **Kritis** `>= -26 dBm`)
  - Temperatur Optik ONT
  - Uptime ONT & PPP Uptime
  - IP PPPoE & IP TR-069 / WAN
  - Mode PON (EPON / GPON) & MAC Address
- 🛡️ **Solusi STUN / UDP Connection Request (TR-111):**
  - Terintegrasi otomatis dengan server STUN `coturn` pada port UDP 3478.
  - Memperbaiki router China Mobile (CMDC H1s-3) dan router di balik NAT yang sebelumnya gagal di-*summon* dengan status *`Device is offline`*.
- ⚙️ **20 Virtual Parameters Pre-Configured:**
  - `RXPower`, `redaman`, `getponmode`, `getSerialNumber`, `gettemp`, `pppoeUsername`, `pppoeUsername2`, `pppoeIP`, `pppoeMac`, `pppoePassword`, `WifiSSID`, `WifiPassword`, `getdeviceuptime`, `getpppuptime`, `activedevices`, `IPTR069`, dll.
- 🔄 **Preset & Provision Siap Pakai:**
  - Konfigurasi otomatis untuk vendor Huawei, ZTE, FiberHome, Totolink, dan China Mobile (CMDC H1s-3).
- ⏱️ **Auto Reboot Navigation:** Tombol navigasi Auto Reboot terintegrasi di navbar atas.

---

## ⚡ Instalasi Cepat (1-Line Command)

Jalankan perintah berikut pada terminal VPS / Server Ubuntu atau Debian baru Anda (sebagai **root**):

```bash
bash <(curl -sSL https://raw.githubusercontent.com/sendycrys/GenieACS-Autoisntall/main/install.sh)
```

> [!NOTE]
> Installer akan meminta konfirmasi **IP Server**, **Admin Username**, dan **Admin Password**. Jika Anda menekan `Enter`, installer akan menggunakan nilai default yang terdeteksi otomatis.

---

## 🛠️ Instalasi Manual (Git Clone)

Jika ingin melakukan inspeksi skrip sebelum instalasi:

```bash
# 1. Update paket sistem & install git
sudo apt-get update -y && sudo apt-get install -y git

# 2. Clone repositori ini
git clone https://github.com/sendycrys/GenieACS-Autoisntall.git
cd GenieACS-Autoisntall

# 3. Beri izin eksekusi
chmod +x install.sh uninstall.sh scripts/*.js

# 4. Jalankan installer
sudo ./install.sh
```

---

## 🌐 Port Layanan

| Layanan | Port | Protokol | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GenieACS Web UI** | `3000` | TCP (HTTP) | Halaman Dashboard Web Admin |
| **CWMP (ACS)** | `7547` | TCP (HTTP) | Endpoint komunikasi TR-069 router ONT |
| **NBI API** | `7557` | TCP (HTTP) | API RESTful GenieACS |
| **File Server (FS)** | `7567` | TCP (HTTP) | Server upload firmware / konfigurasi |
| **STUN Server** | `3478` | UDP | Server STUN / TR-111 UDP Connection Request |

---

## 📋 Manajemen Layanan (Systemd)

Semua layanan GenieACS berjalan otomatis di latar belakang sebagai layanan systemd:

```bash
# Cek status layanan
systemctl status genieacs-ui
systemctl status genieacs-cwmp
systemctl status coturn

# Restart semua layanan GenieACS
systemctl restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui coturn

# Memantau log akses komunikasi ONT secara realtime
journalctl -u genieacs-cwmp -f

# Memantau log web UI
journalctl -u genieacs-ui -f
```

---

## 📁 Struktur Repositori

```text
GenieACS-Autoisntall/
├── install.sh                  # Skrip utama auto-installer
├── uninstall.sh                # Skrip uninstaller bersih
├── README.md                   # Dokumentasi lengkap
├── bin/
│   └── genieacs-ui             # Biner UI yang telah disesuaikan
├── public/                     # Aset frontend (Mithril UI, CSS Dark Theme, Logo)
│   ├── app-FOJWPRV7.js         # Frontend app dengan fitur pencarian & badge
│   ├── app-LU66VFYW.css        # Stylesheet dark theme cyber
│   ├── auto-reboot.js          # Skrip auto-reboot
│   └── logo-3976e73d.svg       # Brand logo
├── data/                       # Ekspor database konfigurasi GenieACS
│   ├── config.json             # 5000+ konfigurasi UI, kolom, grafik & threshold
│   ├── provisions.json         # Provision default, CMDC safe, inform, bootstrap
│   ├── presets.json            # Preset filter & aturan aktivasi
│   ├── virtualParameters.json  # 20 virtual parameters siap pakai
│   ├── permissions.json        # Pengaturan hak akses
│   └── users.json              # Akun pengguna bawaan
├── systemd/                    # Service unit files systemd
│   ├── genieacs-cwmp.service
│   ├── genieacs-nbi.service
│   ├── genieacs-fs.service
│   └── genieacs-ui.service
├── config/                     # File konfigurasi lingkungan & STUN
│   ├── genieacs.env
│   └── turnserver.conf
└── scripts/
    └── import-db.js            # Skrip NodeJS untuk impor konfigurasi MongoDB
```

---

## 🗑️ Uninstaller

Jika Anda ingin menghapus instalasi GenieACS dari server:

```bash
sudo ./uninstall.sh
```

---

## 📄 Lisensi

Proyek ini didistribusikan di bawah lisensi [GNU General Public License v3.0](LICENSE).
Dikembangkan dan dikustomisasi untuk komunitas ISP, RT/RW Net, dan pegiat jaringan di Indonesia.
