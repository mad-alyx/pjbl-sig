# Backend API: Salon, Barbershop & Spa Pontianak Barat

UAS SIG Dasar (PjBL), Kelompok 8. Bagian **SK-3: Backend API** (Node.js + Express).

Server ini melayani data GeoJSON usaha salon, barbershop, dan spa di Kecamatan Pontianak Barat, menghitung statistik per jenis usaha, dan menerima zona (polygon) yang digambar pengguna di peta. Server juga menyajikan halaman web (frontend Leaflet) dari folder `public/`.

## Lingkungan

| Komponen | Versi |
|---|---|
| Node.js | v25.8.1 |
| Express | ^4.19.2 (satu-satunya dependensi) |
| Port | 3000 (bisa diubah lewat variabel lingkungan `PORT`) |

## Cara menjalankan

```
git clone https://github.com/mad-alyx/pjbl-sig.git
cd pjbl-sig
npm install
npm start
```

Jika berhasil, terminal menampilkan `Server berjalan di http://localhost:3000`. Buka alamat itu di browser untuk melihat peta, atau panggil endpoint API di bawah. Untuk menghentikan server, tekan `Ctrl+C`.

## Struktur folder

```
pjbl-sig/
├── server.js          # server Express dan seluruh endpoint
├── package.json
├── data/              # file GeoJSON
│   ├── grooming_west.geojson     # data usaha (wajib ada)
│   ├── zona_grooming.geojson     # zona hasil analisis (opsional)
│   ├── jalan_utama.geojson       # opsional
│   ├── batas_kec_west.geojson    # opsional
│   ├── kawasan_komersial.geojson # opsional
│   └── zona_diterima.geojson     # dibuat otomatis oleh POST, tidak masuk Git
└── public/            # frontend Leaflet (SK-4)
```

Layer yang berstatus opsional dibalas **koleksi kosong** (`200`) kalau filenya belum ada, sehingga peta tetap berjalan. Hanya `grooming_west.geojson` yang wajib: kalau hilang, API membalas `404`.

## Endpoint

### 1. `GET /api/data/:file`

Mengembalikan isi satu dataset GeoJSON. Nilai `:file` hanya boleh salah satu dari daftar berikut (whitelist, sehingga pengguna tidak bisa membaca file sembarang di server):

| `:file` | File di `data/` |
|---|---|
| `grooming` | `grooming_west.geojson` |
| `zona` | `zona_grooming.geojson` |
| `jalan` | `jalan_utama.geojson` |
| `batas` | `batas_kec_west.geojson` |
| `kawasan` | `kawasan_komersial.geojson` |
| `zona_diterima` | `zona_diterima.geojson` |

Contoh: `GET http://localhost:3000/api/data/grooming` → `200 OK`

```json
{
  "type": "FeatureCollection",
  "name": "grooming_west",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "nama": "Candra Salon",
        "jenis": "salon",
        "latitude": -0.026006697808487845,
        "longitude": 109.29900908822368,
        "tarif": null,
        "layanan": "Potong rambut, perawatan alis, facial",
        "booking": "Offline",
        "alamat": "Jl. Mitra Utama 1, ...",
        "sumber": "Google Maps",
        "status_verifikasi": "Listing ditemukan; tarif dan booking perlu dilengkapi",
        "link": "https://www.google.com/maps/place/..."
      },
      "geometry": { "type": "Point", "coordinates": [109.29900908822368, -0.026006697808488] }
    }
  ]
}
```

Catatan data:
- Koordinat GeoJSON berurutan **[longitude, latitude]**.
- `jenis` bernilai `salon`, `barbershop`, atau `spa`.
- `tarif` bisa `null` (belum terverifikasi); nilai `null` bukan Rp0 dan tidak ikut dihitung di statistik.

### 2. `GET /api/stats/jenis`

Menghitung jumlah usaha per jenis, jumlah yang bisa dibooking online, dan rata-rata tarif per jenis.

Contoh: `GET http://localhost:3000/api/stats/jenis` → `200 OK`

