// server.js - SK-3 Backend API, Kelompok 8 (Salon, Barbershop & Spa, Pontianak Barat)

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Lokasi file data
const DATA_DIR = path.join(__dirname, 'data');
const GROOMING_FILE = path.join(DATA_DIR, 'grooming_west.geojson');
const ZONA_DITERIMA_FILE = path.join(DATA_DIR, 'zona_diterima.geojson');

// Middleware: baca body request berformat JSON
app.use(express.json());

// Middleware: sajikan isi folder public/ (halaman Leaflet dari Nayla)
app.use(express.static(path.join(__dirname, 'public')));

// Fungsi bantu: baca file GeoJSON lalu ubah jadi objek JavaScript
function bacaGeoJSON(file) {
  const teks = fs.readFileSync(file, 'utf8');
  return JSON.parse(teks);
}

// Fungsi bantu: kirim response error dengan format yang selalu sama
function kirimError(res, status, pesan) {
  return res.status(status).json({ sukses: false, pesan: pesan });
}

// ---------- Endpoint 1: GET /api/data/grooming ----------
app.get('/api/data/grooming', (req, res) => {
  try {
    const data = bacaGeoJSON(GROOMING_FILE);
    res.status(200).json(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return kirimError(res, 404, 'File grooming_west.geojson tidak ditemukan di folder data/');
    }
    if (err instanceof SyntaxError) {
      return kirimError(res, 500, 'File grooming_west.geojson bukan JSON yang valid');
    }
    return kirimError(res, 500, 'Terjadi kesalahan pada server');
  }
});

// ---------- Endpoint 2: GET /api/stats/jenis ----------
app.get('/api/stats/jenis', (req, res) => {
  try {
    const data = bacaGeoJSON(GROOMING_FILE);
    const fitur = data.features || [];

    const hasil = { salon: 0, barbershop: 0, spa: 0, total: fitur.length };

    fitur.forEach((f) => {
      const jenis = String((f.properties && f.properties.jenis) || '').toLowerCase();
      if (jenis === 'salon' || jenis === 'barbershop' || jenis === 'spa') {
        hasil[jenis] += 1;
      }
    });

    res.status(200).json(hasil);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return kirimError(res, 404, 'File grooming_west.geojson tidak ditemukan di folder data/');
    }
    return kirimError(res, 500, 'Terjadi kesalahan pada server');
  }
});

// ---------- Endpoint 3: POST /api/feature/zona ----------
app.post('/api/feature/zona', (req, res) => {
  const body = req.body;

  // Payload kosong
  if (!body || Object.keys(body).length === 0) {
    return kirimError(res, 400, 'Payload kosong. Kirim satu GeoJSON Feature bertipe Polygon.');
  }

  // Harus berupa Feature
  if (body.type !== 'Feature') {
    return kirimError(res, 400, 'Payload harus berupa GeoJSON Feature (type: "Feature").');
  }

  // Geometri harus Polygon
  if (!body.geometry || body.geometry.type !== 'Polygon') {
    return kirimError(res, 400, 'Geometri harus bertipe Polygon.');
  }

  // Koordinat harus ada
  if (!Array.isArray(body.geometry.coordinates) || body.geometry.coordinates.length === 0) {
    return kirimError(res, 400, 'Koordinat polygon kosong atau tidak valid.');
  }

  try {
    // Baca zona yang sudah diterima sebelumnya (kalau ada)
    let koleksi = { type: 'FeatureCollection', features: [] };
    if (fs.existsSync(ZONA_DITERIMA_FILE)) {
      koleksi = bacaGeoJSON(ZONA_DITERIMA_FILE);
    }

    koleksi.features.push(body);
    fs.writeFileSync(ZONA_DITERIMA_FILE, JSON.stringify(koleksi, null, 2), 'utf8');

    return res.status(201).json({
      sukses: true,
      pesan: 'Zona berhasil diterima',
      jumlah_zona_tersimpan: koleksi.features.length
    });
  } catch (err) {
    return kirimError(res, 500, 'Gagal menyimpan zona');
  }
});

// ---------- Metode HTTP salah pada endpoint yang ada ----------
app.all('/api/data/grooming', (req, res) => kirimError(res, 405, 'Gunakan metode GET untuk endpoint ini'));
app.all('/api/stats/jenis', (req, res) => kirimError(res, 405, 'Gunakan metode GET untuk endpoint ini'));
app.all('/api/feature/zona', (req, res) => kirimError(res, 405, 'Gunakan metode POST untuk endpoint ini'));

// ---------- Alamat /api/... yang tidak ada ----------
app.use('/api', (req, res) => kirimError(res, 404, 'Endpoint tidak ditemukan'));

// ---------- Penanganan error global (termasuk JSON rusak dari klien) ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return kirimError(res, 400, 'JSON yang dikirim tidak valid');
  }
  return kirimError(res, 500, 'Terjadi kesalahan pada server');
});

app.listen(PORT, () => {
  console.log('Server berjalan di http://localhost:' + PORT);
});