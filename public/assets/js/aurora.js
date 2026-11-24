/* AstroNoches · seguimiento de auroras: viento solar en L1, Kp actual y previsto, óvalo OVATION y umbral para la ubicación. */
(() => {
 const $ = id => document.getElementById('au' + id);
 const D = Math.PI / 180;
 const A = { data: null, hours: 6, map: null, layer: null, viewLine: null, marker: null, timer: 0, view: 'map' };
 const place = () => window.Sky?.place?.() || window.ASTRONOCHES_CONFIG;
 const tz = () => place().timezone || 'Europe/Madrid';
 const hm = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz() });
 const dayHm = t => new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz() });
 const n1 = v => Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '—';
 const last = (arr, k) => { for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i][k])) return arr[i]; return null; };
 const gScale = kp => kp >= 9 ? 'G5' : kp >= 8 ? 'G4' : kp >= 7 ? 'G3' : kp >= 6 ? 'G2' : kp >= 5 ? 'G1' : '';
 const kpColor = kp => kp >= 7 ? '#ff5d6c' : kp >= 5 ? '#ff9f5a' : kp >= 4 ? '#f1d36b' : '#5fd39a';

 /* Latitud geomagnética (dipolo IGRF-14, época 2025) y Kp necesario. Óvalo: borde ecuatorial ≈ 67° − 2·Kp (lat. magnética);
    una aurora a ~110 km de altura asoma en el horizonte norte hasta unos 5–6° de latitud magnética más al sur. */
 function magLat(lat, lon) { const pl = 80.8 * D, pn = -72.6 * D; return Math.asin(Math.sin(lat * D) * Math.sin(pl) + Math.cos(lat * D) * Math.cos(pl) * Math.cos(lon * D - pn)) / D; }
 const kpFor = mlat => (67 - mlat) / 2;
 function needs() {
  const p = place(), m = magLat(p.lat, p.lon);
  return { mlat: m, overhead: kpFor(m), horizon: kpFor(m + 5.5), high: kpFor(66.7) };
 }
 const kpInt = k => Math.min(9, Math.max(1, Math.ceil(k)));
 const kpTxt = k => k > 9 ? '9 (extremo) o más' : `≥ ${kpInt(k)}`;

 /* ---------- óvalo OVATION ---------- */
 function haversine(a, b, c, d) { const x = Math.sin((c - a) * D / 2) ** 2 + Math.cos(a * D) * Math.cos(c * D) * Math.sin((d - b) * D / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); }
 function ovationLocal() {
  const cells = A.data?.ovation?.cells || [], p = place(); let near = 0, view = 0, nearD = 1e9;
  for (const [lon, lat, v] of cells) {
   const d = haversine(p.lat, p.lon, lat, lon);
   if (d < nearD && d < 150) { nearD = d; near = v; }
   if (lat >= p.lat - 1 && d <= 1000) view = Math.max(view, v); // aurora a ~110 km visible hasta ~1000 km
  }
  return { near, view };
 }
 function ovColor(v) { return v >= 50 ? '#ff4d5e' : v >= 30 ? '#ff9a3d' : v >= 10 ? '#f3dd55' : '#3fe08f'; }
 function renderMap() {
  if (!window.L || !$('Map') || $('MapView').hidden) return;
  const p = place();
  if (!A.map) {
   A.map = L.map('auMap', { preferCanvas: true, worldCopyJump: true, scrollWheelZoom: false }).setView([Math.max(p.lat + 15, 55), p.lon], 3);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { referrerPolicy: 'strict-origin-when-cross-origin', attribution: '© OpenStreetMap · óvalo © NOAA SWPC', maxZoom: 8 }).addTo(A.map);
   A.layer = L.layerGroup().addTo(A.map);
   new ResizeObserver(() => A.map.invalidateSize()).observe($('Map'));
  }
  A.layer.clearLayers(); if (A.viewLine) { A.map.removeLayer(A.viewLine); A.viewLine = null; }
  const cells = A.data?.ovation?.cells || [], south = {};
  for (const [lon, lat, v] of cells) {
   if (v < 3) continue;
   A.layer.addLayer(L.rectangle([[lat - .5, lon - .5], [lat + .5, lon + .5]], { stroke: false, fillColor: ovColor(v), fillOpacity: Math.min(.75, .18 + v / 80), interactive: false }));
   if (v >= 10 && lat > 0 && (south[lon] === undefined || lat < south[lon])) south[lon] = lat;
  }
  // «Línea de visión»: hasta dónde, al sur del óvalo (≥10 %), podría verse en el horizonte norte (~8° de latitud).
  const line = Object.keys(south).map(Number).sort((a, b) => a - b).map(lon => [south[lon] - 8, lon]);
  if (line.length > 10) A.viewLine = L.polyline(line, { color: '#ff6b7a', weight: 2, dashArray: '6 6' }).addTo(A.map).bindTooltip('Límite aproximado de visibilidad en el horizonte norte');
  if (A.marker) A.marker.setLatLng([p.lat, p.lon]); else A.marker = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#e7c58d', fillOpacity: 1 }).addTo(A.map);
  A.marker.bindTooltip(`${p.name}`);
 }

 /* ---------- gráficas SVG ---------- */
 function lineChart(svgId, rows, key, opt) {
  const svg = $(svgId); if (!svg) return;
  const W = opt.w || 960, H = opt.h || 230, L = 52, R = 16, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
  const t1 = Date.now(), t0 = t1 - A.hours * 3600e3, data = rows.filter(r => r.t >= t0 && Number.isFinite(r[key]));
  let lo = opt.min, hi = opt.max; for (const r of data) { lo = Math.min(lo, r[key]); hi = Math.max(hi, r[key]); if (opt.key2 && Number.isFinite(r[opt.key2])) { lo = Math.min(lo, opt.sym ? -r[opt.key2] : lo); hi = Math.max(hi, r[opt.key2]); } }
  if (opt.sym) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
  const x = t => L + iw * (t - t0) / (t1 - t0), y = v => T + ih * (1 - (v - lo) / (hi - lo));
  let out = `<rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="#0b1626" rx="6"/>`;
  const step = A.hours <= 6 ? 3600e3 : 4 * 3600e3;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out += `<line x1="${x(t)}" y1="${T}" x2="${x(t)}" y2="${T + ih}" stroke="#3a5272" stroke-opacity=".6"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle" class="au-ax">${hm(t).slice(0, 2)}h</text>`;
  const ticks = opt.ticks(lo, hi);
  for (const v of ticks) out += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="#9db6d4" stroke-opacity="${v === 0 ? .7 : .15}" ${v === 0 ? '' : 'stroke-dasharray="4 5"'}/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="au-ax">${v > 0 && opt.sym ? '+' : ''}${v}</text>`;
  (opt.bands || []).forEach(([v, c, label]) => { if (v > lo && v < hi) out += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${c}" stroke-opacity=".7" stroke-dasharray="6 5"/><text x="${W - R - 4}" y="${y(v) - 4}" text-anchor="end" class="au-ax" fill="${c}">${label}</text>`; });
  if (opt.key2) { const d2 = data.filter(r => Number.isFinite(r[opt.key2])); if (d2.length > 1) out += `<path d="M${d2.map(r => `${x(r.t).toFixed(1)},${y(r[opt.key2]).toFixed(1)}`).join('L')}" fill="none" stroke="#aeb7c2" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="4 4"/>`; }
  if (data.length > 1) {
   if (opt.sign) { // tramos coloreados según el signo (Bz)
    for (let i = 1; i < data.length; i++) { const a = data[i - 1], b = data[i], c = (a[key] + b[key]) / 2 < 0 ? '#5fe0a0' : '#69baff'; if (b.t - a.t > 20 * 60e3) continue; out += `<line x1="${x(a.t).toFixed(1)}" y1="${y(a[key]).toFixed(1)}" x2="${x(b.t).toFixed(1)}" y2="${y(b[key]).toFixed(1)}" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`; }
   } else out += `<path d="M${data.map(r => `${x(r.t).toFixed(1)},${y(r[key]).toFixed(1)}`).join('L')}" fill="none" stroke="${opt.color}" stroke-width="2.4" stroke-linejoin="round"/>`;
   const e = data[data.length - 1]; out += `<circle cx="${x(e.t)}" cy="${y(e[key])}" r="6" fill="${opt.sign ? (e[key] < 0 ? '#5fe0a0' : '#69baff') : opt.color}" stroke="#fff" stroke-width="2"/>`;
  } else out += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="au-ax">Sin datos recientes</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = out;
 }
 function kpChart() {
  const svg = $('KpChart'), rows = A.data?.kp_forecast || []; if (!svg) return;
  const W = 960, H = 250, L = 40, R = 16, T = 14, B = 34, iw = W - L - R, ih = H - T - B, nd = needs();
  if (!rows.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="au-ax">Sin previsión Kp</text>`; return; }
  const t0 = Math.max(rows[0].t, Date.now() - 36 * 3600e3), t1 = rows[rows.length - 1].t + 3 * 3600e3, x = t => L + iw * (t - t0) / (t1 - t0), y = v => T + ih * (1 - v / 9);
  let out = `<rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="#0b1626" rx="6"/>`;
  try { const n = Sky.nightTimes(document.getElementById('nightDate').value); if (n.sunset < t1 && n.sunrise > t0) out += `<rect x="${x(Math.max(t0, n.sunset))}" y="${T}" width="${x(Math.min(t1, n.sunrise)) - x(Math.max(t0, n.sunset))}" height="${ih}" fill="#7c5cff" opacity=".13"/><text x="${x(Math.max(t0, n.sunset)) + 6}" y="${T + 14}" class="au-ax" fill="#c7b6ff">noche elegida</text>`; } catch (e) { }
  for (const v of [0, 3, 5, 7, 9]) out += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="#9db6d4" stroke-opacity=".15" stroke-dasharray="4 5"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="au-ax">${v}</text>`;
  const bw = iw * 3 * 3600e3 / (t1 - t0) - 3;
  for (const r of rows) { if (r.t + 3 * 3600e3 < t0) continue; const pred = r.type !== 'observed'; out += `<rect x="${(x(r.t) + 1.5).toFixed(1)}" y="${y(r.kp).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(r.kp)).toFixed(1)}" rx="3" fill="${kpColor(r.kp)}" opacity="${pred ? .55 : .95}"${pred ? ' stroke="#fff" stroke-opacity=".35" stroke-dasharray="3 3"' : ''}><title>${dayHm(r.t)} · Kp ${n1(r.kp)} · ${r.type === 'observed' ? 'observado' : r.type === 'estimated' ? 'estimado' : 'previsto'}${r.g ? ' · ' + r.g : ''}</title></rect>`; }
  const now = Date.now(); out += `<line x1="${x(now)}" y1="${T}" x2="${x(now)}" y2="${T + ih}" stroke="#e7c58d" stroke-width="1.5"/><text x="${x(now) + 4}" y="${T + ih - 6}" class="au-ax" fill="#e7c58d">ahora</text>`;
  const th = [[kpInt(nd.high), '#5fd39a', `Altas latitudes (~67° mag.) · Kp ${kpTxt(nd.high)}`], [kpInt(nd.horizon), '#ff6b7a', `${place().name}: horizonte norte · Kp ${kpTxt(nd.horizon)}`]];
  for (const [v, c, l] of th) out += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${c}" stroke-width="1.6" stroke-dasharray="7 5"/><text x="${W - R - 6}" y="${y(v) - 5}" text-anchor="end" class="au-ax" fill="${c}">${l}</text>`;
  for (let t = Math.ceil(t0 / 86400e3) * 86400e3; t < t1; t += 86400e3) out += `<text x="${x(t)}" y="${H - 10}" text-anchor="middle" class="au-ax">${new Date(t).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })} 00 UTC</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = out;
 }

 /* ---------- indicadores ---------- */

 /* ---------- aviso combinado, Dst, potencia hemisférica y alertas ---------- */
 const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
 function combined() {
  if (!$('ComboTable')) return;
  let night; try { night = Sky.nightTimes(document.getElementById('nightDate').value); } catch (e) { return; }
  const w = window.AstroApp?.weather?.(), h = w?.hourly, off = (w?.utc_offset_seconds || 0) * 1000, need = kpInt(needs().horizon);
  const cloudAt = t => { if (!h) return NaN; const i = h.time.findIndex(s => Date.parse(s + 'Z') - off === t); return i < 0 ? NaN : Number(h.cloud_cover[i]); };
  const kpAt = t => { const r = (A.data?.kp_forecast || []).find(r => t >= r.t && t < r.t + 3 * 3600e3); return r ? r.kp : NaN; };
  const hours = []; for (let t = Math.ceil(night.sunset.getTime() / 3600e3) * 3600e3; t <= night.sunrise.getTime(); t += 3600e3) hours.push(t);
  const rows = hours.map(t => {
   const d = new Date(t), sun = Sky.bodyHor('Sun', d).alt, moon = Sky.bodyHor('Moon', d).alt, frac = Astronomy.Illumination('Moon', d).phase_fraction, cl = cloudAt(t), kp = kpAt(t);
   const dark = sun <= -18 ? 'good' : sun <= -12 ? 'mixed' : 'poor', lun = moon <= 0 ? 'good' : frac < .4 || moon < 10 ? 'mixed' : 'poor';
   const sky = !Number.isFinite(cl) ? 'neutral' : cl < 25 ? 'good' : cl < 55 ? 'mixed' : 'poor', act = !Number.isFinite(kp) ? 'neutral' : kp >= need ? 'good' : kp >= need - 2 ? 'mixed' : 'poor';
   const skyOk = dark !== 'poor' && sky !== 'poor' && sky !== 'neutral', res = skyOk && act === 'good' && lun !== 'poor' ? 'good' : skyOk && lun !== 'poor' ? 'mixed' : 'poor';
   return { t, sun, moon, frac, cl, kp, dark, lun, sky, act, res };
  });
  const cell = (cls, txt, title) => `<td><span class="weather-matrix-cell wx-${cls}" title="${escH(title)}">${txt}</span></td>`;
  const head = `<thead><tr><th>Hora local</th>${rows.map(r => `<th><span class="weather-matrix-hour">${hm(r.t)}</span></th>`).join('')}</tr></thead>`;
  const spec = [
   ['Oscuridad', r => cell(r.dark, r.sun <= -18 ? 'Noche' : r.sun <= -12 ? 'Náutico' : r.sun <= -6 ? 'Civil' : 'Día', `Sol a ${n1(r.sun)}°`)],
   ['Luna', r => cell(r.lun, r.moon <= 0 ? 'Bajo hor.' : `${Math.round(r.frac * 100)}% · ${Math.round(r.moon)}°`, `Luna ${Math.round(r.frac * 100)} % iluminada a ${n1(r.moon)}° de altura`)],
   ['Nubes', r => cell(r.sky, Number.isFinite(r.cl) ? `${Math.round(r.cl)}%` : '—', 'Nubosidad total prevista')],
   ['Kp previsto', r => cell(r.act, Number.isFinite(r.kp) ? n1(r.kp) : '—', `Kp necesario aquí: ${need}`)],
   ['Resultado', r => cell(r.res, r.res === 'good' ? 'Posible' : r.res === 'mixed' ? 'Falta Kp' : 'No', r.res === 'mixed' ? 'Cielo apto, pero la actividad prevista no alcanza tu umbral' : '')]
  ];
  $('ComboTable').innerHTML = rows.length ? head + `<tbody>${spec.map(([n, f]) => `<tr><th>${n}</th>${rows.map(f).join('')}</tr>`).join('')}</tbody>` : '';
  const good = rows.filter(r => r.res === 'good'), apt = rows.filter(r => r.res !== 'poor');
  const lim = ['dark', 'lun', 'sky', 'act'].map(k => [k, rows.filter(r => r[k] === 'poor').length]).sort((a, b) => b[1] - a[1])[0];
  const why = { dark: 'la falta de oscuridad', lun: 'la luz de la Luna', sky: 'las nubes', act: `la actividad: haría falta Kp ${need} o más` }[lim?.[0]];
  $('ComboSummary').innerHTML = good.length ? `<b class="ok">Opciones reales</b> entre las ${hm(good[0].t)} y las ${hm(good[good.length - 1].t + 3600e3)}: oscuridad, cielo y actividad coinciden.`
   : apt.length ? `<b class="warn">El cielo acompaña</b> entre las ${hm(apt[0].t)} y las ${hm(apt[apt.length - 1].t + 3600e3)}, pero ${why || 'la actividad prevista no basta'}. Útil para vigilar o fotografiar el horizonte norte si sube el Kp.`
   : `<b class="bad">Noche poco favorable</b>: el principal límite es ${why || 'la combinación de factores'}.`;
  if (!h) $('ComboSummary').innerHTML += ' <span class="subtle">(Esperando la previsión de nubes…)</span>';
 }
 function dstLabel(v) { return v > -30 ? 'Tranquilo' : v > -50 ? 'Tormenta débil' : v > -100 ? 'Tormenta moderada' : v > -200 ? 'Tormenta intensa' : 'Tormenta extrema'; }
 function extras() {
  const d = A.data; if (!d) return;
  const dst = d.dst?.at(-1), hp = d.hp?.at(-1);
  $('Storm').innerHTML = [
   tile('Dst · Kyoto (horario)', dst ? `${dst.dst > 0 ? '+' : ''}${Math.round(dst.dst)} nT` : '—', dst ? `${dstLabel(dst.dst)} · ${hm(dst.t)} · cuanto más negativo, más intensa la tormenta` : '', dst ? (dst.dst <= -100 ? 'hot' : dst.dst <= -50 ? 'kp5' : dst.dst <= -30 ? 'kp4' : '') : ''),
   tile('Potencia hemisférica · norte', hp ? `${hp.north} GW` : '—', hp ? `${hp.north >= 100 ? 'Muy alta' : hp.north >= 50 ? 'Alta · aurora activa' : hp.north >= 20 ? 'Moderada' : 'Baja'} · previsión OVATION para las ${hm(hp.f)} · sur ${hp.south} GW` : '', hp ? (hp.north >= 100 ? 'hot' : hp.north >= 50 ? 'good' : '') : '')
  ].join('');
  const span = A.hours; A.hours = 48;
  lineChart('DstChart', d.dst || [], 'dst', { w: 520, h: 230, min: -60, max: 30, color: '#ff8a7a', bands: [[-50, '#ff9f5a', '−50 moderada'], [-100, '#ff5d6c', '−100 intensa']], ticks: (lo, hi) => { const s = hi - lo > 150 ? 50 : 25, o = []; for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) o.push(v); return o; } });
  A.hours = 24;
  lineChart('HpChart', d.hp || [], 'north', { w: 520, h: 230, min: 0, max: 60, color: '#72e4bb', bands: [[50, '#f1d36b', '50 GW'], [100, '#ff6b7a', '100 GW']], ticks: (lo, hi) => { const s = hi > 150 ? 50 : 20, o = []; for (let v = 0; v <= hi; v += s) o.push(v); return o; } });
  A.hours = span;
  const kindOf = t => /^ALERT/i.test(t) ? 'alert' : /WARNING/i.test(t) ? 'warning' : /^WATCH/i.test(t) ? 'watch' : 'summary';
  const list = (d.alerts || []).slice().sort((a, b) => b.t - a.t);
  $('Alerts').innerHTML = list.length ? list.slice(0, 12).map(a => `<details class="au-alert ${kindOf(a.title)}"><summary><time>${dayHm(a.t)}</time><b>${escH(a.title)}</b><em>${escH(a.id)}</em></summary><div>${a.body.map(escH).join('<br>')}</div></details>`).join('')
   : '<div class="au-alert none">Sin alertas, avisos ni vigilancias de NOAA en las últimas 72 h.</div>';
  combined();
 }
 function tile(label, value, sub, cls = '') { return `<div class="au-tile ${cls}"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`; }
 function render() {
  const d = A.data; if (!d) return;
  const nd = needs(), mag = last(d.mag, 'bz'), wind = last(d.wind, 'speed'), dens = last(d.wind, 'density'), ov = ovationLocal();
  const b30 = d.mag.filter(r => r.t >= Date.now() - 30 * 60e3 && Number.isFinite(r.bz)), bzAvg = b30.length ? b30.reduce((a, r) => a + r.bz, 0) / b30.length : NaN;
  let night = null; try { night = Sky.nightTimes(document.getElementById('nightDate').value); } catch (e) { }
  const inNight = night ? d.kp_forecast.filter(r => r.t + 3 * 3600e3 > night.sunset && r.t < night.sunrise) : [];
  const peak = inNight.reduce((a, r) => !a || r.kp > a.kp ? r : a, null);
  const g = d.scales?.['0']?.G?.Scale, g1 = d.scales?.['1']?.G?.Scale;
  const eta = wind ? Math.round(1.5e6 / wind.speed / 60) : null;
  $('Tiles').innerHTML = [
   tile('Kp ahora · estimado', d.kp_now ? n1(d.kp_now.kp) : '—', `${d.kp_now ? 'Actualizado ' + hm(d.kp_now.t) : ''}${g && g !== '0' ? ' · tormenta G' + g : ' · sin tormenta'}`, d.kp_now ? 'kp' + Math.min(9, Math.floor(d.kp_now.kp)) : ''),
   tile('Kp máx. previsto · noche elegida', peak ? n1(peak.kp) : '—', peak ? `hacia las ${hm(peak.t)}–${hm(peak.t + 3 * 3600e3)}${gScale(peak.kp) ? ' · ' + gScale(peak.kp) : ''}` : 'La previsión NOAA no cubre esa noche', peak ? 'kp' + Math.min(9, Math.floor(peak.kp)) : ''),
   tile('Bz ahora · GSM', mag ? `${mag.bz > 0 ? '+' : ''}${n1(mag.bz)} nT` : '—', mag ? `${mag.bz < 0 ? 'Sur · favorece' : 'Norte · dificulta'} · media 30 min ${n1(bzAvg)} nT · Bt ${n1(mag.bt)} nT` : '', mag ? (mag.bz <= -10 ? 'hot' : mag.bz < 0 ? 'good' : 'cool') : ''),
   tile('Viento solar · velocidad', wind ? `${Math.round(wind.speed)} km/s` : '—', wind ? `${wind.speed >= 600 ? 'Rápido' : wind.speed >= 450 ? 'Moderado' : 'Lento'} · llega a la Tierra en ~${eta} min` : '', wind ? (wind.speed >= 600 ? 'hot' : wind.speed >= 450 ? 'good' : '') : ''),
   tile('Viento solar · densidad', dens ? `${n1(dens.density)} p/cm³` : '—', dens ? (dens.density >= 15 ? 'Alta · aumenta la presión' : dens.density >= 6 ? 'Normal-alta' : 'Baja') : '', dens && dens.density >= 15 ? 'good' : ''),
   tile('OVATION · tu zona', `${ov.near}%`, `Celda más cercana · máx. visible hacia el norte (≤1000 km): ${ov.view}%${d.ovation ? ' · previsión ' + hm(d.ovation.forecast) : ''}`, ov.view >= 10 ? 'good' : '')
  ].join('');
  $('Need').innerHTML = `<div><span>Latitud geomagnética de ${place().name}</span><b>${n1(nd.mlat)}°</b></div><div><span>Aurora en el horizonte norte</span><b>Kp ${kpTxt(nd.horizon)}${gScale(Math.min(9, nd.horizon)) ? ' · ' + gScale(Math.min(9, nd.horizon)) : ''}</b></div><div><span>Aurora sobre tu cabeza</span><b>Kp ${kpTxt(nd.overhead)}</b></div><div><span>Altas latitudes (Tromsø, Islandia)</span><b>Kp ${kpTxt(nd.high)}</b></div><div><span>Mañana · escala G prevista</span><b>${g1 && g1 !== '0' ? 'G' + g1 : 'Sin tormenta'}</b></div>`;
  const best = Math.max(d.kp_now?.kp || 0, peak?.kp || 0);
  const verdict = ov.view >= 10 || best >= nd.horizon ? ['Posible en el horizonte norte', 'good'] : best >= nd.horizon - 2 || (mag && bzAvg <= -10) ? ['Actividad alta · vigilar', 'fair'] : [`Poco probable desde ${place().name}`, 'bad'];
  $('Verdict').textContent = verdict[0]; $('Verdict').className = 'cloud-verdict ' + verdict[1];
  $('Peak').innerHTML = peak ? `Pico previsto para la noche elegida: <b>Kp ${n1(peak.kp)}</b> entre las <b>${hm(peak.t)} y las ${hm(peak.t + 3 * 3600e3)}</b>. En ${place().name} haría falta Kp ${kpTxt(nd.horizon)} para verla baja sobre el horizonte norte; las fotos de larga exposición captan más que el ojo.` : 'La previsión de Kp de NOAA llega a unos 3 días; la noche elegida queda fuera.';
  lineChart('BzChart', d.mag, 'bz', { min: -10, max: 10, sym: true, sign: true, key2: 'bt', ticks: (lo, hi) => { const s = hi > 20 ? 10 : 5, o = []; for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) o.push(v); return o; } });
  lineChart('SpeedChart', d.wind, 'speed', { min: 300, max: 600, color: '#ffb86b', w: 520, h: 230, bands: [[500, '#f1d36b', '500 km/s'], [700, '#ff6b7a', '700 km/s']], ticks: (lo, hi) => { const o = []; for (let v = Math.ceil(lo / 100) * 100; v <= hi; v += 100) o.push(v); return o; } });
  lineChart('DensityChart', d.wind, 'density', { min: 0, max: 10, color: '#c59bff', w: 520, h: 230, bands: [[20, '#ff6b7a', '20 p/cm³']], ticks: (lo, hi) => { const s = hi > 30 ? 10 : 5, o = []; for (let v = 0; v <= hi; v += s) o.push(v); return o; } });
  kpChart(); renderMap(); extras();
  $('Updated').textContent = `Datos NOAA SWPC · viento solar medido en L1 (promedios de 5 min) · consultado ${hm(d.generated)}`;
 }
 async function load() {
  $('Refresh').disabled = true;
  try { const r = await fetch('api/spaceweather.php'); const d = await r.json(); if (!r.ok || !d.ok) throw Error(); A.data = d; render(); }
  catch (e) { $('Updated').textContent = 'No se pudo consultar NOAA SWPC. Pulsa ↻ para reintentar.'; }
  $('Refresh').disabled = false;
 }
 function init() {
  if (!$('Module')) return;
  $('Refresh').addEventListener('click', load);
  document.querySelectorAll('[data-au-hours]').forEach(b => b.addEventListener('click', () => { A.hours = Number(b.dataset.auHours); document.querySelectorAll('[data-au-hours]').forEach(x => x.classList.toggle('active', x === b)); render(); }));
  document.querySelectorAll('[data-au-view]').forEach(b => b.addEventListener('click', () => { const map = b.dataset.auView === 'map'; $('MapView').hidden = !map; $('ImageView').hidden = map; document.querySelectorAll('[data-au-view]').forEach(x => x.classList.toggle('active', x === b)); if (map) { renderMap(); setTimeout(() => A.map?.invalidateSize(), 50); } else $('Image').src = `https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg?t=${Math.floor(Date.now() / 300e3)}`; }));
  $('Fold').addEventListener('click', () => { const f = $('Module').classList.toggle('folded'); $('Fold').textContent = f ? '+ Desplegar' : '− Plegar'; if (!f) setTimeout(() => A.map?.invalidateSize(), 50); });
  A.timer = setInterval(() => { if (!document.hidden) load(); }, 5 * 60e3);
  const wait = () => window.Sky?.place?.() ? load() : setTimeout(wait, 200); wait();
 }
 window.Aurora = { render: () => render(), load };
 document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
