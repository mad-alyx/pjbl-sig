// ===========================================================
// PETA USAHA GROOMING PONTIANAK BARAT
// Salon, Barbershop dan Spa
// MarkerCluster +Filter Jenis Usaha + Hanya Booking Online + Digitasi + localStorage
// ===========================================================

// ---------- KONFIGURASI ----------
const MAP_CENTER = [-0.0575, 109.3450];
const MAP_ZOOM = 14
const BATAS_TARIF = 50000;

const WARNA_JENIS = {
  'salon': '#fbc02d',
  'barbershop': '#1565c0',
  'spa': '#ef6c00',
};

const WARNA_DEFAULT = '#757575';

// ---------- STATE TERPUSAT ----------
const STORAGE_KEY = 'grooming_west_state_v1';
const DEFAULT_FILTERS = { salon: true, barbershop: true, spa: true };

const state = {
  cluster: false,
  filters: Object.assign({}, DEFAULT_FILTERS),
  onlineOnly: false         
};

// ---------- SIMPAN & MUAT STATE (localStorage) ----------
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('localStorage tidak tersedia:', e);
  }
}

// Samakan tampilan checkbox dengan isi state
function syncControls() {
  document.querySelectorAll('.filter-jenis').forEach(cb => {
    cb.checked = state.filters[cb.value] !== false;
  });
  document.getElementById('filterBooking').checked = state.onlineOnly;
  document.getElementById('toggleCluster').checked = state.cluster;
}

syncControls();

// ---------- PENYIMPANAN DATA MENTAH ----------
const rawData = {
  grooming: null,
  zona: null,
};

