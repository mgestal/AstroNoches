/* AstroNoches · mapa Leaflet del lugar con radar de lluvia (RainViewer), viento (Open-Meteo) y nubes de satélite (EUMETSAT). */
(() => {
 const $ = id => document.getElementById(id);
 const M = { map: null, marker: null, mode: 'rain', radar: null, radarFrame: null, sat: null, wind: null, place: null, timer: 0 };
 const pin = () => L.divIcon({ className: 'map-pin', iconSize: [30, 40], iconAnchor: [15, 39],
  html: '<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C12 34 2 22 2 15a13 13 0 1 1 26 0c0 7-10 19-13 24Z" fill="#e7c58d" stroke="#0b1424" stroke-width="2.5"/><circle cx="15" cy="15" r="4.7" fill="#0b1424"/></svg>' });
 const tz = () => M.place?.timezone || 'Europe/Madrid';
 const hhmm = d => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz() });
 const dirName = deg => ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];

 function init(place) {
  M.place = place;
  if (!window.L) { $('mapStatus').textContent = 'No se pudo cargar Leaflet'; return; }
  M.map = L.map('locationMap', { scrollWheelZoom: false, zoomControl: true }).setView([place.lat, place.lon], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { referrerPolicy: 'strict-origin-when-cross-origin', maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(M.map);
  M.marker = L.marker([place.lat, place.lon], { icon: pin(), title: place.name }).addTo(M.map);
  M.sat = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', { layers: 'mtg_fd:rgb_geocolour', format: 'image/png', transparent: true, version: '1.1.1', opacity: .85, attribution: '© EUMETSAT' });
  document.querySelectorAll('[data-map-mode]').forEach(b => b.addEventListener('click', () => { M.mode = b.dataset.mapMode; apply(); }));
  new ResizeObserver(() => M.map.invalidateSize({ pan: false })).observe($('locationMap'));
  refreshRadar(); M.timer = setInterval(() => { if (!document.hidden) refreshRadar(); }, 10 * 60e3);
  setPlace(place);
 }
 async function refreshRadar() {
  try {
   const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
   if (!r.ok) throw Error(); const data = await r.json(), f = data.radar?.past?.at(-1);
   if (!f || !data.host) throw Error();
   M.radarFrame = { url: `${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, time: new Date(f.time * 1000) };
  } catch (e) { M.radarFrame = null; }
  apply();
 }
 function apply() {
  if (!M.map) return;
  document.querySelectorAll('[data-map-mode]').forEach(b => { const on = b.dataset.mapMode === M.mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  if (M.radar) { M.map.removeLayer(M.radar); M.radar = null; }
  if (M.map.hasLayer(M.sat)) M.map.removeLayer(M.sat);
  $('mapWind').hidden = true;
  const status = $('mapStatus'), time = $('mapTime');
  if (M.mode === 'rain') {
   if (M.radarFrame) {
    M.radar = L.tileLayer(M.radarFrame.url, { opacity: .75, maxNativeZoom: 7, maxZoom: 18, attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>' }).addTo(M.map);
    status.textContent = 'Lluvia observada · RainViewer'; time.textContent = `Radar observado · ${hhmm(M.radarFrame.time)}`;
   } else { status.textContent = 'Radar no disponible en este momento'; time.textContent = 'Sin imagen de radar reciente'; }
  } else if (M.mode === 'satellite') {
   M.sat.addTo(M.map); status.textContent = 'Nubes · satélite MTG (GeoColour)'; time.textContent = 'Última imagen disponible · EUMETSAT';
  } else {
   if (M.wind) {
    const toward = (M.wind.dir + 180) % 360;
    $('mapWind').innerHTML = `<span style="transform:rotate(${toward}deg)">↑</span><b>${Math.round(M.wind.speed)} km/h</b> · del ${dirName(M.wind.dir)}<small>Viento previsto · ${hhmm(M.wind.time)} · Open-Meteo</small>`;
    $('mapWind').hidden = false; status.textContent = 'Viento estimado por modelo';
   } else status.textContent = 'Viento no disponible todavía';
   time.textContent = 'Previsión horaria · Open-Meteo';
  }
 }
 function setPlace(place) {
  M.place = place; if (!M.map) return;
  M.map.setView([place.lat, place.lon], M.map.getZoom()); M.marker.setLatLng([place.lat, place.lon]);
  $('mapPlaceName').textContent = place.name;
  $('mapLink').href = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=10/${place.lat}/${place.lon}`;
 }
 function setWind(speed, dir, time) { if (Number.isFinite(speed) && Number.isFinite(dir)) { M.wind = { speed, dir, time }; if (M.mode === 'wind') apply(); } }
 window.AstroMap = { init, setPlace, setWind };
})();
