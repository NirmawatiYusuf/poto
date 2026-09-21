# 📸 SnapBooth Studio PRO

> **Web-based Photobooth Studio Modern** dengan 31+ real-time cinematic filters, 4-shot photostrip builder, stiker interaktif, export GIF Boomerang, auto-upload ke Google Drive pribadi, dan Panel Admin rahasia.

---

## ✨ Fitur Utama

- 🎨 **31+ Real-time Preset Filters**: RAW/Natural, Film Vintage (Portra, Fuji, Kodachrome), Black & White Monokrom, Cyberpunk Neon, Retro VHS Glitch, hingga Canvas Multi-Face Duplication.
- 🎞️ **Multi-mode Shooting**:
  - **Single Shot**: Foto resolusi tinggi dengan framing reticle & rule of thirds grid.
  - **4-Shot Photostrip**: Pengambilan 4 foto beruntun otomatis dengan countdown timer dan pilihan frame (Classic White, Noir, 35mm Film Roll, Rose Pastel, Vintage Cream) serta custom caption.
- 🎭 **Aksesoris & Stiker Interaktif**: Tambahkan kacamata, mahkota, telinga kucing, stiker berkilau yang dapat digeser dan diatur langsung di layar.
- 🔁 **GIF Boomerang Generator**: Buat dan unduh animasi gerak berulang dari hasil foto photostrip.
- ☁️ **Auto-Sync Google Drive (OAuth 2.0)**: Semua hasil jepretan otomatis tersimpan rapi ke folder Google Drive pribadi Anda tanpa batasan kuota Service Account.
- 🔒 **Panel Admin Rahasia**: Akses galeri foto dan manajemen cloud hanya untuk pengelola studio tanpa tombol publik yang terlihat oleh pengunjung.
- 📱 **100% Responsif**: Dioptimalkan untuk desktop, tablet (iPad/Android tab), dan perangkat mobile (layar portrait & landscape).

---

## 🚀 Panduan Menjalankan di Local (Localhost)

### 1. Prasyarat
- **Node.js** (versi 18 ke atas) terpasang di komputer Anda. Cek dengan `node -v`.

### 2. Instalasi Dependensi
Buka terminal di folder project:
```bash
npm install
```

### 3. Setup File Konfigurasi (.env)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
*(Di Windows PowerShell: `Copy-Item .env.example .env`)*

### 4. Menjalankan Server Lokal
```bash
npm run dev
```
Server akan berjalan di:
- **Lokal Desktop**: `http://localhost:3000`
- **Akses HP (Wi-Fi sama)**: `https://<IP-Lokal-Anda>:3443` *(Sertifikat SSL lokal otomatis digenerate agar browser HP mengizinkan akses kamera webcam)*.

---

## 🔐 Cara Masuk ke Panel Admin (Secret Access)

Untuk menjaga privasi, tombol admin sengaja disembunyikan dari antarmuka publik:

1. **Metode 1 (Klik Logo 3x)**: Klik logo **SnapBooth PRO** di pojok kiri atas sebanyak **3 kali berturut-turut**.
2. **Metode 2 (Keyboard Shortcut)**: Tekan tombol **`Ctrl` + `Shift` + `A`** pada keyboard.
3. **Metode 3 (URL Langsung)**: Buka `http://localhost:3000/admin.html` (atau `https://domain-anda.vercel.app/admin.html`).
4. Masukkan Password Admin (default di `.env`: `123456`).

---

## ☁️ Tutorial Lengkap: Setup Google Cloud & Google Drive

Untuk menyimpan foto ke Google Drive pribadi Anda (menggunakan kuota gratis 15GB), kita menggunakan **OAuth 2.0**. Ikuti langkah-langkah berikut:

### Langkah 1: Buat Project di Google Cloud Console
1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Login menggunakan akun Google / Gmail Anda.
3. Klik dropdown project di bagian atas, lalu klik **"New Project"**.
4. Beri nama project (contoh: `SnapBooth-Studio`) lalu klik **Create**.
5. Pastikan project yang baru dibuat sedang aktif terpilih.

### Langkah 2: Aktifkan Google Drive API
1. Buka menu samping (garis tiga) > **APIs & Services** > **Library**.
2. Cari `Google Drive API` di kotak pencarian.
3. Klik pada **Google Drive API**, lalu klik tombol **Enable (Aktifkan)**.