// ---------- INISIALISASI PETA ----------
const map = L.map('map', {
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
  zoomControl: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

// ---------- WADAH LAYER TETAP ----------
// Setiap layer punya wadah (layerGroup) yang tidak pernah diganti.
// Isinya yang dikosongkan & digambar ulang.
const layerGroups = {
  grooming: L.layerGroup().addTo(map),
  zona: L.layerGroup().addTo(map),
};

// ---------- HELPER ----------
function jenisDari(props) {
  return String((props && props.jenis) || '').toLowerCase();
}

function esc(nilai) {
  return String(nilai == null ? '' : nilai)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRupiah(angka) {
  return 'Rp' + Number(angka).toLocaleString('id-ID');
}

// Ikon lingkaran untuk L.marker (dipakai saat cluster aktif, karena L.circleMarker tidak kompatibel dengan MarkerCluster)
function createCircleIcon(color) {
  return L.divIcon({
    className: 'custom-circle-marker',
    html: `<span style="display:block;width:16px;height:16px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8]
  });
}

// ---------- IKON CLUSTER BERWARNA JENIS YANG DOMINAN ----------
function buatIkonCluster(cluster) {
  const hitung = {};
  cluster.getAllChildMarkers().forEach(m => {
    const k = m.__jenis || 'lainnya';
    hitung[k] = (hitung[k] || 0) + 1;
  });

  let dominan = 'lainnya';
  let maks = 0;
  Object.entries(hitung).forEach(([k, n]) => {
    if (n > maks) { maks = n; dominan = k; }
  });

  const warna = WARNA_JENIS[dominan] || WARNA_DEFAULT;
  return L.divIcon({
    html: `<div style="background:${warna}" title="Dominan: ${dominan}">${cluster.getChildCount()}</div>`,
    className: 'cluster-jenis',
    iconSize: L.point(40, 40)
  });
}

// ---------- POPUP ----------
function buildPopupHTML(feature) {
  const props = feature.properties || {};
  const judul = props.nama || props.nama_zona || 'Tanpa Nama';
  let html = `<div style="min-width:200px"><h4>${esc(judul)}</h4><table>`;
  Object.keys(props).forEach(key => {
    if (key === 'nama' || key === 'nama_zona') return;
    let nilai = props[key];
    if (key === 'tarif' && Number.isFinite(Number(nilai))) nilai = formatRupiah(nilai);
    html += `<tr><td>${esc(key)}</td><td>${esc(nilai)}</td></tr>`;
  });
  html += '</table></div>';
  return html;
}

// ---------- HELPER: LABEL ----------
function bindLabel(layer, feature) {
  const nama = feature.properties && feature.properties.nama;
  if (!nama) return;
  layer.bindTooltip(nama, {
    permanent: true,
    direction: 'top',
    offset: [0, -10],
    className: 'label-usaha'
  });
}

// ---------- RENDER USAHA GROOMING (Cluster + Filter) ----------
function renderGrooming() {
  layerGroups.grooming.clearLayers();
  if (!rawData.grooming) return;

  const container = state.cluster
    ? L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: buatIkonCluster
      })
    : L.layerGroup();

  let tampil = 0;

  rawData.grooming.features.forEach(f => {
    const p = f.properties || {};
    const jenis = jenisDari(p);

    // FILTER JENIS & BOOKING ONLINE
    if (state.filters[jenis] === false) return;
    if (state.onlineOnly && String(p.booking).toLowerCase() !== 'online') return;

    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const warna = WARNA_JENIS[jenis] || WARNA_DEFAULT;

    // Tanpa cluster: L.circleMarker. Dengan cluster: L.marker + L.divIcon.
    const marker = state.cluster
      ? L.marker(latlng, { icon: createCircleIcon(warna) })
      : L.circleMarker(latlng, {
          radius: 8,
          fillColor: warna,
          color: '#fff',
          weight: 2,
          fillOpacity: 0.9
        });

    marker.bindPopup(buildPopupHTML(f));

    // Label hanya jika tarif > 50000
    if (Number(p.tarif) > 50000) {
      bindLabel(marker, f);
}

    marker.__jenis = jenis;  
    container.addLayer(marker);
    tampil++;
  });

  layerGroups.grooming.addLayer(container);
  document.getElementById('jumlah').textContent =
    `Menampilkan ${tampil} dari ${rawData.grooming.features.length} usaha`;
}

// ---------- RENDER ZONA ----------
function renderZona() {
  layerGroups.zona.clearLayers();
  if (!rawData.zona) return;
  layerGroups.zona.addLayer(L.geoJSON(rawData.zona, {
    style: {
      color: '#6a1b9a',
      weight: 2,
      fillColor: '#ce93d8',
      fillOpacity: 0.3,
      dashArray: '6 4'
    },
    onEachFeature: (f, l) => l.bindPopup(buildPopupHTML(f))
  }));
}

// ---------- MUAT SEMUA DATA ----------
async function ambil(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// Layer pendukung zona boleh gagal tanpa menjatuhkan seluruh peta
async function ambilOpsional(url) {
  try {
    return await ambil(url);
  } catch (e) {
    console.warn('Layer opsional gagal dimuat:', e.message);
    return null;
  }
}

async function muatSemuaData() {
  try {
    const [grooming, zona] = await Promise.all([
      ambil('/api/data/grooming', true),
      ambilOpsional('/api/data/zona', true),
    ]);

    rawData.grooming = grooming;
    rawData.zona = zona;

    // Urutan: bawah ke atas
    renderZona();
    renderGrooming();

    // Layer control:
    L.control.layers(null, {
      'Usaha Grooming': layerGroups.grooming,
      'Zona Grooming': layerGroups.zona,
    }, {
      collapsed: false,
      position: 'topright'
    }).addTo(map);

    // Zoom otomatis ke seluruh titik usaha
    const bounds = L.geoJSON(grooming).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
  } catch (err) {
    console.error(err);
    document.getElementById('stats').innerHTML =
      '<p style="color:#c62828">Gagal memuat data.</p>';
    return;
  }
    // Statistik
    try {
    renderStatistik(await ambil('/api/stats/jenis'));
  } catch (err) {
    console.error(err);
    document.getElementById('stats').innerHTML =
      '<p style="color:#c62828">Statistik gagal dimuat.</p>';
  }
}

// ---------- STATISTIK ----------
function renderStatistik(stats) {
  const box = document.getElementById('stats');
  let html = `<p class="catatan">Total <strong>${stats.total}</strong> usaha · booking online <strong>${stats.booking_online}</strong></p><ul>`;
  Object.entries(stats.per_jenis).forEach(([jenis, s]) => {
    const color = WARNA_JENIS[jenis] || '#6a1b9a';
    html += `<li><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:6px"></span>${jenis}: <strong>${s.count}</strong></li>`;
  });
  html += '</ul>';
  box.innerHTML = html;
}

function aktifkanDigitasi() {
  if (!(L.Control && L.Control.Draw)) {
    console.warn('Leaflet.draw tidak termuat, digitasi zona dinonaktifkan.');
    return;
  }

  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: false,
        shapeOptions: {
          color: '#6a1b9a',
          fillColor: '#ce93d8',
          fillOpacity: 0.5
        }
      },
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false
    },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, async function (e) {
    const geojson = e.layer.toGeoJSON();
    const nama = prompt('Nama zona grooming baru:', 'Zona Baru');
    if (!nama) return;

    geojson.properties = { nama_zona: nama };

    try {
      const res = await fetch('/api/feature/zona_grooming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: geojson })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.pesan || 'Gagal menyimpan');
      alert(`Zona "${nama}" tersimpan. Total: ${result.total}`);
      location.reload();
    } catch (err) {
      alert('Gagal: ' + err.message);
    }
  });
}

// ---------- EVENT: FILTER JENIS ----------
document.querySelectorAll('.filter-jenis').forEach(cb => {
  cb.addEventListener('change', e => {
    state.filters[e.target.value] = e.target.checked;
    saveState();
    renderGrooming();
  });
});

// ---------- EVENT: HANYA BOOOKING ONLINE ----------
document.getElementById('filterBooking').addEventListener('change', e => {
  state.onlineOnly = e.target.checked;
  saveState();
  renderGrooming();
});

// ---------- EVENT: TOGGLE CLUSTER ----------
document.getElementById('toggleCluster').addEventListener('change', e => {
  state.cluster = e.target.checked;
  saveState();
  renderGrooming();
});

// ---------- EVENT: RESET FILTER ----------
document.getElementById('btnReset').addEventListener('click', () => {
  state.cluster = false;
  state.onlineOnly = false;
  state.filters = Object.assign({}, DEFAULT_FILTERS);
  saveState();
  syncControls();
  renderGrooming();
});

// ---------- JALANKAN ----------
muatSemuaData();
aktifkanDigitasi();