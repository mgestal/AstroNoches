/* AstroNoches · Reconocimiento del cielo nocturno.
   Resuelve la foto con SkySolver (https://skysolver.app/api), detecta qué parte de la imagen es cielo
   y dibuja constelaciones, estrellas, objetos y cuerpos del Sistema Solar solo sobre esa parte. */
(() => {
 const API = 'https://skysolver.app/api/v1', MAXSIDE = 4096, GRID = 240;
 const $ = id => document.getElementById(id);
 if (!$('skyid')) return;
 const S = { file: null, src: null, W: 0, H: 0, sol: null, ann: null, exif: {}, busy: false,
  grid: null, auto: null, edit: null, brush: 'off', painting: false, drawQueued: false, labels: [] };

 /* ---------- utilidades ---------- */
 const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
 const nbsp = s => String(s || '').replace(/[\u2000-\u200b]/g, ' ');
 function status(text, kind = '') { const el = $('siStatus'); el.className = 'si-status ' + kind; el.querySelector('span').textContent = text; }
 const layer = k => document.querySelector(`[data-si-layer="${k}"]`)?.checked;
 const pad = n => String(n).padStart(2, '0');
 const localInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
 function fmtRA(deg) { const h = ((deg / 15) % 24 + 24) % 24, hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${hh}h ${pad(mm % 60)}m`; }
 const fmtDec = d => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(1)}°`;

 /* ---------- EXIF: fecha original y GPS (JPEG) ---------- */
 function readExif(buf) {
  try {
   const v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return {};
   let o = 2;
   while (o + 4 < v.byteLength) {
    const m = v.getUint16(o), len = v.getUint16(o + 2);
    if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiff(v, o + 10);
    if ((m & 0xFF00) !== 0xFF00 || m === 0xFFDA) break; o += 2 + len;
   }
  } catch (e) {}
  return {};
 }
 function tiff(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const ifd = off => { const out = {}, n = u16(off); for (let i = 0; i < n; i++) { const e = off + 2 + i * 12, type = u16(e + 2), count = u32(e + 4), size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1; out[u16(e)] = { type, count, at: count * size <= 4 ? e + 8 : t + u32(e + 8) }; } return out; };
  const ascii = f => { let s = ''; for (let i = 0; i < f.count - 1; i++) { const c = v.getUint8(f.at + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const rats = f => Array.from({ length: f.count }, (_, i) => u32(f.at + i * 8) / (u32(f.at + i * 8 + 4) || 1));
  const out = {}, ifd0 = ifd(t + u32(t + 4));
  if (ifd0[0x8769]) { const ex = ifd(t + u32(ifd0[0x8769].at)); if (ex[0x9003]) out.date = ascii(ex[0x9003]); if (ex[0x9011]) out.offset = ascii(ex[0x9011]); }
  if (ifd0[0x8825]) { const g = ifd(t + u32(ifd0[0x8825].at));
   if (g[2] && g[4]) { const dms = a => a[0] + a[1] / 60 + a[2] / 3600; let lat = dms(rats(g[2])), lon = dms(rats(g[4]));
    if (g[1] && ascii(g[1]) === 'S') lat = -lat; if (g[3] && ascii(g[3]) === 'W') lon = -lon;
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) { out.lat = lat; out.lon = lon; } } }
  if (out.date) { const m = out.date.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)(?::(\d\d))?/);
   if (m) { const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`; const d = /^[+-]\d\d:\d\d$/.test(out.offset || '') ? new Date(iso + out.offset) : new Date(iso); if (!isNaN(d)) out.time = d; } }
  return out;
 }

 /* ---------- carga de la foto ---------- */
 async function loadFile(file) {
  if (!file || !/^image\//.test(file.type) && !/\.(jpe?g|png|tiff?|webp)$/i.test(file.name)) { status('Ese archivo no parece una imagen.', 'err'); return; }
  status('Abriendo la fotografía…', 'busy');
  try {
   const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
   const k = Math.min(1, MAXSIDE / Math.max(bmp.width, bmp.height));
   const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
   c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
   S.file = file; S.src = c; S.W = c.width; S.H = c.height; S.sol = S.ann = S.auto = S.edit = null; S.labels = [];
   S.exif = readExif(await file.slice(0, 262144).arrayBuffer());
   $('siFileName').textContent = `${file.name} · ${S.W}×${S.H}`;
   const cv = $('siCanvas'); cv.width = S.W; cv.height = S.H; cv.hidden = false; $('siEmpty').hidden = true;
   setWhenDefaults();
   $('siGo').disabled = false; $('siRetry').disabled = false; $('siZoom').disabled = false; $('siSave').disabled = true; $('siResetMask').disabled = true;
   $('siState').textContent = 'Foto cargada · sin identificar'; resetSummary();
   draw(); status('Foto lista. Pulsa «Reconocer mi cielo».');
  } catch (e) { status('No se pudo abrir la imagen en este navegador.', 'err'); }
 }
 function setWhenDefaults() {
  const ex = S.exif, place = window.Sky?.place?.() || window.ASTRONOCHES_CONFIG || {};
  $('siTime').value = localInput(ex.time || new Date());
  $('siLat').value = (ex.lat ?? place.lat ?? '') === '' ? '' : Number(ex.lat ?? place.lat).toFixed(4);
  $('siLon').value = (ex.lon ?? place.lon ?? '') === '' ? '' : Number(ex.lon ?? place.lon).toFixed(4);
  $('siWhenSource').textContent = `${ex.time ? 'Fecha tomada de la foto (EXIF)' : 'La foto no trae fecha: se usa la hora actual'} · ${ex.lat != null ? 'lugar del GPS de la foto' : `lugar: ${place.name || 'tu lugar de observación'}`}.`;
 }

 /* ---------- variantes para fotos difíciles ---------- */
 function variant(mode) {
  if (mode === 'original') return S.src.toDataURL('image/jpeg', .95);
  const w = S.W, h = S.H, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(S.src, 0, 0);
  const img = x.getImageData(0, 0, w, h), d = img.data, n = w * h, lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = .2126 * d[i * 4] + .7152 * d[i * 4 + 1] + .0722 * d[i * 4 + 2];
  let out;
  if (mode === 'balanced') {
   const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[lum[i] | 0]++;
   const pct = p => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= p * n) return v; } return 255; };
   const lo = pct(.008), hi = Math.max(pct(.998), lo + 18);
   out = v => 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), .68);
   for (let i = 0; i < n; i++) { const v = out(lum[i]); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
  } else {
   const bw = Math.max(24, Math.round(w / 32)), bh = Math.max(24, Math.round(h / 32));
   const sc = document.createElement('canvas'); sc.width = bw; sc.height = bh; const sx = sc.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(S.src, 0, 0, bw, bh);
   const bc = document.createElement('canvas'); bc.width = w; bc.height = h; const bx = bc.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingEnabled = true; bx.drawImage(sc, 0, 0, w, h);
   const b = bx.getImageData(0, 0, w, h).data;
   for (let i = 0; i < n; i++) { const bg = .2126 * b[i * 4] + .7152 * b[i * 4 + 1] + .0722 * b[i * 4 + 2], r = Math.max(0, lum[i] - bg - 5), v = 255 * Math.pow(Math.min(1, r / 42), .72); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
  }
  x.putImageData(img, 0, 0); return c.toDataURL('image/jpeg', .96);
 }

 /* ---------- SkySolver ---------- */
 async function post(path, body) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 55000);
  try {
   const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
   let j = null; try { j = await r.json(); } catch (e) {}
   if (r.status === 429) { const s = Number(r.headers.get('Retry-After') || j?.retry_after || 60); throw Error(`SkySolver está ocupado o se alcanzó el límite gratuito (1 foto por minuto tras 10 seguidas). Inténtalo de nuevo en ${Math.ceil(s)} s.`); }
   if (r.status === 413) throw Error('La imagen es demasiado grande para SkySolver.');
   if (!r.ok) throw Error(j?.message || `SkySolver respondió ${r.status}.`);
   return j;
  } catch (e) { if (e.name === 'AbortError') throw Error('SkySolver tardó demasiado en responder.'); if (e instanceof TypeError) throw Error('No se pudo conectar con SkySolver. Comprueba la conexión.'); throw e; }
  finally { clearTimeout(tm); }
 }
 async function recognise(modes) {
  if (!S.src || S.busy) return; S.busy = true; $('siGo').disabled = $('siRetry').disabled = true;
  const names = { original: 'la foto original', balanced: 'el contraste estirado', stars: 'el fondo difuso restado' };
  try {
   let sol = null;
   for (const m of modes) {
    status(`Buscando patrones estelares con ${names[m]}…`, 'busy');
    const r = await post('/solve/image', { image: variant(m), time_limit_ms: 30000 });
    if (r?.solved) { sol = r; sol._mode = m; break; }
   }
   if (!sol) { S.sol = null; S.ann = null; draw(); resetSummary(); $('siState').textContent = 'Sin identificar';
    status('No se reconoció el campo estelar. Prueba «Reintentar con realce nocturno» o una foto con más estrellas nítidas y menos nubes.', 'err'); return; }
   S.sol = sol; S.edit = null;
   status('Campo reconocido. Buscando constelaciones y objetos…', 'busy');
   await annotate();
   computeMask();
   $('siResetMask').disabled = false; $('siSave').disabled = false; $('siApplyWhen').disabled = false;
   const st = sol.stats || {};
   $('siState').textContent = `${st.matches || 0} estrellas de catálogo · ${(sol.scale_arcsec || 0).toFixed(1)}″/px`;
   status(`Identificado${sol._mode !== 'original' ? ' con realce nocturno' : ''}: ${st.matches || 0} estrellas coinciden con Gaia DR3. Las etiquetas solo se dibujan sobre el cielo.`, 'ok');
   draw();
  } catch (e) { status(e.message, 'err'); }
  finally { S.busy = false; $('siGo').disabled = $('siRetry').disabled = !S.src; }
 }
 async function annotate() {
  const t = new Date($('siTime').value), lat = parseFloat($('siLat').value), lon = parseFloat($('siLon').value);
  const body = { solution: S.sol, format: 'json', layout_width: 1400, detail: .18, view: { constellations: { on: true }, grid: { on: false }, objects: true, labels: true } };
  if (!isNaN(t)) body.time = t.toISOString();
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) body.location = { lat, lon };
  S.ann = await post('/annotate', body);
 }

 /* ---------- máscara cielo / suelo ----------
    Rejilla de ~240 celdas en el lado largo. El cielo crece desde las celdas con estrellas reconocidas
    mientras el color de fondo (sin estrellas) cambie suavemente y la textura sea baja. */
 function computeMask() {
  const cs = Math.max(S.W, S.H) / GRID, GW = Math.max(8, Math.round(S.W / cs)), GH = Math.max(8, Math.round(S.H / cs)), n = GW * GH;
  const c = document.createElement('canvas'); c.width = GW * 4; c.height = GH * 4;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(S.src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data, cw = c.width, ch = c.height;
  // filtro de mínimo 3×3 por canal: borra las estrellas y deja el fondo
  const mn = new Uint8ClampedArray(cw * ch * 3);
  for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) for (let k = 0; k < 3; k++) {
   let m = 255; for (let dy = -1; dy <= 1; dy++) { const y2 = Math.min(ch - 1, Math.max(0, yy + dy)); for (let dx = -1; dx <= 1; dx++) { const x2 = Math.min(cw - 1, Math.max(0, xx + dx)), v = d[(y2 * cw + x2) * 4 + k]; if (v < m) m = v; } }
   mn[(yy * cw + xx) * 3 + k] = m;
  }
  const bg = new Float32Array(n * 3), tex = new Float32Array(n);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
   let r = 0, g = 0, b = 0, s = 0, s2 = 0;
   for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const p = ((gy * 4 + dy) * cw + gx * 4 + dx) * 3, L = .2126 * mn[p] + .7152 * mn[p + 1] + .0722 * mn[p + 2]; r += mn[p]; g += mn[p + 1]; b += mn[p + 2]; s += L; s2 += L * L; }
   const i = gy * GW + gx; bg[i * 3] = r / 16; bg[i * 3 + 1] = g / 16; bg[i * 3 + 2] = b / 16; tex[i] = Math.sqrt(Math.max(0, s2 / 16 - (s / 16) ** 2));
  }
  const dist = (a, b) => Math.hypot(bg[a * 3] - bg[b * 3], bg[a * 3 + 1] - bg[b * 3 + 1], bg[a * 3 + 2] - bg[b * 3 + 2]);
  const diffs = []; for (let i = 0; i < n; i += 3) if ((i % GW) < GW - 1) diffs.push(dist(i, i + 1));
  const median = a => { const s = Float32Array.from(a).sort(); return s[s.length >> 1] || 0; };
  const tol = Math.max(3, 3 * median(diffs)), texMax = Math.max(6, 3 * median(tex));
  const sky = new Uint8Array(n), q = new Int32Array(n); let qh = 0, qt = 0;
  for (const m of S.sol.matched || []) { const gx = Math.floor(m[0] / cs), gy = Math.floor(m[1] / cs); if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) { const i = gy * GW + gx; if (!sky[i]) { sky[i] = 1; q[qt++] = i; } } }
  while (qh < qt) {
   const i = q[qh++], gx = i % GW, gy = (i / GW) | 0;
   for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const j = ny * GW + nx; if (sky[j]) continue;
    if (dist(i, j) <= tol && tex[j] <= texMax) { sky[j] = 1; q[qt++] = j; }
   }
  }
  // limpieza: fuera islas pequeñas de cielo (huecos entre ramas) y rellena huecos pequeños dentro del cielo (Luna, planetas, estrellas muy brillantes)
  components(sky, GW, GH, 1, (cells, border) => { if (cells.length < n * .004) cells.forEach(i => sky[i] = 0); });
  components(sky, GW, GH, 0, (cells, border) => { if (!border && cells.length < n * .02) cells.forEach(i => sky[i] = 1); });
  S.grid = { GW, GH, cs }; S.auto = sky; S.edit = new Int8Array(n);
 }
 function components(arr, GW, GH, val, fn) {
  const seen = new Uint8Array(arr.length), st = new Int32Array(arr.length);
  for (let s = 0; s < arr.length; s++) {
   if (seen[s] || arr[s] !== val) continue;
   let top = 0, border = false; const cells = []; st[top++] = s; seen[s] = 1;
   while (top) { const i = st[--top], x = i % GW, y = (i / GW) | 0; cells.push(i); if (!x || !y || x === GW - 1 || y === GH - 1) border = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const j = ny * GW + nx; if (!seen[j] && arr[j] === val) { seen[j] = 1; st[top++] = j; } } }
   fn(cells, border);
  }
 }
 function isSkyCell(gx, gy) { const g = S.grid; if (!g || gx < 0 || gy < 0 || gx >= g.GW || gy >= g.GH) return false; const i = gy * g.GW + gx, e = S.edit[i]; return e ? e > 0 : !!S.auto[i]; }
 const isSky = (x, y) => S.grid ? isSkyCell(Math.floor(x / S.grid.cs), Math.floor(y / S.grid.cs)) : true;
 const isSkyStrict = (x, y) => { if (!S.grid) return true; const gx = Math.floor(x / S.grid.cs), gy = Math.floor(y / S.grid.cs); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isSkyCell(gx + dx, gy + dy)) return false; return true; };

 /* ---------- pincel ---------- */
 function paintAt(ev) {
  const cv = $('siCanvas'), r = cv.getBoundingClientRect(), g = S.grid; if (!g) return;
  const x = (ev.clientX - r.left) * S.W / r.width, y = (ev.clientY - r.top) * S.H / r.height;
  const rad = Number($('siBrushSize').value) / 100 * Math.max(S.W, S.H) / g.cs, cx = x / g.cs, cy = y / g.cs, v = S.brush === 'sky' ? 1 : -1;
  for (let gy = Math.floor(cy - rad); gy <= cy + rad; gy++) for (let gx = Math.floor(cx - rad); gx <= cx + rad; gx++) {
   if (gx < 0 || gy < 0 || gx >= g.GW || gy >= g.GH) continue;
   if ((gx + .5 - cx) ** 2 + (gy + .5 - cy) ** 2 <= rad * rad) S.edit[gy * g.GW + gx] = v;
  }
  queueDraw();
 }
 function setBrush(mode) {
  S.brush = mode;
  document.querySelectorAll('[data-si-brush]').forEach(b => { const on = b.dataset.siBrush === mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  $('siCanvas').classList.toggle('brushing', mode !== 'off');
  if (mode !== 'off' && S.grid && !$('siShowMask').checked) { $('siShowMask').checked = true; queueDraw(); }
 }

 /* ---------- nombres en español ---------- */
 const BODY = { Sun: 'Sol', Moon: 'Luna', Mercury: 'Mercurio', Venus: 'Venus', Mars: 'Marte', Jupiter: 'Júpiter', Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Neptuno', Pluto: 'Plutón' };
 const DSO = { 'Orion Nebula': 'Nebulosa de Orión', 'Pleiades': 'Pléyades', 'Andromeda Galaxy': 'Galaxia de Andrómeda', 'Beehive Cluster': 'El Pesebre', 'Hyades Cluster': 'Híades', 'Triangulum Galaxy': 'Galaxia del Triángulo',
  'Lagoon Nebula': 'Nebulosa de la Laguna', 'Trifid Nebula': 'Nebulosa Trífida', 'Eagle Nebula': 'Nebulosa del Águila', 'Omega Nebula': 'Nebulosa Omega', 'Ring Nebula': 'Nebulosa del Anillo', 'Dumbbell Nebula': 'Nebulosa Dumbbell',
  'Crab Nebula': 'Nebulosa del Cangrejo', 'Whirlpool Galaxy': 'Galaxia del Remolino', 'Pinwheel Galaxy': 'Galaxia del Molinete', "Bode's Galaxy": 'Galaxia de Bode', 'Cigar Galaxy': 'Galaxia del Cigarro', 'Sombrero Galaxy': 'Galaxia del Sombrero',
  'Hercules Cluster': 'Cúmulo de Hércules', 'Double Cluster': 'Doble Cúmulo', 'North America Nebula': 'Nebulosa Norteamérica', 'California Nebula': 'Nebulosa California', 'Rosette Nebula': 'Nebulosa Roseta', 'Heart Nebula': 'Nebulosa del Corazón',
  'Soul Nebula': 'Nebulosa del Alma', 'Flame Nebula': 'Nebulosa de la Llama', 'Horsehead Nebula': 'Nebulosa Cabeza de Caballo', "Barnard's Loop": 'Bucle de Barnard', 'Veil Nebula': 'Nebulosa del Velo', 'Wild Duck Cluster': 'Cúmulo del Pato Salvaje',
  'Butterfly Cluster': 'Cúmulo de la Mariposa', 'Ptolemy Cluster': 'Cúmulo de Ptolomeo', 'Little Beehive Cluster': 'Pequeño Pesebre', 'Coma Star Cluster': 'Cúmulo de Coma', 'Owl Nebula': 'Nebulosa del Búho', 'Helix Nebula': 'Nebulosa de la Hélice',
  'Large Magellanic Cloud': 'Gran Nube de Magallanes', 'Small Magellanic Cloud': 'Pequeña Nube de Magallanes', 'Lambda Orionis Ring': 'Anillo de Lambda Orionis', 'Running Man Nebula': 'Nebulosa del Hombre Corriendo', "Kemble's Cascade": 'Cascada de Kemble',
  'Christmas Tree Cluster': 'Cúmulo del Árbol de Navidad', 'Cone Nebula': 'Nebulosa del Cono', 'Pacman Nebula': 'Nebulosa Pac-Man', 'Bubble Nebula': 'Nebulosa de la Burbuja', 'Iris Nebula': 'Nebulosa del Iris', 'Cocoon Nebula': 'Nebulosa del Capullo',
  'Ursa Major Moving Group': 'Grupo de la Osa Mayor', 'Heart-Shaped Cluster': 'Cúmulo del Corazón', 'Black Eye Galaxy': 'Galaxia del Ojo Negro', 'Sunflower Galaxy': 'Galaxia del Girasol', 'Leo Triplet': 'Triplete de Leo', 'Muscleman Cluster': 'Cúmulo del Forzudo' };
 function consName(id, fallback) { const c = window.Sky?.data?.()?.constellations?.find(k => k.id === id); return nbsp(c?.name || fallback || id); }
 function starName(o) {
  const st = window.Sky?.data?.()?.stars; let best = null, bd = .25;
  if (st && Number.isFinite(o.ra)) for (const s of st) { if (!s[4]) continue; const dd = Math.abs(s[1] - o.dec); if (dd > bd) continue; const dr = Math.abs(((s[0] - o.ra + 540) % 360) - 180) * Math.cos(o.dec * Math.PI / 180); const dist = Math.hypot(dr, dd); if (dist < bd) { bd = dist; best = s[4]; } }
  return nbsp(best || o.name || o.label);
 }
 function dsoKind(o) { const c = o.catalogs || []; if (o.group === 'star') return 'stars'; if (c.includes('messier')) return 'messier'; if (c.includes('ngc') || c.includes('ic')) return 'ngc'; return 'other'; }
 const DSOCOL = { messier: '#f7cf4a', ngc: '#86d3f3', other: '#c9a5ff' };
 const BODYCOL = { star: '#ffbf61', moon: '#f3f2df' };

 /* ---------- dibujo ---------- */
 const queueDraw = () => { if (S.drawQueued) return; S.drawQueued = true; requestAnimationFrame(() => { S.drawQueued = false; draw(); }); };
 function draw() {
  const cv = $('siCanvas'); if (!S.src) return; const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S.W, S.H);
  if (layer('photo')) ctx.drawImage(S.src, 0, 0); else { ctx.fillStyle = '#07111f'; ctx.fillRect(0, 0, S.W, S.H); }
  if (S.grid && $('siShowMask').checked) drawMask(ctx);
  if (!S.ann) return;
  const shown = cv.getBoundingClientRect().width || S.W, k = Math.max(S.W / 1400, .9 * S.W / Math.min(shown, 1400)), alpha = Number($('siAlpha').value) / 100, fs = Number($('siSize').value) / 100;
  const cand = [];   // etiquetas candidatas: {text,x,y,pri,color,size}
  const stats = { cons: new Map(), stars: 0, bodies: [] };
  ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
  // constelaciones: tramos solo donde ambos extremos son cielo
  for (const c of S.ann.constellations || []) {
   let vis = 0, sx = 0, sy = 0;
   for (const line of c.lines || []) {
    ctx.beginPath(); let pen = false;
    for (let i = 0; i + 1 < line.length; i += 2) {
     const x = line[i], y = line[i + 1], ok = x >= 0 && y >= 0 && x < S.W && y < S.H && isSky(x, y);
     if (ok) { vis++; sx += x; sy += y; if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; } else pen = false;
    }
    if (layer('lines')) { ctx.strokeStyle = `rgba(110,215,235,${.85 * alpha})`; ctx.lineWidth = 1.6 * k; ctx.stroke(); }
   }
   if (!vis) continue;
   const name = consName(c.id, c.name); stats.cons.set(c.id, { name, vis });
   let at = c.label_at && isSkyStrict(c.label_at[0], c.label_at[1]) ? c.label_at : null;
   if (!at) { const cx = sx / vis, cy = sy / vis; if (isSkyStrict(cx, cy)) at = [cx, cy]; }
   if (at) cand.push({ text: name.toUpperCase(), x: at[0], y: at[1], pri: 1, color: '#8fe3f0', size: 13 * k * fs, spacing: true, center: true });
  }
  // objetos y estrellas con nombre
  for (const o of S.ann.objects || []) {
   if (o.shown === false || !Number.isFinite(o.x) || o.x < 0 || o.y < 0 || o.x >= S.W || o.y >= S.H || !isSky(o.x, o.y)) continue;
   const kind = dsoKind(o);
   if (kind === 'stars') {
    if (!layer('stars')) continue; stats.stars++;
    const r = Math.max(5 * k, 3); ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.strokeStyle = `rgba(253,233,176,${.8 * alpha})`; ctx.lineWidth = 1.1 * k; ctx.stroke();
    cand.push({ text: starName(o), x: o.x, y: o.y, r, pri: o.mag != null && o.mag < 1.5 ? 2 : 3, color: '#fde9b0', size: 11.5 * k * fs });
    continue;
   }
   if (!layer(kind)) continue;
   const col = DSOCOL[kind]; ctx.strokeStyle = col; ctx.globalAlpha = .85 * alpha; ctx.lineWidth = 1.2 * k;
   const ring = Array.isArray(o.outline) && o.outline.length && o.radius_px > 6 * k ? o.outline : null;
   if (ring) for (const rr of ring) { ctx.beginPath(); for (let i = 0; i + 1 < rr.length; i += 2) i ? ctx.lineTo(rr[i], rr[i + 1]) : ctx.moveTo(rr[i], rr[i + 1]); ctx.stroke(); }
   else { ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(o.radius_px || 0, 6 * k), 0, 7); ctx.stroke(); }
   ctx.globalAlpha = 1;
   const nm = o.name ? (DSO[o.name] || o.name) : ''; const lbl = nm && nm !== o.label ? `${o.label} · ${nm}` : o.label;
   cand.push({ text: lbl, x: o.x, y: o.y, r: Math.max(o.radius_px || 0, 6 * k), pri: kind === 'messier' ? 4 : 5, color: col, size: (kind === 'messier' ? 12 : 10.5) * k * fs });
  }
  // Sol, Luna y planetas
  for (const b of S.ann.bodies || []) {
   if (!Number.isFinite(b.x)) continue;
   const inFrame = b.x >= 0 && b.y >= 0 && b.x < S.W && b.y < S.H, visible = inFrame && isSky(b.x, b.y);
   const name = BODY[b.name] || b.name; if (inFrame) stats.bodies.push({ name, visible, b });
   if (!visible || !layer('bodies')) continue;
   const col = BODYCOL[b.kind] || '#8de7fc', r = Math.max(b.radius_px || 0, 9 * k);
   ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1.6 * k; ctx.stroke(); ctx.globalAlpha = 1;
   cand.push({ text: name, x: b.x, y: b.y, r, pri: 0, color: col, size: 13 * k * fs, bold: true });
  }
  if (layer('names')) placeLabels(ctx, cand, alpha, k);
  ctx.restore();
  summary(stats);
 }
 function drawMask(ctx) {
  const g = S.grid, c = document.createElement('canvas'); c.width = g.GW; c.height = g.GH;
  const x = c.getContext('2d'), im = x.createImageData(g.GW, g.GH);
  for (let gy = 0; gy < g.GH; gy++) for (let gx = 0; gx < g.GW; gx++) { const i = gy * g.GW + gx, p = i * 4; if (!isSkyCell(gx, gy)) { im.data[p] = 255; im.data[p + 1] = 50; im.data[p + 2] = 70; im.data[p + 3] = 105; } else if (S.edit[i] > 0) { im.data[p] = 60; im.data[p + 1] = 220; im.data[p + 2] = 255; im.data[p + 3] = 45; } }
  x.putImageData(im, 0, 0); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, g.GW * g.cs, g.GH * g.cs); ctx.restore();
 }
 function placeLabels(ctx, cand, alpha, k) {
  const declutter = $('siDeclutter').checked, used = [];
  cand.sort((a, b) => a.pri - b.pri);
  const hit = r => used.some(u => r.x < u.x + u.w && r.x + r.w > u.x && r.y < u.y + u.h && r.y + r.h > u.y);
  for (const c of cand) {
   ctx.font = `${c.bold ? 700 : c.spacing ? 600 : 500} ${c.size}px Inter,system-ui,sans-serif`;
   const w = ctx.measureText(c.text).width + (c.spacing ? c.text.length * c.size * .12 : 0), h = c.size * 1.05, gap = (c.r || 0) + 4 * k;
   const opts = c.center ? [[-w / 2, -h / 2]] : [[gap, -h / 2], [-gap - w, -h / 2], [-w / 2, -gap - h], [-w / 2, gap], [gap * .8, -gap - h * .6], [gap * .8, gap * .2]];
   let place = null;
   for (const [dx, dy] of opts) {
    const r = { x: c.x + dx, y: c.y + dy, w, h };
    if (r.x < 2 || r.y < 2 || r.x + r.w > S.W - 2 || r.y + r.h > S.H - 2) continue;
    if (!isSky(r.x, r.y + h / 2) || !isSky(r.x + w, r.y + h / 2) || !isSky(r.x + w / 2, r.y + h)) continue;
    if (declutter && hit(r)) continue;
    place = r; break;
   }
   if (!place) continue; used.push(place);
   if (c.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${c.size * .12}px`;
   ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
   ctx.lineWidth = Math.max(2, c.size * .28); ctx.strokeStyle = `rgba(3,8,16,${.75 * alpha})`; ctx.fillStyle = c.color; ctx.globalAlpha = Math.min(1, alpha + .1);
   ctx.strokeText(c.text, place.x, place.y + h / 2); ctx.fillText(c.text, place.x, place.y + h / 2);
   ctx.globalAlpha = 1; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
 }

 /* ---------- resumen ---------- */
 function resetSummary() { ['siNCons', 'siNStars', 'siCenter', 'siFov'].forEach(id => $(id).textContent = '—'); $('siConsList').textContent = S.src ? 'Pulsa «Reconocer mi cielo».' : 'A la espera de una fotografía.'; $('siBodyList').textContent = 'Aparecerán cuando haya fecha y hora de la foto.'; }
 function summary(st) {
  const cons = [...st.cons.values()].sort((a, b) => b.vis - a.vis);
  $('siNCons').textContent = cons.length; $('siNStars').textContent = st.stars;
  const c = S.sol?.center; $('siCenter').textContent = c ? `${fmtRA(c.ra)} · ${fmtDec(c.dec)}` : '—';
  const f = S.sol?.fov; let skyPct = 100; if (S.grid) { let s = 0; const n = S.grid.GW * S.grid.GH; for (let i = 0; i < n; i++) if (isSkyCell(i % S.grid.GW, (i / S.grid.GW) | 0)) s++; skyPct = Math.round(100 * s / n); }
  $('siFov').textContent = f ? `${f.width_deg.toFixed(0)}°×${f.height_deg.toFixed(0)}° · ${skyPct} %` : '—';
  $('siConsList').innerHTML = cons.length ? cons.map(x => `<span class="chip">${esc(x.name)}</span>`).join('') : 'Ninguna constelación queda sobre la zona de cielo.';
  if (!S.ann?.time) $('siBodyList').textContent = 'Indica la fecha y la hora de la foto para situarlos.';
  else $('siBodyList').innerHTML = st.bodies.length ? st.bodies.map(x => `<span class="chip${x.visible ? '' : ' off'}" title="${x.visible ? '' : 'Dentro del encuadre, pero tapado por el suelo'}">${esc(x.name)}${x.b.kind === 'moon' && x.b.phase != null ? ` · ${Math.round(x.b.phase * 100)} %` : ''}</span>`).join('') + (st.bodies.some(x => !x.visible) ? '<br><small class="subtle">Tachado: dentro del encuadre pero tapado por el suelo.</small>' : '') : 'No aparecen el Sol, la Luna ni planetas dentro del encuadre.';
 }

 /* ---------- eventos ---------- */
 $('siFile').addEventListener('change', e => loadFile(e.target.files[0]));
 const drop = $('siDrop');
 ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
 ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
 drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
 $('siGo').addEventListener('click', () => recognise(['original', 'balanced', 'stars']));
 $('siRetry').addEventListener('click', () => recognise(['balanced', 'stars']));
 document.querySelectorAll('[data-si-layer]').forEach(i => i.addEventListener('change', queueDraw));
 ['siDeclutter', 'siShowMask'].forEach(id => $(id).addEventListener('change', queueDraw));
 [['siAlpha', 'siAlphaOut'], ['siSize', 'siSizeOut'], ['siBrushSize', 'siBrushSizeOut']].forEach(([a, b]) => $(a).addEventListener('input', () => { $(b).textContent = `${$(a).value} %`; if (a !== 'siBrushSize') queueDraw(); }));
 document.querySelectorAll('[data-si-brush]').forEach(b => b.addEventListener('click', () => setBrush(b.dataset.siBrush)));
 $('siResetMask').addEventListener('click', () => { if (S.edit) { S.edit.fill(0); queueDraw(); status('Máscara automática restablecida.', 'ok'); } });
 const cv = $('siCanvas');
 cv.addEventListener('pointerdown', e => { if (S.brush === 'off' || !S.grid) return; e.preventDefault(); S.painting = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} paintAt(e); });
 cv.addEventListener('pointermove', e => { if (S.painting) paintAt(e); });
 ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { S.painting = false; }));
 $('siUsePlace').addEventListener('click', () => { const p = window.Sky?.place?.() || window.ASTRONOCHES_CONFIG; if (p) { $('siLat').value = Number(p.lat).toFixed(4); $('siLon').value = Number(p.lon).toFixed(4); $('siWhenSource').textContent = `Lugar: ${p.name}.`; } });
 $('siApplyWhen').addEventListener('click', async () => {
  if (!S.sol) return; $('siApplyWhen').disabled = true; status('Recalculando el Sol, la Luna y los planetas…', 'busy');
  try { await annotate(); draw(); status('Posiciones actualizadas para la fecha y el lugar indicados.', 'ok'); } catch (e) { status(e.message, 'err'); } finally { $('siApplyWhen').disabled = false; }
 });
 $('siZoom').addEventListener('click', () => { const st = $('siStage'); if (document.fullscreenElement) document.exitFullscreen(); else st.requestFullscreen?.().catch(() => {}); });
 $('siSave').addEventListener('click', () => {
  const was = $('siShowMask').checked; if (was) { $('siShowMask').checked = false; draw(); }
  cv.toBlob(b => { const a = document.createElement('a'), base = (S.file?.name || 'cielo').replace(/\.[^.]+$/, ''); a.href = URL.createObjectURL(b); a.download = `${base}-identificado.jpg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
   if (was) { $('siShowMask').checked = true; draw(); } }, 'image/jpeg', .93);
 });
 window.SkyId = { load: loadFile, state: () => S };
})();
