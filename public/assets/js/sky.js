/* AstroNoches · cielo sincronizado: deslizador de la noche, cúpula cenital y panorámica 360°.
   Posiciones con Astronomy Engine (navegador); estrellas reales del catálogo Yale BSC (mag ≤ 5). */
(() => {
 const A = window.Astronomy, D = Math.PI / 180;
 const $ = id => document.getElementById(id);
 const BODIES = [
  ['Sun', 'Sol', '#ffd166'], ['Moon', 'Luna', '#f2efe6'], ['Mercury', 'Mercurio', '#d8c7b3'],
  ['Venus', 'Venus', '#fff1c4'], ['Mars', 'Marte', '#ff9466'], ['Jupiter', 'Júpiter', '#f3d9a8'], ['Saturn', 'Saturno', '#e9d79f']
 ];
 const SLIDER_MAX = 1000;
 const S = { cfg: null, obs: null, dateStr: null, night: null, t: null, sky: null, deep: [], play: null, raf: 0,
  layers: { lines: true, names: true, milky: true }, onTime: null, onNight: null };

 /* ---------- utilidades ---------- */
 const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
 const norm = a => ((a % 360) + 360) % 360;
 const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
 const tz = () => S.cfg.timezone || 'Europe/Madrid';
 const fmtTime = d => d ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz() }) : '—';
 const fmtDay = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz() });
 function localYMD(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
 }
 function nightDateFor(d) { const l = localYMD(d); if (l.hour >= 12) return l.ymd; return localYMD(new Date(d.getTime() - 86400000)).ymd; }

 /* J2000 ecuatorial → horizontal para un instante (matriz única por fotograma). */
 function frame(date) {
  const r = A.Rotation_EQJ_HOR(date, S.obs).rot;
  return (raDeg, decDeg, refract = true) => {
   const a = raDeg * D, d = decDeg * D, cd = Math.cos(d), x = cd * Math.cos(a), y = cd * Math.sin(a), z = Math.sin(d);
   const hx = r[0][0] * x + r[1][0] * y + r[2][0] * z, hy = r[0][1] * x + r[1][1] * y + r[2][1] * z, hz = r[0][2] * x + r[1][2] * y + r[2][2] * z;
   let alt = Math.asin(clamp(hz, -1, 1)) / D;
   if (refract && alt > -1) alt += A.Refraction('normal', alt);
   return { alt, az: norm(Math.atan2(-hy, hx) / D) };
  };
 }
 function gal2eq(l, b) {
  const lr = l * D, br = b * D, x = Math.cos(br) * Math.cos(lr), y = Math.cos(br) * Math.sin(lr), z = Math.sin(br);
  const T = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.44482963, 0.7469822445], [-0.867666149, -0.1980763734, 0.4559837762]];
  const ex = T[0][0] * x + T[1][0] * y + T[2][0] * z, ey = T[0][1] * x + T[1][1] * y + T[2][1] * z, ez = T[0][2] * x + T[1][2] * y + T[2][2] * z;
  return { ra: norm(Math.atan2(ey, ex) / D), dec: Math.asin(ez) / D };
 }
 function ecl2eq(lon) { const e = 23.4393 * D, l = lon * D; return { ra: norm(Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) / D), dec: Math.asin(Math.sin(e) * Math.sin(l)) / D }; }
 function bodyHor(key, date) { const eq = A.Equator(key, date, S.obs, true, true), h = A.Horizon(date, S.obs, eq.ra, eq.dec, 'normal'); return { alt: h.altitude, az: h.azimuth }; }

 /* ---------- noche seleccionada ---------- */
 function computeNight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12) - (S.cfg.lon / 15) * 3600e3);
  const find = (dir, from, alt) => { try { const r = alt === 0 ? A.SearchRiseSet('Sun', S.obs, dir, from, 1.2) : A.SearchAltitude('Sun', S.obs, dir, from, 1.2, alt); return r ? r.date : null; } catch (e) { return null; } };
  const sunset = find(-1, noon, 0), sunrise = sunset ? find(+1, sunset, 0) : null;
  const tw = {};
  [['civil', -6], ['nautical', -12], ['astronomical', -18]].forEach(([k, a]) => { const ev = find(-1, noon, a); tw[k] = { evening: ev, morning: ev ? find(+1, ev, a) : null }; });
  const start = sunset || noon, end = sunrise && sunrise > start ? sunrise : new Date(noon.getTime() + 86400e3);
  // Recorridos del Sol y la Luna durante 24 h (mediodía a mediodía), cada 15 min.
  const paths = { sun: [], moon: [] };
  for (let i = 0; i <= 96; i++) { const t = new Date(noon.getTime() + i * 900e3); paths.sun.push(bodyHor('Sun', t)); paths.moon.push(bodyHor('Moon', t)); }
  return { dateStr, noon, start, end, sunset, sunrise, tw, paths };
 }
 function sunPhase(alt) {
  if (alt > 0) return { key: 'day', label: 'Sol sobre el horizonte', top: '#2f5f92', bottom: '#9cc1e2', lim: 0 };
  if (alt > -6) return { key: 'civil', label: 'Crepúsculo civil', top: '#17305a', bottom: '#4a6a96', lim: 1.6 };
  if (alt > -12) return { key: 'nautical', label: 'Crepúsculo náutico', top: '#0f1f3a', bottom: '#34507a', lim: 3.2 };
  if (alt > -18) return { key: 'astro', label: 'Crepúsculo astronómico', top: '#0a1529', bottom: '#1b2e4d', lim: 4.4 };
  return { key: 'night', label: 'Noche astronómica', top: '#050b17', bottom: '#12223a', lim: 5.0 };
 }
 const phaseColor = alt => alt > 0 ? '#6c97c4' : alt > -6 ? '#3c5f8c' : alt > -12 ? '#263f66' : alt > -18 ? '#182b4a' : '#0b1527';

 /* ---------- estado del instante ---------- */
 function snapshot(t) {
  const hor = frame(t), bodies = BODIES.map(([key, name, color]) => {
   const h = bodyHor(key, t), o = { key, name, color, ...h };
   if (key !== 'Sun') { try { o.mag = A.Illumination(key, t).mag; } catch (e) { } }
   return o;
  });
  const sun = bodies[0], moon = bodies[1], ill = A.Illumination('Moon', t), phase = sunPhase(sun.alt);
  const nightF = clamp((-sun.alt - 6) / 12, 0, 1);
  const moonLight = moon.alt > 0 ? Math.pow(ill.phase_fraction, 1.5) * Math.sin(moon.alt * D) : 0;
  const lim = Math.max(phase.lim - 1.6 * moonLight, phase.key === 'day' ? 0 : 1.2);
  return { t, hor, bodies, sun, moon, moonFrac: ill.phase_fraction, moonWax: A.MoonPhase(t) < 180, phase, nightF, moonLight, lim, milky: nightF * (1 - .8 * moonLight) };
 }

 /* ---------- primitivas de dibujo ---------- */
 const pts = arr => arr.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
 function interpAz(a, b, f) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return norm(a + d * f); }
 // Polilínea sobre el horizonte: recorta bajo 0° e interrumpe saltos de borde (panorámica).
 function polyline(list, proj, wrapW) {
  const segs = []; let cur = [], prev = null;
  for (const p of list) {
   if (prev && (prev.alt >= 0) !== (p.alt >= 0)) {
    const f = prev.alt / (prev.alt - p.alt), q = { alt: 0, az: interpAz(prev.az, p.az, f) }, xy = proj(q);
    if (prev.alt >= 0) { if (!wrapW || !cur.length || Math.abs(xy[0] - cur[cur.length - 1][0]) < wrapW / 2) cur.push(xy); segs.push(cur); cur = []; }
    else cur = [xy];
   }
   if (p.alt >= 0) { const xy = proj(p); if (wrapW && cur.length && Math.abs(xy[0] - cur[cur.length - 1][0]) > wrapW / 2) { segs.push(cur); cur = []; } cur.push(xy); }
   prev = p;
  }
  if (cur.length) segs.push(cur);
  return segs.filter(s => s.length > 1).map(s => 'M' + pts(s)).join('');
 }
 function starColor(bv) { return bv < 0 ? '#bcd2ff' : bv < .3 ? '#e2eaff' : bv < .6 ? '#fff8ec' : bv < 1 ? '#ffe6c0' : '#ffc79c'; }
 function moonShape(x, y, r, frac, angleDeg, id) {
  const k = clamp(frac, 0, 1), rx = Math.abs(1 - 2 * k) * r, sweep = k < .5 ? 0 : 1;
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="${(r * 3.2).toFixed(1)}" fill="url(#${id}Aura)" opacity="${(.25 + .6 * k).toFixed(2)}"/><circle r="${r}" fill="#2a3346" stroke="#8d99ad" stroke-opacity=".35"/>` +
   `<path transform="rotate(${angleDeg.toFixed(1)})" d="M0,${-r}A${r},${r} 0 0 1 0,${r}A${rx.toFixed(2)},${r} 0 0 ${sweep} 0,${-r}Z" fill="#f4efe1"/></g>`;
 }
 // Ángulo de posición del Sol visto desde la Luna (desde el cénit local hacia azimut creciente).
 function bearingToSun(snap) {
  const m = snap.moon, s = snap.sun, dz = (s.az - m.az) * D;
  return Math.atan2(Math.sin(dz) * Math.cos(s.alt * D), Math.cos(m.alt * D) * Math.sin(s.alt * D) - Math.sin(m.alt * D) * Math.cos(s.alt * D) * Math.cos(dz));
 }
 function gradDefs(id, snap) {
  return `<linearGradient id="${id}Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${snap.phase.top}"/><stop offset="1" stop-color="${snap.phase.bottom}"/></linearGradient>` +
   `<radialGradient id="${id}Aura"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".25" stop-color="#e8f1fa" stop-opacity=".28"/><stop offset="1" stop-color="#bad6f6" stop-opacity="0"/></radialGradient>` +
   `<radialGradient id="${id}Sun"><stop offset="0" stop-color="#fff6d5"/><stop offset=".35" stop-color="#ffd166" stop-opacity=".6"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>` +
   `<radialGradient id="${id}Core"><stop offset="0" stop-color="#fff4d6" stop-opacity=".55"/><stop offset=".3" stop-color="#f0d6a4" stop-opacity=".25"/><stop offset="1" stop-color="#a9bdff" stop-opacity="0"/></radialGradient>` +
   `<filter id="${id}Blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>`;
 }

 /* Capas comunes: Vía Láctea, eclíptica, recorridos, constelaciones, estrellas, objetos y cuerpos. */
 function skyLayers(snap, proj, id, scale, wrapW) {
  let out = '';
  const hor = snap.hor;
  if (S.layers.milky && snap.milky > .03) {
   for (let l = 0; l < 360; l += 5) {
    const bulge = .35 + .65 * Math.exp(-Math.pow(Math.min(l, 360 - l) / 42, 2));
    for (const b of [-8, -3, 2, 7]) {
     const eq = gal2eq(l, b), p = hor(eq.ra, eq.dec, false); if (p.alt < 0) continue;
     const [x, y] = proj(p), band = Math.exp(-b * b / 80), fade = clamp(p.alt / 12, 0, 1);
     out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${((7 + 7 * band + 4 * bulge) * scale).toFixed(1)}" fill="#a9bdff" opacity="${(.14 * bulge * band * fade * snap.milky).toFixed(3)}" filter="url(#${id}Blur)"/>`;
    }
   }
   const c = gal2eq(0, 0), pc = hor(c.ra, c.dec, false);
   if (pc.alt > 0) { const [x, y] = proj(pc); out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(60 * scale).toFixed(1)}" fill="url(#${id}Core)" opacity="${(.8 * snap.milky).toFixed(2)}"/>`; }
  }
  const ecl = []; for (let l = 0; l <= 360; l += 4) { const e = ecl2eq(l); ecl.push(hor(e.ra, e.dec)); }
  out += `<path d="${polyline(ecl, proj, wrapW)}" fill="none" stroke="#aeb7c2" stroke-opacity=".55" stroke-width="1.1" stroke-dasharray="5 6"/>`;
  out += `<path d="${polyline(S.night.paths.sun, proj, wrapW)}" fill="none" stroke="#ffd166" stroke-opacity=".7" stroke-width="1.3" stroke-dasharray="3 5"/>`;
  out += `<path d="${polyline(S.night.paths.moon, proj, wrapW)}" fill="none" stroke="#9bdcf9" stroke-opacity=".7" stroke-width="1.3" stroke-dasharray="3 5"/>`;
  const visibleLines = snap.lim >= 2;
  if (S.layers.lines && visibleLines) {
   let d = '';
   for (const segs of Object.values(S.sky.lines)) for (const seg of segs) d += polyline(seg.map(p => hor(p[0], p[1])), proj, wrapW);
   out += `<path d="${d}" fill="none" stroke="#7fa6d6" stroke-opacity="${(.22 + .25 * snap.nightF).toFixed(2)}" stroke-width=".9"/>`;
  }
  if (S.layers.names && visibleLines) {
   for (const c of S.sky.constellations) {
    if (c.rank > 2) continue; const p = hor(c.ra, c.dec); if (p.alt < 6) continue; const [x, y] = proj(p);
    out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="sky-cname" text-anchor="middle">${esc(c.name.toUpperCase())}</text>`;
   }
  }
  for (const s of S.sky.stars) {
   const mag = s[2]; if (mag > snap.lim) break;
   const p = hor(s[0], s[1]); if (p.alt < 0) continue;
   const [x, y] = proj(p), r = Math.max(.45, (2.7 - .45 * mag)) * scale, op = clamp(.35 + (snap.lim - mag) * .25, .25, 1) * clamp(.4 + p.alt / 15, .4, 1);
   out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${starColor(s[3])}" opacity="${op.toFixed(2)}">${s[4] ? `<title>${esc(s[4])} · mag ${mag} · ${p.alt.toFixed(1)}°</title>` : ''}</circle>`;
   if (s[4] && S.layers.names && mag < 1.6 && p.alt > 3) out += `<text x="${(x + 5).toFixed(1)}" y="${(y - 4).toFixed(1)}" class="sky-sname">${esc(s[4])}</text>`;
  }
  if (snap.lim >= 2) for (const o of S.deep) {
   const p = hor(Number(o.ra_deg), Number(o.dec_deg)); if (p.alt < 0) continue; const [x, y] = proj(p);
   out += `<g class="sky-deep"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(5 * scale).toFixed(1)}" fill="none" stroke="#71c6ff" stroke-width="1.2" stroke-dasharray="2 2"/><text x="${(x + 7).toFixed(1)}" y="${(y + 3).toFixed(1)}">${esc(o.catalog + o.catalog_id)}</text><title>${esc((o.common_name || '') + ' · ' + o.catalog + o.catalog_id + ' · ' + p.alt.toFixed(1) + '°')}</title></g>`;
  }
  return out;
 }
 function bodyLayer(snap, proj, id, scale, moonAngle) {
  let out = '';
  for (const b of snap.bodies) {
   if (b.alt < 0) continue; const [x, y] = proj(b), tip = `<title>${b.name} · alt ${b.alt.toFixed(1)}° · az ${b.az.toFixed(0)}°${b.mag != null ? ' · mag ' + b.mag.toFixed(1) : ''}</title>`;
   if (b.key === 'Sun') out += `<g><circle cx="${x}" cy="${y}" r="${26 * scale}" fill="url(#${id}Sun)"/><circle cx="${x}" cy="${y}" r="${7 * scale}" fill="#ffe08a">${tip}</circle></g>`;
   else if (b.key === 'Moon') out += `<g>${moonShape(x, y, 8 * scale, snap.moonFrac, moonAngle(b), id)}<text x="${(x + 12 * scale).toFixed(1)}" y="${(y - 9 * scale).toFixed(1)}" class="sky-bname">Luna ${Math.round(snap.moonFrac * 100)}%</text><circle cx="${x}" cy="${y}" r="${9 * scale}" fill="transparent">${tip}</circle></g>`;
   else out += `<g><circle cx="${x}" cy="${y}" r="${7 * scale}" fill="${b.color}" opacity=".18"/><circle cx="${x}" cy="${y}" r="${3.2 * scale}" fill="${b.color}">${tip}</circle><text x="${(x + 7).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="sky-bname">${b.name}</text></g>`;
  }
  return out;
 }

 /* ---------- cúpula cenital (N arriba, E a la izquierda) ---------- */
 function renderDome(snap) {
  const svg = $('skyChart'); if (!svg) return;
  const cx = 300, cy = 210, R = 192;
  const proj = p => { const r = R * (90 - clamp(p.alt, -2, 90)) / 90, a = p.az * D; return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };
  let out = `<defs>${gradDefs('dm', snap)}<radialGradient id="dmBg"><stop offset="0" stop-color="${snap.phase.top}"/><stop offset=".55" stop-color="${snap.phase.top}"/><stop offset="1" stop-color="${snap.phase.bottom}"/></radialGradient><radialGradient id="dmGlow" gradientUnits="userSpaceOnUse" cx="${cx - R * Math.sin(snap.sun.az * D)}" cy="${cy - R * Math.cos(snap.sun.az * D)}" r="${R * 1.1}"><stop offset="0" stop-color="#ff9e6b" stop-opacity="${(.6 * clamp((snap.sun.alt + 18) / 18, 0, 1)).toFixed(2)}"/><stop offset="1" stop-color="#ff9e6b" stop-opacity="0"/></radialGradient><clipPath id="dmClip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#dmBg)" stroke="#3e5a80" stroke-width="1.5"/><g clip-path="url(#dmClip)"><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#dmGlow)"/>`;
  const min = Number($('minAltitude')?.value || 30);
  [30, 60].forEach(a => out += `<circle cx="${cx}" cy="${cy}" r="${R * (90 - a) / 90}" fill="none" stroke="#9db6d4" stroke-opacity=".18" stroke-dasharray="3 5"/>`);
  out += `<circle cx="${cx}" cy="${cy}" r="${R * (90 - min) / 90}" fill="none" stroke="#c4585d" stroke-opacity=".6" stroke-dasharray="4 4"/>`;
  for (let a = 0; a < 360; a += 30) { const p1 = proj({ alt: 0, az: a }); out += `<line x1="${cx}" y1="${cy}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="#9db6d4" stroke-opacity=".08"/>`; }
  out += skyLayers(snap, proj, 'dm', .9, 0) + `</g>`;
  out += bodyLayer(snap, proj, 'dm', .9, m => {
   const b = bearingToSun(snap), a = m.az * D, vx = Math.sin(b) * -Math.cos(a) + Math.cos(b) * Math.sin(a), vy = Math.sin(b) * Math.sin(a) + Math.cos(b) * Math.cos(a);
   return Math.atan2(vy, vx) / D;
  });
  [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]].forEach(([l, az]) => {
   const r = R + 11, x = cx - r * Math.sin(az * D), y = cy - r * Math.cos(az * D) + 4;
   out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" class="sky-card${l.length === 1 ? ' main' : ''}">${l}</text>`;
  });
  out += `<text x="${cx + 4}" y="${cy - R * (90 - min) / 90 + 12}" class="sky-min">${min}°</text>`;
  svg.innerHTML = out;
 }

 /* ---------- panorámica 360° (sur en el centro) ---------- */
 function renderPanorama(snap) {
  const svg = $('panorama'); if (!svg) return;
  const W = 960, H = 400, L = 14, Rm = 14, T = 16, B = 58, iw = W - L - Rm, ih = H - T - B, y0 = T + ih;
  const xOf = az => { let s = norm(az - 180); if (s > 180) s -= 360; return L + iw * (s + 180) / 360; };
  const proj = p => [xOf(p.az), T + ih * (1 - clamp(p.alt, -2, 90) / 90)];
  let out = `<defs>${gradDefs('pn', snap)}<clipPath id="pnClip"><rect x="${L}" y="${T - 10}" width="${iw}" height="${ih + 10}"/></clipPath>`;
  const glow = clamp((snap.sun.alt + 18) / 18, 0, 1);
  out += `<radialGradient id="pnGlow" gradientUnits="userSpaceOnUse" cx="${xOf(snap.sun.az)}" cy="${y0}" r="${260}"><stop offset="0" stop-color="#ff9e6b" stop-opacity="${(.7 * glow).toFixed(2)}"/><stop offset="1" stop-color="#ff9e6b" stop-opacity="0"/></radialGradient></defs>`;
  out += `<rect x="${L}" y="${T}" width="${iw}" height="${ih}" rx="8" fill="url(#pnSky)"/><rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="url(#pnGlow)"/>`;
  if (snap.moonLight > 0) out += `<rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="#9fb9d8" opacity="${(snap.moonLight * snap.nightF * .16).toFixed(3)}"/>`;
  const min = Number($('minAltitude')?.value || 30);
  for (const alt of [30, 60]) { const y = T + ih * (1 - alt / 90); out += `<line x1="${L}" y1="${y}" x2="${W - Rm}" y2="${y}" stroke="#fff" stroke-opacity=".14" stroke-dasharray="4 6"/><text x="${L + 6}" y="${y - 4}" class="pano-alt">${alt}°</text>`; }
  { const y = T + ih * (1 - min / 90); out += `<line x1="${L}" y1="${y}" x2="${W - Rm}" y2="${y}" stroke="#c4585d" stroke-opacity=".75" stroke-width="1.2" stroke-dasharray="4 4"/><text x="${W - Rm - 6}" y="${y - 4}" text-anchor="end" class="pano-alt min">altura mínima ${min}°</text>`; }
  out += `<g clip-path="url(#pnClip)">${skyLayers(snap, proj, 'pn', 1, iw)}`;
  out += bodyLayer(snap, proj, 'pn', 1, () => { const b = bearingToSun(snap); return Math.atan2(-Math.cos(b), Math.sin(b)) / D; });
  out += `</g>`;
  // Suelo, horizonte y rumbos
  out += `<rect x="${L}" y="${y0}" width="${iw}" height="${H - y0 - 6}" rx="6" fill="#08111e"/><line x1="${L}" y1="${y0}" x2="${W - Rm}" y2="${y0}" stroke="#dfe8f1" stroke-opacity=".85" stroke-width="1.4"/>`;
  for (let az = 0; az < 360; az += 15) { const x = xOf(az), major = az % 45 === 0; out += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + (major ? 8 : 4)}" stroke="#7890a4" stroke-width="1.1"/>`; }
  [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]].forEach(([l, az]) => {
   const x = clamp(xOf(az), L + 12, W - Rm - 12);
   out += `<text x="${x}" y="${y0 + 26}" text-anchor="middle" class="pano-card${l.length === 1 ? ' main' : ''}">${l}</text><text x="${x}" y="${y0 + 41}" text-anchor="middle" class="pano-deg">${az}°</text>`;
  });
  svg.innerHTML = out;
 }

 /* ---------- deslizador ---------- */
 const tToVal = t => Math.round(SLIDER_MAX * (t - S.night.start) / (S.night.end - S.night.start));
 const valToT = v => new Date(S.night.start.getTime() + (S.night.end - S.night.start) * v / SLIDER_MAX);
 function paintTrack() {
  const n = S.night, stops = [];
  for (let i = 0; i <= 60; i++) { const t = new Date(n.start.getTime() + (n.end - n.start) * i / 60); stops.push(`${phaseColor(bodyHor('Sun', t).alt)} ${(i / 60 * 100).toFixed(1)}%`); }
  $('timeSlider').style.setProperty('--track', `linear-gradient(90deg,${stops.join(',')})`);
  const ticks = [], span = n.end - n.start, first = new Date(Math.ceil(n.start.getTime() / 3600e3) * 3600e3);
  const step = span > 14 * 3600e3 ? 2 : 1;
  for (let t = first; t < n.end; t = new Date(t.getTime() + 3600e3)) {
   const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', hourCycle: 'h23' }).format(t));
   if (h % step) continue; ticks.push(`<span style="left:${((t - n.start) / span * 100).toFixed(2)}%">${String(h).padStart(2, '0')}</span>`);
  }
  $('timeTicks').innerHTML = ticks.join('');
  const marks = [];
  const mark = (t, cls, title) => { if (t && t >= n.start && t <= n.end) marks.push(`<i class="${cls}" style="left:${((t - n.start) / span * 100).toFixed(2)}%" title="${title} · ${fmtTime(t)}"></i>`); };
  mark(n.tw.astronomical.evening, 'astro', 'Inicio de la noche astronómica'); mark(n.tw.astronomical.morning, 'astro', 'Fin de la noche astronómica');
  $('timeMarks').innerHTML = marks.join('');
  const a = n.tw.astronomical;
  $('timeRange').innerHTML = `<span>☀ Puesta · <b>${fmtTime(n.sunset)}</b></span><span>✦ Noche astronómica · <b>${a.evening && a.morning ? fmtTime(a.evening) + ' – ' + fmtTime(a.morning) : 'no alcanza −18°'}</b></span><span>Salida · <b>${fmtTime(n.sunrise)}</b> ☀</span>`;
 }
 function scheduleRender() {
  if (S.raf) return;
  S.raf = requestAnimationFrame(() => {
   S.raf = 0; const snap = snapshot(S.t);
   renderDome(snap); renderPanorama(snap);
   const label = `${fmtDay(S.t)} · ${fmtTime(S.t)}`;
   $('timeLabel').textContent = fmtTime(S.t); $('timeDayLabel').textContent = fmtDay(S.t);
   ['skyTime', 'panoTime'].forEach(id => { if ($(id)) $(id).textContent = label; });
   ['skyState', 'panoState'].forEach(id => { if ($(id)) { $(id).textContent = snap.phase.label; $(id).dataset.phase = snap.phase.key; } });
   $('timeSlider').value = tToVal(S.t);
   S.onTime && S.onTime(S.t, snap);
  });
 }
 function setTime(t) { S.t = new Date(clamp(t.getTime(), S.night.start.getTime(), S.night.end.getTime())); scheduleRender(); }
 function defaultTime() {
  const now = new Date(), n = S.night;
  if (now >= n.start && now <= n.end) return now;
  const a = n.tw.astronomical.evening; return a && a < n.end ? new Date(a.getTime() + 30 * 60e3) : new Date((n.start.getTime() + n.end.getTime()) / 2);
 }
 function setDate(dateStr, t) {
  stop(); S.dateStr = dateStr; S.night = computeNight(dateStr); paintTrack(); S.onNight && S.onNight(S.night); setTime(t || defaultTime());
 }
 function stop() { if (S.play) { clearInterval(S.play); S.play = null; $('timePlay').textContent = '▶'; $('timePlay').setAttribute('aria-label', 'Animar la noche'); } }
 function togglePlay() {
  if (S.play) return stop();
  if (S.t >= S.night.end) setTime(S.night.start);
  $('timePlay').textContent = '❚❚'; $('timePlay').setAttribute('aria-label', 'Pausar');
  S.play = setInterval(() => { const next = new Date(S.t.getTime() + 4 * 60e3); if (next >= S.night.end) { setTime(S.night.end); stop(); } else setTime(next); }, 60);
 }
 function goNow() { const now = new Date(), ds = nightDateFor(now); $('nightDate').value = ds; setDate(ds, now); }
 function setPlace(cfg) { S.cfg = cfg; S.obs = new A.Observer(Number(cfg.lat), Number(cfg.lon), Number(cfg.elevation || 0)); P.paths = {}; if (S.dateStr) setDate(S.dateStr, S.t); if (P.base) { plannerQuarters(); schedulePlanner(); } }
 function expand(btn) { const el = btn.closest('.expandable-view'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); }

 async function init(opts) {
  S.onTime = opts.onTime; S.onNight = opts.onNight; S.cfg = opts.cfg;
  S.obs = new A.Observer(Number(S.cfg.lat), Number(S.cfg.lon), Number(S.cfg.elevation || 0));
  try { S.sky = await (await fetch('assets/data/sky.json')).json(); } catch (e) { S.sky = { stars: [], lines: {}, constellations: [] }; }
  try { const r = await fetch('api/catalog.php'); if (r.ok) S.deep = ((await r.json()).objects || []).filter(o => o.ra_deg != null && o.dec_deg != null); } catch (e) { }
  $('timeSlider').addEventListener('input', e => { stop(); setTime(valToT(Number(e.target.value))); });
  $('timePlay').addEventListener('click', togglePlay);
  $('timeNow').addEventListener('click', goNow);
  $('timeBack').addEventListener('click', () => { stop(); setTime(new Date(S.t.getTime() - 30 * 60e3)); });
  $('timeFwd').addEventListener('click', () => { stop(); setTime(new Date(S.t.getTime() + 30 * 60e3)); });
  document.querySelectorAll('[data-sky-layer]').forEach(c => c.addEventListener('change', () => { S.layers[c.dataset.skyLayer] = c.checked; scheduleRender(); schedulePlanner(); }));
  document.querySelectorAll('.view-expand').forEach(b => b.addEventListener('click', () => expand(b)));
  document.addEventListener('fullscreenchange', () => { scheduleRender(); schedulePlanner(); });
  plannerInit();
  const q = new URLSearchParams(location.search).get('t'), qt = q ? new Date(q) : null;
  if (qt && !isNaN(qt)) { const ds = nightDateFor(qt); $('nightDate').value = ds; setDate(ds, qt); } else setDate(opts.dateStr);
 }

 /* ---------- planificador a días vista (misma hora local, +90° a −90°) ---------- */
 const P = { base: null, day: 0, minutes: 600, paths: {}, raf: 0, quarters: [] };
 function addDays(ds, n) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
 function tzOffset(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
 }
 // Fecha local ds a las 12:00 + minutos → instante UTC (respeta cambios de horario).
 function localNoonPlus(ds, minutes) {
  const [y, m, d] = ds.split('-').map(Number), wall = Date.UTC(y, m - 1, d, 12) + minutes * 60e3;
  let t = wall - tzOffset(new Date(wall)); const o2 = tzOffset(new Date(t)); if (wall - o2 !== t) t = wall - o2; return new Date(t);
 }
 function moonPhaseName(frac, waxing) {
  if (frac < .02) return 'Luna nueva'; if (frac > .98) return 'Luna llena';
  if (frac < .45) return waxing ? 'Creciente' : 'Menguante'; if (frac < .55) return waxing ? 'Cuarto creciente' : 'Cuarto menguante';
  return waxing ? 'Gibosa creciente' : 'Gibosa menguante';
 }
 function plannerPaths(ds) {
  if (P.paths[ds]) return P.paths[ds];
  const start = localNoonPlus(ds, 0), out = { sun: [], moon: [] };
  for (let i = 0; i <= 96; i++) { const t = new Date(start.getTime() + i * 900e3); out.sun.push(bodyHor('Sun', t)); out.moon.push(bodyHor('Moon', t)); }
  return (P.paths[ds] = out);
 }
 // Línea completa (también bajo el horizonte), cortada solo en el salto de borde.
 function fullPath(list, proj, wrapW) {
  const segs = []; let cur = [];
  for (const p of list) { const xy = proj(p); if (cur.length && Math.abs(xy[0] - cur[cur.length - 1][0]) > wrapW / 2) { segs.push(cur); cur = []; } cur.push(xy); }
  if (cur.length) segs.push(cur); return segs.filter(x => x.length > 1).map(x => 'M' + pts(x)).join('');
 }
 function plannerTime() { return localNoonPlus(addDays(P.base, P.day), P.minutes); }
 function renderPlanner() {
  const svg = $('plannerChart'); if (!svg || !S.sky || !P.base) return;
  const ds = addDays(P.base, P.day), t = plannerTime(), snap = snapshot(t), hor = snap.hor, paths = plannerPaths(ds);
  const W = 960, H = 520, L = 46, Rm = 14, T = 14, B = 14, iw = W - L - Rm, ih = H - T - B, y0 = T + ih / 2;
  const xOf = az => { let a = norm(az - 180); if (a > 180) a -= 360; return L + iw * (a + 180) / 360; };
  const yOf = alt => T + ih * (90 - alt) / 180, proj = p => [xOf(p.az), yOf(p.alt)];
  const mw = snap.nightF * (1 - .78 * snap.moonLight);
  let out = `<defs>${gradDefs('pl', snap)}<linearGradient id="plAbove" gradientUnits="userSpaceOnUse" x1="0" y1="${T}" x2="0" y2="${y0}"><stop offset="0" stop-color="${snap.phase.top}"/><stop offset="1" stop-color="${snap.phase.bottom}"/></linearGradient><linearGradient id="plBelow" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${T + ih}"><stop offset="0" stop-color="#182433"/><stop offset="1" stop-color="#03070d"/></linearGradient><clipPath id="plClip"><rect x="${L}" y="${T}" width="${iw}" height="${ih}"/></clipPath></defs>`;
  out += `<rect x="${L}" y="${T}" width="${iw}" height="${ih / 2}" fill="url(#plAbove)"/><rect x="${L}" y="${y0}" width="${iw}" height="${ih / 2}" fill="url(#plBelow)"/><g clip-path="url(#plClip)">`;
  // Vía Láctea y estrellas brillantes (atenuadas bajo el horizonte)
  if (S.layers.milky) for (let l = 0; l < 360; l += 5) {
   const bulge = .35 + .65 * Math.exp(-Math.pow(Math.min(l, 360 - l) / 42, 2));
   for (const b of [-8, -3, 2, 7]) {
    const eq = gal2eq(l, b), p = hor(eq.ra, eq.dec, false), [x, y] = proj(p), band = Math.exp(-b * b / 80), fade = p.alt >= 0 ? Math.max(mw, .25) : .25;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(6 + 6 * band + 3 * bulge).toFixed(1)}" fill="#a9bdff" opacity="${(.13 * bulge * band * fade).toFixed(3)}" filter="url(#plBlur)"/>`;
   }
  }
  for (const st of S.sky.stars) {
   if (st[2] > 4.2) break; const p = hor(st[0], st[1]), [x, y] = proj(p), above = p.alt >= 0;
   out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(.5, 2.3 - .38 * st[2]).toFixed(2)}" fill="${starColor(st[3])}" opacity="${above ? (.45 + .5 * snap.nightF).toFixed(2) : '.28'}">${st[4] ? `<title>${esc(st[4])} · ${p.alt.toFixed(1)}°</title>` : ''}</circle>`;
  }
  for (const o of S.deep) {
   const p = hor(Number(o.ra_deg), Number(o.dec_deg)), [x, y] = proj(p);
   out += `<g class="sky-deep" opacity="${p.alt >= 0 ? 1 : .5}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#71c6ff" stroke-width="1.2" stroke-dasharray="2 2"/><text x="${(x + 7).toFixed(1)}" y="${(y + 3).toFixed(1)}">${esc(o.catalog + o.catalog_id)}</text><title>${esc((o.common_name || '') + ' · ' + p.alt.toFixed(1) + '°')}</title></g>`;
  }
  // Rejilla de alturas
  for (const a of [90, 60, 30, -30, -60, -90]) { const y = yOf(a); out += `<line x1="${L}" y1="${y}" x2="${W - Rm}" y2="${y}" stroke="#9db6d4" stroke-opacity=".22" stroke-dasharray="5 6"/>`; }
  const min = Number($('minAltitude')?.value || 45);
  out += `<line x1="${L}" y1="${yOf(45)}" x2="${W - Rm}" y2="${yOf(45)}" stroke="#9b3438" stroke-width="1.6"/>`;
  if (min !== 45) out += `<line x1="${L}" y1="${yOf(min)}" x2="${W - Rm}" y2="${yOf(min)}" stroke="#c4585d" stroke-opacity=".6" stroke-dasharray="4 4"/>`;
  // Eclíptica y recorridos de 24 h
  const ecl = []; for (let l = 0; l <= 360; l += 3) { const e = ecl2eq(l); ecl.push(hor(e.ra, e.dec, false)); }
  out += `<path d="${fullPath(ecl, proj, iw)}" fill="none" stroke="#aeb7c2" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="6 6"/>`;
  out += `<path d="${fullPath(paths.sun, proj, iw)}" fill="none" stroke="#ffd166" stroke-opacity=".75" stroke-width="1.4" stroke-dasharray="4 5"/>`;
  out += `<path d="${fullPath(paths.moon, proj, iw)}" fill="none" stroke="#9bdcf9" stroke-opacity=".75" stroke-width="1.4" stroke-dasharray="4 5"/>`;
  // Etiquetas de las líneas en su punto más alto
  const top = list => list.reduce((a, b) => b.alt > a.alt ? b : a);
  [[ecl, 'Eclíptica', '#cfd6de'], [paths.sun, 'Recorrido solar', '#ffd166'], [paths.moon, 'Recorrido lunar', '#9bdcf9']].forEach(([list, label, c], k) => {
   const p = top(list), [x, y] = proj(p); out += `<text x="${x.toFixed(1)}" y="${(y - 8 - k * 2).toFixed(1)}" text-anchor="middle" class="pl-label" fill="${c}">${label}</text>`;
  });
  // Planetas, Sol y Luna (también bajo el horizonte)
  for (const b of snap.bodies) {
   const [x, y] = proj(b), deg = `${b.alt >= 0 ? '+' : '−'}${Math.abs(b.alt).toFixed(0)}°`, dim = b.alt < 0 ? ' opacity=".8"' : '';
   if (b.key === 'Sun') out += `<g${dim}><line x1="${x}" y1="${y0}" x2="${x}" y2="${y}" stroke="#ffd166" stroke-opacity=".35" stroke-dasharray="3 4"/><circle cx="${x}" cy="${y}" r="26" fill="url(#plSun)" opacity=".7"/><circle cx="${x}" cy="${y}" r="8" fill="#e09a5c" stroke="#ffd166"/><text x="${x}" y="${y + 24}" text-anchor="middle" class="pl-body">Sol ${deg}</text></g>`;
   else if (b.key === 'Moon') { const bb = bearingToSun(snap); out += `<g${dim}><line x1="${x}" y1="${y0}" x2="${x}" y2="${y}" stroke="#9bdcf9" stroke-opacity=".3" stroke-dasharray="3 4"/>${moonShape(x, y, 10, snap.moonFrac, Math.atan2(-Math.cos(bb), Math.sin(bb)) / D, 'pl')}<text x="${x + 14}" y="${y + 24}" class="pl-body">Luna ${Math.round(snap.moonFrac * 100)}% · ${deg}</text></g>`; }
   else { const edge = x > W - Rm - 80; out += `<g${dim}><circle cx="${x}" cy="${y}" r="6" fill="${b.color}" opacity=".2"/><circle cx="${x}" cy="${y}" r="3.2" fill="${b.color}"/><text x="${edge ? x - 7 : x + 7}" y="${y - 6}" text-anchor="${edge ? 'end' : 'start'}" class="sky-bname">${b.name}</text></g>`; }
  }
  out += `</g>`;
  // Horizonte y rumbos
  out += `<line x1="${L}" y1="${y0}" x2="${W - Rm}" y2="${y0}" stroke="#eef4fa" stroke-width="2"/>`;
  for (let az = 0; az <= 360; az += 30) {
   const x = az === 360 ? W - Rm : xOf(az), name = { 0: 'N', 90: 'E', 180: 'S', 270: 'O', 360: 'N' }[az];
   out += `<line x1="${x}" y1="${y0 - 6}" x2="${x}" y2="${y0 + 6}" stroke="#eef4fa" stroke-width="1.4"/><text x="${clamp(x, L + 10, W - Rm - 10)}" y="${y0 + 24}" text-anchor="middle" class="${name ? 'pl-card' : 'pl-deg'}">${name || az + '°'}</text>`;
  }
  for (const a of [90, 60, 45, 30, 0, -30, -60, -90]) out += `<text x="${L - 6}" y="${yOf(a) + 4}" text-anchor="end" class="pl-alt${a === 45 ? ' red' : ''}">${a > 0 ? '+' : a < 0 ? '−' : ''}${Math.abs(a)}°</text>`;
  svg.innerHTML = out;
  // Textos y controles
  const dayFmt = (d, o) => d.toLocaleDateString('es-ES', { timeZone: tz(), ...o });
  $('plannerTime').textContent = fmtTime(t);
  $('plannerState').textContent = `${snap.phase.label} · Luna ${Math.round(snap.moonFrac * 100)}%`;
  $('plannerHourStart').textContent = `12:00 · ${dayFmt(localNoonPlus(ds, 0), { weekday: 'short', day: 'numeric', month: 'short' })}`;
  $('plannerHourEnd').textContent = `12:00 · ${dayFmt(localNoonPlus(ds, 1440), { weekday: 'short', day: 'numeric', month: 'short' })}`;
  $('plannerDayReadout').textContent = `${dayFmt(t, { weekday: 'long', day: 'numeric', month: 'short' })} · ${moonPhaseName(snap.moonFrac, snap.moonWax)} · ${Math.round(snap.moonFrac * 100)}%`;
  $('plannerHour').value = P.minutes; $('plannerDay').value = P.day;
 }
 function schedulePlanner() { if (P.raf) return; P.raf = requestAnimationFrame(() => { P.raf = 0; renderPlanner(); }); }
 function plannerQuarters() {
  const start = localNoonPlus(P.base, 0), end = localNoonPlus(P.base, 30 * 1440 + 1440), icon = k => { const r = 7, lit = ['', `M0,${-r}A${r},${r} 0 0 1 0,${r}Z`, '', `M0,${-r}A${r},${r} 0 0 0 0,${r}Z`][k]; return `<svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true"><circle r="${r}" fill="${k === 2 ? '#f4efe1' : '#2a3346'}" stroke="#8d99ad" stroke-width=".8"/>${lit ? `<path d="${lit}" fill="#f4efe1"/>` : ''}</svg>`; }, names = ['Luna nueva', 'Cuarto creciente', 'Luna llena', 'Cuarto menguante'], out = [];
  try { let q = A.SearchMoonQuarter(start); while (q.time.date < end) { out.push(`<span style="left:${(clamp((q.time.date - start) / (30 * 86400e3), 0, 1) * 100).toFixed(2)}%" title="${names[q.quarter]} · ${q.time.date.toLocaleDateString('es-ES', { timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(q.time.date)}">${icon(q.quarter)}</span>`); q = A.NextMoonQuarter(q); } } catch (e) { }
  $('plannerPhases').innerHTML = out.join('');
  const f = d => d.toLocaleDateString('es-ES', { timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short' });
  $('plannerDayStart').textContent = `Desde · ${f(localNoonPlus(P.base, 0))}`; $('plannerDayEnd').textContent = `Hasta · ${f(localNoonPlus(addDays(P.base, 30), 0))}`;
 }
 function plannerNow() {
  const now = new Date(); P.base = nightDateFor(now); P.day = 0; P.minutes = clamp(Math.round((now - localNoonPlus(P.base, 0)) / 60e3), 0, 1440);
  plannerQuarters(); schedulePlanner();
 }
 function plannerInit() {
  if (!$('plannerChart')) return;
  $('plannerHour').addEventListener('input', e => { P.minutes = Number(e.target.value); schedulePlanner(); });
  $('plannerDay').addEventListener('input', e => { P.day = Number(e.target.value); schedulePlanner(); });
  $('plannerNow').addEventListener('click', plannerNow);
  $('plannerFold').addEventListener('click', () => { const c = $('plannerCard').classList.toggle('folded'); $('plannerFold').textContent = c ? '+ Desplegar' : '− Plegar'; $('plannerFold').setAttribute('aria-expanded', String(!c)); });
  plannerNow();
 }
 function nightTimes(dateStr) { const n = computeNightLite(dateStr); return n; }
 function computeNightLite(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number), noon = new Date(Date.UTC(y, m - 1, d, 12) - (S.cfg.lon / 15) * 3600e3);
  let sunset = null, sunrise = null; try { sunset = A.SearchRiseSet('Sun', S.obs, -1, noon, 1.2)?.date || null; sunrise = sunset ? A.SearchRiseSet('Sun', S.obs, +1, sunset, 1.2)?.date || null : null; } catch (e) { }
  return { sunset: sunset || noon, sunrise: sunrise || new Date(noon.getTime() + 86400e3) };
 }
 function moonTimes(dateStr) { // próxima salida y próxima puesta de la Luna desde el mediodía local de la fecha elegida
  const noon = localNoonPlus(dateStr, 0), f = dir => { try { return A.SearchRiseSet('Moon', S.obs, dir, noon, 1.5)?.date || null; } catch (e) { return null; } };
  return { rise: f(+1), set: f(-1) };
 }
 window.Sky = { moonTimes, frame: d => frame(d), bodyHor, data: () => S.sky, place: () => S.cfg, nightTimes, init, setDate, setPlace, goNow, time: () => S.t, redraw: () => { scheduleRender(); schedulePlanner(); }, nightDateFor };
})();