### Langkah 3: Konfigurasi OAuth Consent Screen
1. Buka menu samping > **APIs & Services** > **OAuth consent screen**.
2. Pilih User Type: **External**, lalu klik **Create**.
3. Isi informasi dasar:
   - **App name**: `SnapBooth Studio`
   - **User support email**: Pilih email Gmail Anda.
   - **Developer contact information**: Masukkan email Gmail Anda.
4. Klik **Save and Continue**.
5. Di bagian **Scopes**, klik **Add or Remove Scopes**, cari `Google Drive API` dan centang scope:
   - `.../auth/drive.file` (atau `.../auth/drive`)
6. Klik **Update**, lalu klik **Save and Continue**.
7. ⚠️ **PENTING (Mencegah Error 403: access_denied)**:
   - Di bagian **Test users**, klik **+ ADD USERS**.
   - Masukkan alamat email Gmail Anda yang akan digunakan untuk login Google Drive.
   - Klik **Add**, lalu klik **Save and Continue**.
8. Klik **Back to Dashboard**.

### Langkah 4: Buat OAuth 2.0 Client ID
1. Buka menu samping > **APIs & Services** > **Credentials**.
2. Klik **+ CREATE CREDENTIALS** di bagian atas > pilih **OAuth client ID**.
3. Pilih **Application type**: **Web application**.
4. Beri nama: `SnapBooth Web Client`.
5. Di bagian **Authorized redirect URIs**, klik **+ ADD URI** dan masukkan:
   - Untuk testing local: `http://localhost:3000/api/auth`
   - Untuk Vercel (jika sudah ada domain): `https://<nama-project-anda>.vercel.app/api/auth`
   *(Catatan: Anda bisa menambahkan URI Vercel kapan saja nanti).*
6. Klik **Create**.
7. Salin **Client ID** dan **Client Secret** yang muncul ke file `.env`:
   ```env
   GOOGLE_OAUTH_CLIENT_ID=548333710660-xxxxxxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxx
   ```

