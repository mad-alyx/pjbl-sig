// server.js - SK-3 Backend API, Kelompok 8 (Salon, Barbershop & Spa, Pontianak Barat)
//
// Endpoint:
//   GET  /api/data/:file          -> grooming | zona | jalan | batas | kawasan | zona_diterima
//   GET  /api/stats/jenis         -> statistik jumlah usaha per jenis
//   POST /api/feature/zona_grooming (alias: /api/feature/zona) -> simpan 1 polygon zona

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Lokasi data ----------
const DATA_DIR = path.join(__dirname, 'data');

// Daftar file yang boleh diakses lewat /api/data/:file (whitelist -> aman dari path traversal)
const DATASETS = {
  grooming:      { file: 'grooming_west.geojson', wajib: true },
  zona:          { file: 'zona_grooming.geojson' },
  jalan:         { file: 'jalan_utama.geojson' },
  batas:         { file: 'batas_kec_west.geojson' },
  kawasan:       { file: 'kawasan_komersial.geojson' },
  zona_diterima: { file: 'zona_diterima.geojson' }
};

const JENIS_VALID = ['salon', 'barbershop', 'spa'];

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Fungsi bantu ----------
function pathData(kunci) {
  return path.join(DATA_DIR, DATASETS[kunci].file);
}

function bacaGeoJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function koleksiKosong() {
  return { type: 'FeatureCollection', features: [] };
}

function kirimError(res, status, pesan) {
  return res.status(status).json({ sukses: false, pesan });
}

// Tulis file lewat file sementara lalu rename, supaya file tidak rusak kalau proses mati di tengah
function tulisGeoJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function koordinatValid(pos) {
  return (
    Array.isArray(pos) && pos.length >= 2 &&
    Number.isFinite(pos[0]) && Number.isFinite(pos[1]) &&
    pos[0] >= -180 && pos[0] <= 180 &&
    pos[1] >= -90 && pos[1] <= 90
  );
}

// Kembalikan teks error kalau polygon tidak valid, atau null kalau valid
function cekPolygon(geometry) {
  if (!geometry || geometry.type !== 'Polygon') {
    return 'Geometri harus bertipe Polygon.';
  }
  const ring = geometry.coordinates && geometry.coordinates[0];
  if (!Array.isArray(geometry.coordinates) || !Array.isArray(ring) || ring.length === 0) {
    return 'Koordinat polygon kosong atau tidak valid.';
  }
  if (ring.length < 4) {
    return 'Polygon minimal punya 3 titik berbeda (4 posisi termasuk penutup).';
  }
  if (!ring.every(koordinatValid)) {
    return 'Koordinat harus berupa [longitude, latitude] yang valid.';
  }
  const awal = ring[0];
  const akhir = ring[ring.length - 1];
  if (awal[0] !== akhir[0] || awal[1] !== akhir[1]) {
    return 'Ring polygon harus tertutup (titik pertama sama dengan titik terakhir).';
  }
  return null;
}

// ---------- Endpoint 1: GET /api/data/:file ----------
app.get('/api/data/:file', (req, res) => {
  const dataset = Object.prototype.hasOwnProperty.call(DATASETS, req.params.file)
    ? DATASETS[req.params.file]
    : null;
  if (!dataset) {
    return kirimError(res, 404, 'Dataset "' + req.params.file + '" tidak dikenal. Pilihan: ' + Object.keys(DATASETS).join(', '));
  }

  try {
    const data = bacaGeoJSON(pathData(req.params.file));
    return res.status(200).json(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Layer pendukung boleh belum ada -> kirim koleksi kosong supaya peta tetap jalan
      if (!dataset.wajib) return res.status(200).json(koleksiKosong());
      return kirimError(res, 404, 'File ' + dataset.file + ' tidak ditemukan di folder data/');
    }
    if (err instanceof SyntaxError) {
      return kirimError(res, 500, 'File ' + dataset.file + ' bukan JSON yang valid');
    }
    return kirimError(res, 500, 'Terjadi kesalahan pada server');
  }
});

