/* AstroNoches · planetario y seguimiento orbital: cielo cenital con satélites (SGP4, satellite.js) y mapa mundial (Leaflet). */
(() => {
 const $ = id => document.getElementById('sat' + id);
 const D = Math.PI / 180, R = 180 / Math.PI, C = 500, HZ = 410;
 const PLANETS = [['Sol', 'Sun', '#ffd968'], ['Luna', 'Moon', '#cfe4ff'], ['Mercurio', 'Mercury', '#c7c5b8'], ['Venus', 'Venus', '#fff1bd'], ['Marte', 'Mars', '#ff8579'], ['Júpiter', 'Jupiter', '#f1c99b'], ['Saturno', 'Saturn', '#efda9d']];
 const T = { sats: [], visible: [], points: [], selected: null, trail: [], sim: null, timer: 0, req: 0, map: null, mapLayer: null, mapTrack: null, obsMarker: null, lastPlace: '', ctx: null, updated: null };
 const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
 const place = () => window.Sky?.place?.() || window.ASTRONOCHES_CONFIG;
 const tz = () => place().timezone || 'Europe/Madrid';
 const fmtFull = d => new Intl.DateTimeFormat('es-ES', { timeZone: tz(), dateStyle: 'medium', timeStyle: 'medium' }).format(d);
 const num = (v, n = 0) => Number.isFinite(v) ? v.toFixed(n).replace('.', ',') : '—';
 const now = () => T.sim || new Date();
 function kind(name, norad) {
  if (String(norad) === '25544' || /\b(ISS|ZARYA)\b/i.test(name)) return { type: 'Estación espacial', icon: '🛰️', desc: 'La Estación Espacial Internacional es un laboratorio orbital tripulado en órbita baja, a unos 400 km.' };
  if (/CSS|TIANHE|TIANGONG/i.test(name)) return { type: 'Estación espacial', icon: '🛰️', desc: 'Módulo de la estación espacial china Tiangong.' };
  if (/STARLINK/i.test(name)) return { type: 'Comunicaciones', icon: '📡', desc: 'Satélite de la constelación Starlink de SpaceX.' };
  if (/HST|HUBBLE/i.test(name)) return { type: 'Telescopio espacial', icon: '🔭', desc: 'Telescopio espacial Hubble, en órbita baja desde 1990.' };
  if (/NOAA|METOP|METEOR|GOES|FENGYUN/i.test(name)) return { type: 'Meteorología', icon: '🌦️', desc: 'Satélite meteorológico de observación terrestre.' };
  if (/R\/B|DEB/i.test(name)) return { type: 'Etapa de cohete o resto', icon: '🚀', desc: 'Etapa superior de cohete o fragmento en órbita.' };
  return { type: 'Satélite artificial', icon: '🛰️', desc: 'Objeto orbital identificado por su designación y número NORAD.' };
 }

 /* ---------- cálculo ---------- */
 function sunVec(date) { const v = Astronomy.GeoVector('Sun', date, true), n = Math.hypot(v.x, v.y, v.z); return { x: v.x / n, y: v.y / n, z: v.z / n }; }
 function satPos(rec, date, sun) {
  const pv = satellite.propagate(rec, date); if (!pv.position || !Number.isFinite(pv.position.x)) return null;
  const p = place(), g = satellite.gstime(date), ecf = satellite.eciToEcf(pv.position, g);
  const look = satellite.ecfToLookAngles({ latitude: p.lat * D, longitude: p.lon * D, height: (p.elevation || 0) / 1000 }, ecf), geo = satellite.eciToGeodetic(pv.position, g);
  const s = sun || sunVec(date), q = pv.position, along = q.x * s.x + q.y * s.y + q.z * s.z, perp = Math.hypot(q.x - along * s.x, q.y - along * s.y, q.z - along * s.z);
  return { az: (look.azimuth * R + 360) % 360, el: look.elevation * R, range: look.rangeSat, lat: satellite.degreesLat(geo.latitude), lon: satellite.degreesLong(geo.longitude), height: geo.height, lit: along > 0 || perp > 6378.137 };
 }
 const plot = (az, el) => { const r = HZ * (90 - Math.max(0, Math.min(90, el))) / 90, a = az * D; return { x: C - Math.sin(a) * r, y: C - Math.cos(a) * r }; };

 /* ---------- dibujo ---------- */
 function background(ctx) {
  ctx.fillStyle = '#050c16'; ctx.fillRect(0, 0, 1000, 1000);
  const g = ctx.createRadialGradient(C, C, 25, C, C, HZ); g.addColorStop(0, '#172f5c'); g.addColorStop(.7, '#0c1c38'); g.addColorStop(1, '#071321');
  ctx.beginPath(); ctx.arc(C, C, HZ, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.setLineDash([5, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(143,177,207,.25)';
  for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(C, C, HZ * (90 - a) / 90, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(C, C, HZ, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#9db4c8'; ctx.stroke();
  ctx.beginPath(); ctx.arc(C, C, 458, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#48627a'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let az = 0; az < 360; az += 5) {
   const a = az * D, major = az % 30 === 0, r1 = major ? 430 : az % 10 === 0 ? 438 : 445;
   ctx.beginPath(); ctx.moveTo(C - Math.sin(a) * r1, C - Math.cos(a) * r1); ctx.lineTo(C - Math.sin(a) * 458, C - Math.cos(a) * 458);
   ctx.lineWidth = major ? 3 : 1.5; ctx.strokeStyle = major ? '#d9e6f0' : '#6f879c'; ctx.stroke();
   if (major) { const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' }[az]; ctx.font = card ? 'bold 24px system-ui' : '17px system-ui'; ctx.fillStyle = card ? '#e7c58d' : '#aab9c7'; ctx.fillText(card || az + '°', C - Math.sin(a) * 480, C - Math.cos(a) * 480); }
  }
  ctx.font = '15px system-ui'; ctx.fillStyle = 'rgba(207,223,237,.7)'; ctx.textAlign = 'left';
  ctx.fillText('30°', C + 7, C - HZ * 30 / 90); ctx.fillText('60°', C + 7, C - HZ * 60 / 90);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e4edf5'; ctx.font = 'bold 18px system-ui'; ctx.fillText('CÉNIT', C, C - 14);
 }
 function drawStars(ctx, date, pts) {
  const sky = Sky.data(); if (!sky || !$('Stars').checked) return;
  const hor = Sky.frame(date);
  if ($('Constellations').checked) {
   ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(100,190,231,.33)';
   for (const segs of Object.values(sky.lines)) for (const seg of segs) {
    ctx.beginPath(); let on = false;
    for (const [ra, dec] of seg) { const h = hor(ra, dec); if (h.alt < 0) { on = false; continue; } const p = plot(h.az, h.alt); on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; }
    ctx.stroke();
   }
   if ($('Names').checked) { ctx.font = '12px system-ui'; ctx.fillStyle = 'rgba(174,204,228,.6)'; ctx.textAlign = 'center'; for (const c of sky.constellations) { if (c.rank > 2) continue; const h = hor(c.ra, c.dec); if (h.alt < 8) continue; const p = plot(h.az, h.alt); ctx.fillText(c.name, p.x, p.y); } }
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const s of sky.stars) {
   if (s[2] > 4.5) break; const h = hor(s[0], s[1]); if (h.alt < 0) continue;
   const p = plot(h.az, h.alt), size = Math.max(1, 5.2 - s[2] * .95);
   ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fillStyle = s[2] < 1 ? '#fff5d4' : '#dceaff'; ctx.shadowColor = '#a9d8ff'; ctx.shadowBlur = s[2] < 1 ? 11 : 3; ctx.fill(); ctx.shadowBlur = 0;
   if (s[4]) { pts.push({ kind: 'star', name: s[4], az: h.az, el: h.alt, mag: s[2], ...p }); if ($('Names').checked && s[2] < 1.6) { ctx.fillStyle = '#d4dfeb'; ctx.font = '14px system-ui'; ctx.fillText(s[4], p.x + 8, p.y - 7); } }
  }
 }
 function drawSolar(ctx, date, pts) {
  if (!$('Planets').checked) return;
  for (const [name, body, color] of PLANETS) {
   const h = Sky.bodyHor(body, date); if (h.alt <= 0) continue;
   const p = plot(h.az, h.alt), big = body === 'Sun' || body === 'Moon';
   ctx.beginPath(); ctx.arc(p.x, p.y, big ? 10 : 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0;
   ctx.fillStyle = '#f4f6fa'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left'; ctx.fillText(name, p.x + 12, p.y + 1);
   pts.push({ kind: 'planet', name, az: h.az, el: h.alt, ...p });
  }
 }
 function drawSky(date) {
  const ctx = T.ctx, pts = []; background(ctx); drawStars(ctx, date, pts); drawSolar(ctx, date, pts);
  if ($('Objects').checked) for (const s of T.visible) {
   const p = plot(s.az, s.el), color = s.candidate ? '#72e4bb' : s.lit ? '#ffd47b' : '#69baff';
   ctx.beginPath(); ctx.arc(p.x, p.y, s.candidate ? 8 : 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = s.candidate ? 16 : 8; ctx.fill(); ctx.shadowBlur = 0;
   pts.push({ ...s, kind: 'satellite', ...p });
  }
  if (T.selected?.kind === 'satellite' && T.trail.length > 1) {
   ctx.beginPath(); T.trail.forEach((q, i) => { const p = plot(q.az, q.el); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
   ctx.strokeStyle = 'rgba(255,217,126,.75)'; ctx.lineWidth = 3; ctx.setLineDash([7, 7]); ctx.stroke(); ctx.setLineDash([]);
   const cur = T.visible.find(x => x.norad === T.selected.norad);
   if (cur) { const p = plot(cur.az, cur.el); ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.strokeStyle = '#fff1b7'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff1b7'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left'; ctx.fillText(cur.name, p.x + 18, p.y); }
  }
  T.points = pts;
 }

 /* ---------- lista, detalle y mapa ---------- */
 function renderList() {
  const box = $('ObjectList');
  if (!T.sats.length) return;
  if (!T.visible.length) { box.innerHTML = '<div class="sat-empty">No hay satélites que cumplan estos filtros sobre el horizonte en este momento.</div>'; return; }
  box.innerHTML = T.visible.slice(0, 80).map(s => `<button class="sat-row${T.selected?.norad === s.norad ? ' selected' : ''}" data-norad="${s.norad}" type="button"><i class="${s.candidate ? 'possible' : s.lit ? 'lit' : 'shadow'}"></i><span><b>${esc(s.name)}</b><small>${Math.round(s.az)}° · ${Math.round(s.el)}° · ${s.lit ? 'iluminado' : 'en sombra'}</small></span><em>${Math.round(s.height)} km</em></button>`).join('');
 }
 function detail(item) {
  const box = $('ObjectDetail');
  if (!item) { box.textContent = 'Selecciona una estrella, planeta o satélite para consultar sus datos.'; return; }
  if (item.kind === 'satellite') { const k = kind(item.name, item.norad); box.innerHTML = `<strong>${k.icon} ${esc(item.name)}</strong><br>${k.type} · NORAD ${item.norad}<br>${esc(k.desc)}<br>Azimut ${Math.round(item.az)}° · altura ${num(item.el, 1)}° · altitud orbital ${Math.round(item.height)} km<br>Distancia ${Math.round(item.range).toLocaleString('es-ES')} km · ${item.lit ? 'iluminado por el Sol' : 'en la sombra de la Tierra'}${item.candidate ? ' · <b class="ok">posible observación</b>' : ''}.`; }
  else if (item.kind === 'star') box.innerHTML = `<strong>⭐ ${esc(item.name)}</strong><br>Estrella · magnitud aparente ${num(item.mag, 1)}<br>Azimut ${Math.round(item.az)}° · altura ${num(item.el)}°.`;
  else box.innerHTML = `<strong>✦ ${esc(item.name)}</strong><br>Sistema Solar<br>Azimut ${Math.round(item.az)}° · altura ${num(item.el)}°.`;
 }
 function select(item) {
  T.selected = item; T.trail = [];
  if (item.kind === 'satellite') { const d = now(); for (let m = -20; m <= 20; m++) { const p = satPos(item.rec, new Date(d.getTime() + m * 60e3)); if (p && p.el > 0) T.trail.push(p); } }
  detail(item); render();
 }
 function initMap() {
  if (T.map || !window.L) return; const p = place();
  T.map = L.map('satWorldMap', { worldCopyJump: true, preferCanvas: true }).setView([p.lat, p.lon], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { referrerPolicy: 'strict-origin-when-cross-origin', attribution: '© OpenStreetMap', maxZoom: 12 }).addTo(T.map);
  T.obsMarker = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#e7c58d', fillOpacity: 1 }).addTo(T.map);
  T.mapLayer = L.layerGroup().addTo(T.map); T.lastPlace = `${p.lat},${p.lon}`;
 }
 function renderMap(date) {
  if ($('WorldView').hidden || !window.L) return; initMap(); if (!T.map) return;
  const p = place(); T.mapLayer.clearLayers(); if (T.mapTrack) { T.map.removeLayer(T.mapTrack); T.mapTrack = null; }
  T.obsMarker.setLatLng([p.lat, p.lon]).bindTooltip(`Punto de observación · ${esc(p.name)}`);
  if (T.lastPlace !== `${p.lat},${p.lon}`) { T.map.setView([p.lat, p.lon], 2); T.lastPlace = `${p.lat},${p.lon}`; }
  // En el mapa mundial se muestran también los satélites bajo el horizonte local.
  const list = T.all.slice(0, $('Group').value === 'active' || $('Group').value === 'starlink' ? 1500 : 2000);
  for (const s of list) {
   const m = L.circleMarker([s.lat, s.lon], { radius: T.selected?.norad === s.norad ? 8 : 3.5, color: '#fff0c5', weight: T.selected?.norad === s.norad ? 2 : .5, fillColor: s.el >= 0 ? (s.candidate ? '#72e4bb' : s.lit ? '#ffd47b' : '#69baff') : '#7d8a99', fillOpacity: .9 });
   m.bindTooltip(esc(s.name)); m.on('click', () => select({ ...s, kind: 'satellite' })); T.mapLayer.addLayer(m);
  }
  if (T.selected?.kind === 'satellite') {
   const tr = []; for (let m = 0; m <= 45; m += 1) { const q = satPos(T.selected.rec, new Date(date.getTime() + m * 60e3)); if (q) tr.push([q.lat, q.lon]); }
   const parts = [[]]; for (const pt of tr) { const cur = parts.at(-1); if (cur.length && Math.abs(cur.at(-1)[1] - pt[1]) > 180) parts.push([]); parts.at(-1).push(pt); }
   T.mapTrack = L.layerGroup(parts.filter(x => x.length > 1).map(x => L.polyline(x, { color: '#ffdb82', weight: 2.5 }))).addTo(T.map);
  }
 }
 function render() {
  if (!T.ctx) return;
  const date = now(), sunAlt = Sky.bodyHor('Sun', date).alt, min = Number($('Elevation').value), filter = $('Filter').value, sun = sunVec(date);
  T.visible = []; T.all = [];
  for (const s of T.sats) {
   let p; try { p = satPos(s.rec, date, sun); } catch (e) { p = null; } if (!p) continue;
   const candidate = p.lit && sunAlt <= -6 && p.el > 0, item = { ...s, ...p, candidate };
   T.all.push(item);
   if (p.el < min || p.el < 0) continue;
   if ((filter === 'lit' && !p.lit) || (filter === 'candidate' && !candidate)) continue;
   T.visible.push(item);
  }
  T.visible.sort((a, b) => b.el - a.el);
  if (T.selected?.kind === 'satellite') { const cur = T.all.find(x => x.norad === T.selected.norad); if (cur) { T.selected = { ...cur, kind: 'satellite' }; detail(T.selected); } }
  drawSky(date);
  $('Count').textContent = T.visible.length.toLocaleString('es-ES');
  $('LocalTime').textContent = $('Clock').textContent = fmtFull(date);
  $('TimeMode').textContent = T.sim ? 'Fecha seleccionada · posiciones fijas' : 'Tiempo real · actualización cada 10 s';
  renderList(); renderMap(date);
  if (!T.selected) detail(T.points.filter(x => x.el > 0).sort((a, b) => b.el - a.el)[0] || null);
 }

 /* ---------- datos ---------- */
 async function load() {
  const id = ++T.req, g = $('Group'); $('Status').textContent = `Actualizando catálogo «${g.selectedOptions[0].textContent}»…`;
  $('ObjectList').innerHTML = '<div class="sat-empty">Descargando elementos orbitales…</div>';
  try {
   const r = await fetch(`api/satellites.php?group=${encodeURIComponent(g.value)}`), data = await r.json();
   if (id !== T.req) return; if (!r.ok || !data.ok) throw Error(data.error || 'Sin datos');
   T.sats = data.satellites.map(s => { try { return { name: s.name, norad: s.norad, rec: satellite.twoline2satrec(s.l1, s.l2) }; } catch (e) { return null; } }).filter(Boolean);
   T.selected = null; T.trail = [];
   $('Status').textContent = `${T.sats.length.toLocaleString('es-ES')} satélites · TLE de ${data.source} del ${fmtFull(new Date(data.updated))}${data.stale ? ' (copia anterior: CelesTrak no responde)' : ''} · posiciones recalculadas cada 10 s`;
  } catch (e) { if (id !== T.req) return; T.sats = []; $('Status').textContent = `No se pudo cargar el catálogo de órbitas (${e.message}). La carta estelar sigue disponible.`; $('ObjectList').innerHTML = '<div class="sat-empty">Catálogo orbital no disponible.</div>'; }
  render();
 }
 function setView(world) {
  $('SkyView').hidden = world; $('WorldView').hidden = !world;
  $('SkyButton').classList.toggle('active', !world); $('WorldButton').classList.toggle('active', world);
  $('SkyButton').setAttribute('aria-pressed', String(!world)); $('WorldButton').setAttribute('aria-pressed', String(world));
  if (world) { initMap(); setTimeout(() => { T.map?.invalidateSize(); render(); }, 50); } else render();
 }
 function localInputValue(d) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
 function fromLocalInput(v) { // interpreta la fecha en la zona del lugar
  const guess = new Date(v + 'Z'), parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(guess).map(x => [x.type, x.value]));
  const off = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - guess.getTime(); return new Date(guess.getTime() - off);
 }
 function setPlace() { const p = place(); $('PlaceName').textContent = p.name; $('PlaceDescription').textContent = `Cielo cenital desde ${p.name} (${Math.abs(p.lat).toFixed(3).replace('.', ',')}° ${p.lat >= 0 ? 'N' : 'S'}; ${Math.abs(p.lon).toFixed(3).replace('.', ',')}° ${p.lon >= 0 ? 'E' : 'O'}). Centro: cénit. Borde interior: horizonte. Norte arriba y este a la izquierda.`; $('TimeLabel').textContent = `Fecha y hora de ${p.name}`; render(); }
 function init() {
  const canvas = $('SkyCanvas'); if (!canvas || !window.satellite) return; T.ctx = canvas.getContext('2d');
  $('SkyButton').addEventListener('click', () => setView(false)); $('WorldButton').addEventListener('click', () => setView(true));
  ['Elevation', 'Filter'].forEach(id => $(id).addEventListener('change', render));
  ['Stars', 'Constellations', 'Names', 'Planets', 'Objects'].forEach(id => $(id).addEventListener('change', render));
  $('Group').addEventListener('change', load); $('Refresh').addEventListener('click', load);
  $('DateTime').addEventListener('change', e => { T.sim = e.target.value ? fromLocalInput(e.target.value) : null; if (T.selected) select(T.selected); else render(); });
  $('Now').addEventListener('click', () => { T.sim = null; $('DateTime').value = ''; render(); });
  $('UseSlider').addEventListener('click', () => { const t = Sky.time(); if (!t) return; T.sim = t; $('DateTime').value = localInputValue(t); render(); });
  $('ObjectList').addEventListener('click', e => { const b = e.target.closest('[data-norad]'); if (!b) return; const s = T.visible.find(x => String(x.norad) === b.dataset.norad); if (s) select({ ...s, kind: 'satellite' }); });
  canvas.addEventListener('click', e => {
   const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 1000 / r.width, y = (e.clientY - r.top) * 1000 / r.height;
   const hit = T.points.map(p => ({ p, d: Math.hypot(p.x - x, p.y - y) })).filter(o => o.d < 26).sort((a, b) => a.d - b.d)[0];
   if (hit) select(hit.p); else { T.selected = null; T.trail = []; render(); }
  });
  $('Fold').addEventListener('click', () => { const f = $('Module').classList.toggle('folded'); $('Fold').textContent = f ? '+ Desplegar' : '− Plegar'; $('Fold').setAttribute('aria-expanded', String(!f)); });
  T.timer = setInterval(() => { if (!document.hidden && !T.sim && !$('Module').classList.contains('folded')) render(); }, 10000);
  const wait = () => Sky.data() ? (setPlace(), load()) : setTimeout(wait, 200); wait();
 }
 window.SatTracker = { init, setPlace };
 document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