### Langkah 5: Siapkan Folder di Google Drive
1. Buka [Google Drive](https://drive.google.com/).
2. Buat folder baru, misalnya bernama `SnapBooth Photos`.
3. Buka folder tersebut, lalu perhatikan URL di browser:
   `https://drive.google.com/drive/folders/1I02aTnWV0gef2MEh5qEOt-Br9UYzg5Mn`
4. Bagian teks setelah `/folders/` adalah **Folder ID** Anda (`1I02aTnWV0gef2MEh5qEOt-Br9UYzg5Mn`).
5. Salin ID tersebut ke `.env`:
   ```env
   GOOGLE_DRIVE_FOLDER_ID=1I02aTnWV0gef2MEh5qEOt-Br9UYzg5Mn
   ```

### Langkah 6: Hubungkan Akun (Dapatkan Refresh Token)
1. Jalankan aplikasi di local: `npm run dev`.
2. Buka panel admin: `http://localhost:3000/admin.html`.
3. Di banner Google Drive, klik **"Hubungkan Google Drive"**.
4. Login dengan akun Gmail yang sudah didaftarkan sebagai Test User tadi.
5. Jika muncul peringatan "Google hasn't verified this app", klik **Advanced / Lanjutan** > klik **Go to SnapBooth Studio (unsafe)**.
6. Klik **Continue / Lanjutkan** untuk memberikan izin akses Google Drive.
7. Anda akan otomatis diarahkan kembali ke panel admin dan file `.env` di komputer Anda akan **otomatis terisi** dengan `GOOGLE_OAUTH_REFRESH_TOKEN`!

---

## 🔺 Panduan Deploy ke Vercel

Karena Vercel menyediakan koneksi **HTTPS secara gratis dan otomatis**, kamera HP, tablet, dan laptop pengunjung akan langsung menyala tanpa hambatan keamanan peramban.

### Langkah 1: Push Project ke GitHub
1. Inisialisasi git dan upload project Anda ke repositori GitHub (Private atau Public).
2. *Pastikan file `.env` tidak ter-push (sudah otomatis ada di `.gitignore`).*

### Langkah 2: Import Project ke Vercel
1. Masuk ke [Vercel Dashboard](https://vercel.com/).
2. Klik tombol **"Add New..."** > **"Project"**.
3. Hubungkan repositori GitHub Anda dan klik **Import**.
4. Biarkan Framework Preset sebagai **Other** (karena arsitektur kita sudah memiliki `vercel.json` dan serverless functions di folder `/api`).

### Langkah 3: Isi Environment Variables di Vercel
Di halaman konfigurasi sebelum deploy (atau di Project Settings > **Environment Variables**), tambahkan 5 variable penting berikut:

| Key | Value | Keterangan |
| :--- | :--- | :--- |
| `GOOGLE_OAUTH_CLIENT_ID` | `xxxxxxxx.apps.googleusercontent.com` | Dari Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `GOCSPX-xxxxxxxx` | Dari Google Cloud Console |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | `1//0xxxxxxxx` | Salin dari file `.env` lokal Anda |
| `GOOGLE_DRIVE_FOLDER_ID` | `1I02aTnWV0gef...` | ID Folder Google Drive Anda |
| `ADMIN_PASSWORD` | `123456` | Password untuk masuk panel admin |

### Langkah 4: Daftarkan Domain Vercel ke Google Cloud Console
Setelah deploy selesai dan Anda mendapatkan URL Vercel (misal: `https://snapbooth.vercel.app`):
1. Buka kembali [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Klik pada nama OAuth 2.0 Client ID Anda.
3. Di bagian **Authorized redirect URIs**, klik **+ ADD URI**.
4. Masukkan URL Vercel Anda ditambah `/api/auth`:
   ```
   https://snapbooth.vercel.app/api/auth
   ```
5. Di bagian **Authorized JavaScript origins**, tambahkan:
   ```
   https://snapbooth.vercel.app
   ```
6. Klik **Save**.

🎉 **Selesai!** SnapBooth Studio Anda kini live di seluruh dunia dengan integrasi Google Drive pribadi yang aman dan siap digunakan di acara, pameran, pesta, atau booth foto!

---

## 🛠️ Tanya Jawab & Troubleshooting

#### 1. Kamera tidak mau menyala / "Akses Kamera Dibatasi"
- **Penyebab**: Peramban memblokir izin kamera atau webcam sedang dipakai aplikasi lain (seperti Zoom, OBS, Google Meet).
- **Solusi**:
  1. Tutup aplikasi lain yang sedang mengakses kamera.
  2. Klik ikon kamera atau gembok di address bar peramban, pastikan izin kamera diatur ke **"Allow / Izinkan"**.
  3. Di HP pada jaringan lokal, browser Safari & Chrome mewajibkan koneksi **HTTPS** (`https://<IP>:3443`). Jika sudah di Vercel, HTTPS sudah aktif otomatis.

#### 2. Error 403: `access_denied` saat menghubungkan Google Drive
- **Penyebab**: Aplikasi Google Cloud Anda berstatus "Testing" dan email Gmail yang login belum didaftarkan sebagai tester.
- **Solusi**: Masuk ke Google Cloud Console > **OAuth consent screen** > tab **Test users** > Tambahkan alamat Gmail Anda ke daftar.

#### 3. Gambar di Admin Panel tidak muncul / broken thumbnail
- **Solusi**: Fitur streaming proxy bawaan (`/api/photos?id=...`) telah diaktifkan secara otomatis untuk melewati pembatasan third-party cookie Google Drive. Semua foto dan strip akan tampil jernih dan utuh.

---

## 📂 Struktur Direktori Project

```text
potooo/
├── api/                  # Serverless API Endpoints (Vercel & Local)
│   ├── auth.js           # Google OAuth 2.0 Handshake & Callback
│   ├── info.js           # Server & Local Network IP Info
│   ├── photos.js         # Galeri & Media Proxy Streamer
│   ├── upload.js         # Upload Foto & Strip ke Google Drive
│   └── lib/
│       └── gdrive.js     # Google Drive Client Engine (OAuth + Service Account)
├── admin.html            # Antarmuka Admin Panel & Galeri Foto
├── admin.css             # Styling Masonry Grid Galeri Admin
├── admin.js              # Logika Galeri & Kontrol Sinkronisasi Cloud
├── app.js                # Core Studio Engine (Kamera, Shutter, Filter, Boomerang)
├── filters.js            # Engine Pemrosesan Gambar Realtime Canvas
├── index.html            # Antarmuka Utama SnapBooth Studio
├── style.css             # Desain Sistem & Responsivitas Mobile/Tablet/Desktop
├── server.js             # Local Dev Server (Dual HTTP 3000 & HTTPS 3443)
├── vercel.json           # Konfigurasi Serverless Vercel Functions & CORS
└── README.md             # Dokumentasi Lengkap Project
```

---
*Dibuat dengan ❤️ untuk SnapBooth Studio PRO.*
