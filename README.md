# NemuFoto 📸

**NemuFoto** adalah aplikasi pencari foto berbasis AI (Face Recognition) yang berjalan langsung di browser (*privacy-first*, tanpa menyimpan foto ke database atau server). Cukup upload foto selfie wajah, masukkan link album foto (**GoTag.me**, **Google Drive publik**, atau **upload file lokal**), dan sistem akan otomatis mencari dan menampilkan foto-foto yang memuat wajah Anda secara instan.

---

## ✨ Fitur Utama

- 🔍 **AI Face Recognition di Browser**: Menggunakan `@vladmandic/face-api` (FaceNet + SSD MobileNet) dengan akselerasi WebGL GPU.
- ⚡ **Super Cepat & Paralel**: Scanning 4 foto sekaligus secara paralel (multithreading).
- 🖼️ **Akselerasi Sharp di Backend Proxy**: Otomatis mengompres dan me-resize gambar jarak jauh untuk inferensi AI yang ringan dan hemat bandwidth.
- 🌐 **Mendukung Berbagai Sumber**:
  - **GoTag.me**: Cukup paste link event (e.g. `https://gotag.me/photos/{event-slug}/1`).
  - **Google Drive**: Mendukung link folder bersama publik.
  - **Upload Langsung**: Drag & drop puluhan/ratusan foto langsung dari laptop/HP.
- 🔒 **100% Privacy-First**: Semua deteksi wajah dilakukan di perangkat pengguna (client-side). Tidak ada foto yang disimpan di server.
- 🎯 **Kalibrasi Akurasi Ketat**: Mencegah wajah orang lain tertangkap, dengan slider sensitivitas yang mudah disesuaikan.

---

## 🚀 Cara Menjalankan

### 1. Clone Repository
```bash
git clone https://github.com/abiyuababil/NemuFoto.git
cd NemuFoto
```

### 2. Install Dependensi
```bash
npm install
```

### 3. Setup Environment (Opsional untuk Google Drive)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Isi API Key Google Drive Anda di file `.env`:
```env
VITE_GOOGLE_DRIVE_API_KEY=YOUR_GOOGLE_DRIVE_API_KEY
```
*(Jika hanya ingin menggunakan fitur GoTag.me atau upload langsung, API Key tidak wajib diisi)*

### 4. Jalankan Aplikasi
```bash
npm run dev
```

Buka browser Anda di **http://localhost:5173**.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 (Slate Minimal Design System), Vanilla JS (ES Modules)
- **Bundler**: Vite
- **AI / ML**: `@vladmandic/face-api` (TensorFlow.js WebGL Backend)
- **Backend Proxy**: Express.js + Sharp (CORS bypass & image resizing)

---

## 📄 Lisensi
MIT License &copy; 2026 NemuFoto.