```json
{
  "total": 25,
  "booking_online": 6,
  "salon": 15,
  "barbershop": 7,
  "spa": 3,
  "per_jenis": {
    "salon":      { "count": 15, "n_tarif": 4, "rata_tarif": 175000 },
    "barbershop": { "count": 7,  "n_tarif": 2, "rata_tarif": 15000 },
    "spa":        { "count": 3,  "n_tarif": 1, "rata_tarif": 30000 }
  }
}
```

`n_tarif` adalah jumlah usaha yang tarifnya terisi; `rata_tarif` dihitung hanya dari usaha tersebut (`null` kalau tidak ada satu pun).

### 3. `POST /api/feature/zona_grooming`

Alias yang juga berfungsi: `POST /api/feature/zona`.

Menerima **satu GeoJSON Feature bertipe Polygon** (atau dibungkus `{ "feature": { ... } }`), lalu menyimpannya ke `data/zona_diterima.geojson`. File `zona_grooming.geojson` milik analisis QGIS tidak pernah ditimpa. Dari payload hanya `nama_zona` yang disimpan; server menambahkan `id` dan `dibuat`.

Header: `Content-Type: application/json`

Body contoh:

```json
{
  "type": "Feature",
  "properties": { "nama_zona": "Zona Tes" },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[109.318, -0.028], [109.326, -0.028], [109.326, -0.033], [109.318, -0.033], [109.318, -0.028]]]
  }
}
```

Response sukses `201 Created`:

```json
{
  "sukses": true,
  "pesan": "Zona berhasil disimpan",
  "jumlah_zona_tersimpan": 1,
  "total": 1,
  "feature": {
    "type": "Feature",
    "properties": { "id": 1, "nama_zona": "Zona Tes", "dibuat": "2026-11-25T07:13:01.670Z" },
    "geometry": { "type": "Polygon", "coordinates": [[[109.318, -0.028], "..."]] }
  }
}
```

Aturan validasi: payload tidak kosong, `type` harus `Feature`, geometri harus `Polygon`, minimal 4 posisi, tiap koordinat berupa `[longitude, latitude]` yang valid, dan ring harus tertutup (titik pertama sama dengan titik terakhir).

## Format error

Semua error memakai bentuk yang sama:

```json
{ "sukses": false, "pesan": "Penjelasan singkat kesalahan" }
```

| Status | Kondisi |
|---|---|
| 400 | Payload kosong, bukan Feature, bukan Polygon, koordinat tidak valid, ring tidak tertutup, atau JSON rusak |
| 404 | Dataset tidak dikenal, file wajib tidak ada, atau alamat `/api/...` tidak ada |
| 405 | Metode HTTP salah (misalnya `POST` ke endpoint GET) |
| 413 | Payload lebih dari 1 MB |
| 500 | File data bukan JSON valid atau kesalahan server lain |

## Hasil pengujian

Diuji dengan `curl.exe` di Windows pada 25 November 2026, memakai data asli 25 usaha.

| Pengujian | Hasil |
|---|---|
| `GET /api/data/grooming` | 200, 25 fitur |
| `GET /api/data/zona` | 200, 3 fitur Polygon (Zona Barat, Zona Tengah, Zona Timur) |
| `GET /api/data/jalan` (file belum ada) | 200, koleksi kosong || `GET /api/data/ngawur` | 404, pesan menyebut daftar dataset |
| `GET /api/stats/jenis` | 200, total 25 (salon 15, barbershop 7, spa 3), sesuai hitungan manual |
| `POST /api/feature/zona_grooming` dengan polygon valid | 201 |
| `POST` dengan JSON rusak (`{rusak`) | 400, pesan "JSON yang dikirim tidak valid" |
| `POST` dengan polygon tidak tertutup | 400, pesan "Ring polygon harus tertutup" |
| `POST` ke `/api/data/grooming` | 405 |
| `GET` ke alamat `/api/` yang tidak ada | 404 |

Screenshot bukti uji ada di folder `06_Dokumentasi_Bukti_Pengerjaan`.

## Catatan

- Data diganti dengan menimpa file di `data/`; server membaca ulang file di setiap permintaan, jadi tidak perlu restart.
- Server tidak memakai CORS karena frontend disajikan dari server yang sama (`http://localhost:3000`). Kalau frontend dibuka dari port lain, perlu ditambahkan middleware `cors`.