// ---------- Endpoint 2: GET /api/stats/jenis ----------
app.get('/api/stats/jenis', (req, res) => {
  try {
    const data = bacaGeoJSON(pathData('grooming'));
    const fitur = data.features || [];

    const perJenis = {};
    JENIS_VALID.forEach((j) => { perJenis[j] = { count: 0, total_tarif: 0, n_tarif: 0, rata_tarif: 0 }; });

    let bookingOnline = 0;

    fitur.forEach((f) => {
      const p = f.properties || {};
      const jenis = String(p.jenis || '').toLowerCase();
      // tarif kosong (null / "") bukan Rp0, jadi jangan ikut dihitung
      const tarifAda = p.tarif !== null && p.tarif !== undefined && p.tarif !== '';
      const tarif = Number(p.tarif);

      if (perJenis[jenis]) {
        perJenis[jenis].count += 1;
        if (tarifAda && Number.isFinite(tarif)) {
          perJenis[jenis].total_tarif += tarif;
          perJenis[jenis].n_tarif += 1;
        }
      }
      if (String(p.booking || '').toLowerCase() === 'online') bookingOnline += 1;
    });

    JENIS_VALID.forEach((j) => {
      const s = perJenis[j];
      s.rata_tarif = s.n_tarif > 0 ? Math.round(s.total_tarif / s.n_tarif) : null;
      delete s.total_tarif;
    });

    res.status(200).json({
      total: fitur.length,
      booking_online: bookingOnline,
      salon: perJenis.salon.count,
      barbershop: perJenis.barbershop.count,
      spa: perJenis.spa.count,
      per_jenis: perJenis
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return kirimError(res, 404, 'File grooming_west.geojson tidak ditemukan di folder data/');
    }
    return kirimError(res, 500, 'Terjadi kesalahan pada server');
  }
});

// ---------- Endpoint 3: POST /api/feature/zona_grooming ----------
function simpanZona(req, res) {
  // Terima { feature: {...} } (gaya modul) maupun Feature langsung
  const body = req.body && req.body.feature ? req.body.feature : req.body;

  if (!body || Object.keys(body).length === 0) {
    return kirimError(res, 400, 'Payload kosong. Kirim satu GeoJSON Feature bertipe Polygon.');
  }
  if (body.type !== 'Feature') {
    return kirimError(res, 400, 'Payload harus berupa GeoJSON Feature (type: "Feature").');
  }
  const masalah = cekPolygon(body.geometry);
  if (masalah) return kirimError(res, 400, masalah);

  try {
    // Zona kiriman disimpan terpisah (zona_diterima.geojson) supaya tidak menimpa zona_grooming.geojson milik QGIS
    const file = pathData('zona_diterima');
    let koleksi = koleksiKosong();
    if (fs.existsSync(file)) koleksi = bacaGeoJSON(file);
    if (!Array.isArray(koleksi.features)) koleksi.features = [];

    // Simpan hanya field yang dikenal (bukan seluruh isi body mentah)
    const props = body.properties || {};
    const fiturBaru = {
      type: 'Feature',
      properties: {
        id: koleksi.features.length + 1,
        nama_zona: String(props.nama_zona || 'Zona tanpa nama').slice(0, 100),
        dibuat: new Date().toISOString()
      },
      geometry: { type: 'Polygon', coordinates: body.geometry.coordinates }
    };

    koleksi.features.push(fiturBaru);
    tulisGeoJSON(file, koleksi);

    return res.status(201).json({
      sukses: true,
      pesan: 'Zona berhasil disimpan',
      jumlah_zona_tersimpan: koleksi.features.length,
      total: koleksi.features.length,
      feature: fiturBaru
    });
  } catch (err) {
    return kirimError(res, 500, 'Gagal menyimpan zona');
  }
}

app.post('/api/feature/zona_grooming', simpanZona);
app.post('/api/feature/zona', simpanZona); // alias untuk kompatibilitas

// ---------- Metode HTTP salah pada endpoint yang ada ----------
app.all('/api/data/:file', (req, res) => kirimError(res, 405, 'Gunakan metode GET untuk endpoint ini'));
app.all('/api/stats/jenis', (req, res) => kirimError(res, 405, 'Gunakan metode GET untuk endpoint ini'));
app.all(['/api/feature/zona_grooming', '/api/feature/zona'], (req, res) =>
  kirimError(res, 405, 'Gunakan metode POST untuk endpoint ini'));

// ---------- Alamat /api/... yang tidak ada ----------
app.use('/api', (req, res) => kirimError(res, 404, 'Endpoint tidak ditemukan'));

// ---------- Penanganan error global ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return kirimError(res, 400, 'JSON yang dikirim tidak valid');
  }
  if (err.type === 'entity.too.large') {
    return kirimError(res, 413, 'Payload terlalu besar');
  }
  return kirimError(res, 500, 'Terjadi kesalahan pada server');
});

app.listen(PORT, () => {
  console.log('Server berjalan di http://localhost:' + PORT);
});