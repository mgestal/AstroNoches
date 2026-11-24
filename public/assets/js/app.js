(() => {
 const cfg=window.ASTRONOCHES_CONFIG||{lat:43.3623,lon:-8.4115,name:'A Coruña',timezone:'Europe/Madrid'};
 const $=id=>document.getElementById(id), D=Math.PI/180;
 let selectedDate=new Date(), weatherCache=null, sites=[], updateSeq=0;
 const debounce=(fn,ms)=>{let h;return(...a)=>{clearTimeout(h);h=setTimeout(()=>fn(...a),ms);};};
 const fmtLocal=v=>v?v.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:cfg.timezone||'Europe/Madrid'}):'—';
 function showNight(n){window.Aurora&&Aurora.render();const zone=cfg.timezone||'Europe/Madrid',dayKey=d=>d.toLocaleDateString('es-ES',{timeZone:zone}),base=dayKey(n.sunset||n.noon),lbl=d=>d?`${fmtLocal(d)}${dayKey(d)!==base?' ('+d.toLocaleDateString('es-ES',{weekday:'short',timeZone:zone})+')':''}`:'—';$('sunTimes').textContent=`↓ ${fmtLocal(n.sunset)} · ↑ ${fmtLocal(n.sunrise)}`;$('sunHint').textContent=`Puesta ${lbl(n.sunset)} · salida ${lbl(n.sunrise)}`;const m=Sky.moonTimes(n.dateStr);$('moonTimes').textContent=`Salida ${lbl(m.rise)} · puesta ${lbl(m.set)}`;const a=n.tw.astronomical;$('darkWindow').textContent=a.evening&&a.morning?`${fmtLocal(a.evening)} – ${fmtLocal(a.morning)}`:'Sin noche astronómica';}
 const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
 const fmt=(v,n=0)=>`${Number(v).toFixed(n)}°`;
 function getDate(){return new Date(`${$('nightDate').value}T22:00:00`)}
 async function update(){
  selectedDate=(window.Sky&&Sky.time())||getDate();const lat=Number(cfg.lat),lon=Number(cfg.lon),seq=++updateSeq;
  $('siteName').textContent=cfg.name;$('siteCoords').textContent=`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  try{
   const params=new URLSearchParams({lat,lon,elevation:cfg.elevation||0,datetime:selectedDate.toISOString(),timezone:cfg.timezone||'Europe/Madrid'});
   const response=await fetch(`api/astronomy.php?${params}`);if(!response.ok)throw new Error('Motor astronómico no disponible');
   const precise=await response.json();if(precise.error)throw new Error(precise.error);if(seq!==updateSeq)return;
   const result={objects:precise.objects,moon:precise.moon,moonPhase:precise.moon.phase_name};
   $('moonPhase').textContent=result.moonPhase;$('moonIllum').textContent=`Iluminación ${Math.round(result.moon.illumination)}% · ${result.moon.age_days.toFixed(1)} días`;
   $('skyNote').textContent=`Efemérides calculadas con PyEphem ${precise.engine_version}. Altitud geométrica sin refracción atmosférica. Cúpula y panorámica: Astronomy Engine.`;
   renderTargets(result.objects);
  }catch(error){
   console.error(error);const result=AstroMath.calculate(selectedDate,lat,lon);
   $('moonPhase').textContent=result.moonPhase;$('moonIllum').textContent=`Iluminación ${Math.round(result.moon.illumination)}% · cálculo local aproximado`;
   $('skyNote').textContent='No se pudo consultar PyEphem; la tabla usa posiciones aproximadas del navegador.';
   renderTargets(result.objects);
  }
 }
 function renderTargets(objects){const min=Number($('minAltitude').value),filter=$('targetFilter').value;const rows=objects.filter(o=>o.name!=='Sol'&&o.name!=='Luna'&&(filter==='all'||(filter==='planet'&&['Mercurio','Venus','Marte','Júpiter','Saturno'].includes(o.name))));$('targetRows').innerHTML=rows.map(o=>{const ok=o.alt>=min,dir=o.az<22.5||o.az>=337.5?'N':o.az<67.5?'NE':o.az<112.5?'E':o.az<157.5?'SE':o.az<202.5?'S':o.az<247.5?'SO':o.az<292.5?'O':'NO';return `<tr><td><b>${o.name}</b></td><td>${o.alt.toFixed(1)}°</td><td>${o.az.toFixed(0)}° ${dir}</td><td><span class="status ${ok?'good':'low'}">${ok?'Sobre el umbral':'Demasiado bajo'}</span></td><td>${ok?'Puede ser observable ahora':'Esperar a que gane altura'}</td></tr>`;}).join('');}
 async function loadWeather(){const status=$('weatherStatus');status.textContent='Consultando Open-Meteo…';try{const r=await fetch(`api/weather.php?lat=${encodeURIComponent(cfg.lat)}&lon=${encodeURIComponent(cfg.lon)}`);if(!r.ok)throw Error('Servicio meteorológico no disponible');weatherCache=await r.json();const h=weatherCache.hourly,now=new Date();let i=h.time.findIndex(t=>new Date(t)>=now);if(i<0)i=0;const temp=h.temperature_2m[i],rh=h.relative_humidity_2m[i],cloud=h.cloud_cover[i],wind=h.wind_speed_10m[i],dew=h.dew_point_2m[i],rain=h.precipitation_probability?.[i]??0,spread=temp-dew,risk=spread<=1.5||rh>=95?'Muy alto':spread<=3||rh>=90?'Alto':spread<=5||rh>=80?'Moderado':'Bajo';$('temperature').textContent=`${Math.round(temp)}°`;$('humidity').textContent=`${Math.round(rh)}%`;$('wind').textContent=`${Math.round(wind)} km/h`;$('cloudCover').textContent=`${Math.round(cloud)}%`;$('rainHint').textContent=`Prob. lluvia ${Math.round(rain)}%`;$('cloudHint').textContent=cloud<25?'Cielo poco cubierto':cloud<60?'Nubosidad variable':'Cielo muy cubierto';$('cloudDetail').textContent=`${Math.round(cloud)}%`;$('rainChance').textContent=`${Math.round(rain)}%`;$('dewRisk').textContent=risk;$('dewHint').textContent=`Margen T−Td: ${spread.toFixed(1)} °C · punto de rocío ${dew.toFixed(1)} °C`;$('weatherStatus').textContent=`Previsión horaria · ${h.time[i].replace('T',' ')} · Open-Meteo`;$('cloudSiteName').textContent=cfg.name;$('cloudSiteCoords').textContent=`${Number(cfg.lat).toFixed(4)}°, ${Number(cfg.lon).toFixed(4)}° · ${cfg.timezone||'Europe/Madrid'}`;window.AstroMap&&AstroMap.setWind(Number(wind),Number(h.wind_direction_10m?.[i]),new Date(h.time[i]));renderCloudForecast();}catch(e){status.textContent=`${e.message}. Comprueba la conexión e inténtalo de nuevo.`;$('cloudPreviewDate').textContent='No se pudo cargar la previsión';}}
 const mean=a=>a.length?a.reduce((x,y)=>x+(Number(y)||0),0)/a.length:0;
 const WIND16=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
 const windName=v=>Number.isFinite(v)?WIND16[Math.round(v/22.5)%16]:'—';
 const num=v=>v===null||v===undefined||v===''?NaN:Number(v);
 function dewRisk(r){if(!Number.isFinite(r.temp)||!Number.isFinite(r.dew))return -1;const sp=r.temp-r.dew,rh=r.humidity;return sp<=1.5||rh>=95?3:sp<=3||rh>=90?2:sp<=5||rh>=80?1:0;}
 let weatherRows=[];
 // Horas de previsión entre la puesta y la salida del Sol de la noche elegida (hoy + day).
 function nightWeather(day){
  const h=weatherCache.hourly,off=(weatherCache.utc_offset_seconds||0)*1000,d=new Date();if(d.getHours()<12)d.setDate(d.getDate()-1);d.setDate(d.getDate()+day);
  const ds=iso(d),n=Sky.nightTimes(ds),from=Math.floor(n.sunset.getTime()/3600e3)*3600e3,to=n.sunrise.getTime();
  const rows=h.time.map((t,i)=>({i,epoch:Date.parse(t+'Z')-off})).filter(r=>r.epoch>=from&&r.epoch<=to).map(r=>({epoch:r.epoch,high:num(h.cloud_cover_high?.[r.i]),mid:num(h.cloud_cover_mid?.[r.i]),low:num(h.cloud_cover_low?.[r.i]),cloud:num(h.cloud_cover?.[r.i]),rain:num(h.precipitation_probability?.[r.i]),humidity:num(h.relative_humidity_2m?.[r.i]),wind:num(h.wind_speed_10m?.[r.i]),dir:num(h.wind_direction_10m?.[r.i]),vis:num(h.visibility?.[r.i]),temp:num(h.temperature_2m?.[r.i]),dew:num(h.dew_point_2m?.[r.i])})).filter(r=>Number.isFinite(r.cloud));
  return {ds,n,rows};
 }
 const avg=(rows,k)=>{const v=rows.map(r=>r[k]).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;};
 const maxOf=(rows,k)=>{const v=rows.map(r=>r[k]).filter(Number.isFinite);return v.length?Math.max(...v):NaN;};
 const minOf=(rows,k)=>{const v=rows.map(r=>r[k]).filter(Number.isFinite);return v.length?Math.min(...v):NaN;};
 function meanDir(rows){let x=0,y=0,n=0;rows.forEach(r=>{if(Number.isFinite(r.dir)){const w=Number.isFinite(r.wind)?r.wind:1;x+=w*Math.cos(r.dir*D);y+=w*Math.sin(r.dir*D);n++;}});return n?((Math.atan2(y,x)/D)+360)%360:NaN;}
 function renderCloudForecast(day=Number(document.querySelector('#cloudDayTabs .selected')?.dataset.day||0)){
  if(!weatherCache?.hourly||!window.Sky)return;const zone=cfg.timezone||'Europe/Madrid';let night;
  try{night=nightWeather(day);}catch(e){return;}
  const {ds,n,rows}=night;weatherRows=rows;
  const hhmm=e=>new Date(e).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:zone});
  const pct=v=>Number.isFinite(v)?`${Math.round(v)}%`:'—%';
  const vals={high:avg(rows,'high'),mid:avg(rows,'mid'),low:avg(rows,'low'),total:avg(rows,'cloud'),rain:maxOf(rows,'rain'),hum:avg(rows,'humidity'),wind:avg(rows,'wind'),dir:meanDir(rows),vis:minOf(rows,'vis')};
  const dateLabel=new Date(n.sunset).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short',timeZone:zone});
  [['High',vals.high],['Mid',vals.mid],['Low',vals.low]].forEach(([k,v])=>{$(`cloud${k}Value`).textContent=pct(v);$(`cloud${k}Bar`).style.width=`${Number.isFinite(v)?v:0}%`;});
  $('cloudTotalValue').textContent=pct(vals.total);$('cloudPreviewDate').textContent=`${cfg.name} · noche del ${dateLabel}`;
  $('cloudHourly').innerHTML=rows.filter((r,i)=>i%2===0).map(r=>`<div class="cloud-hour"><div class="cloud-hour-bar"><i style="height:${Math.max(3,r.cloud)}%"></i></div><small>${hhmm(r.epoch).slice(0,2)}</small></div>`).join('')||'<span class="subtle">Sin datos para esta noche</span>';
  $('cloudNightDate').textContent=`${cfg.name} · ${new Date(n.sunset).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',timeZone:zone})} · puesta ${hhmm(n.sunset)} → salida ${hhmm(n.sunrise)}`;
  [['nightHigh',vals.high],['nightMid',vals.mid],['nightLow',vals.low]].forEach(([id,v])=>{$(id).textContent=pct(v);$(id+'Bar').style.width=`${Number.isFinite(v)?v:0}%`;});
  const tone=!Number.isFinite(vals.total)?'':vals.total<25&&vals.rain<20?'good':vals.total<55?'fair':'bad';
  $('cloudNightVerdict').textContent=!tone?'Sin datos suficientes':tone==='good'?'Buenas opciones':tone==='fair'?'Noche variable':'Noche complicada';$('cloudNightVerdict').className='cloud-verdict '+tone;
  const metric=(l,v)=>`<div class="weather-metric"><span>${l}</span><b>${v}</b></div>`;
  $('weatherSummary').innerHTML=[metric('Cobertura total',pct(vals.total)),metric('Prob. lluvia máx.',pct(vals.rain)),metric('Humedad media',pct(vals.hum)),metric('Viento medio',Number.isFinite(vals.wind)?`${Math.round(vals.wind)} km/h`:'—'),metric('Dirección del viento',windName(vals.dir)),metric('Visibilidad mín.',Number.isFinite(vals.vis)?`${(vals.vis/1000).toFixed(0)} km`:'—')].join('');
  const q=(v,g,m)=>!Number.isFinite(v)?'wx-neutral':v<=g?'wx-good':v<=m?'wx-mixed':'wx-poor';
  const spec=[
   ['Nubes altas',r=>pct(r.high),r=>q(r.high,25,55)],['Nubes medias',r=>pct(r.mid),r=>q(r.mid,25,55)],['Nubes bajas',r=>pct(r.low),r=>q(r.low,25,55)],['Nubes totales',r=>pct(r.cloud),r=>q(r.cloud,25,55)],
   ['Prob. lluvia',r=>pct(r.rain),r=>q(r.rain,20,50)],
   ['Punto de rocío',r=>Number.isFinite(r.dew)?`${r.dew.toFixed(1)}°`:'—',r=>{const k=dewRisk(r);return k<0?'wx-neutral':['wx-good','wx-mixed','wx-poor','wx-poor'][k];},r=>Number.isFinite(r.temp)&&Number.isFinite(r.dew)?` · T ${r.temp.toFixed(1)}° · margen ${(r.temp-r.dew).toFixed(1)}°`:''],
   ['Humedad',r=>pct(r.humidity),r=>!Number.isFinite(r.humidity)?'wx-neutral':r.humidity<80?'wx-good':r.humidity<90?'wx-mixed':'wx-poor'],
   ['Viento',r=>Number.isFinite(r.wind)?`<span class="wind-arrow" style="transform:rotate(${Number.isFinite(r.dir)?r.dir:0}deg)">↑</span>${windName(r.dir)} ${Math.round(r.wind)}`:'—',r=>q(r.wind,15,30)],
   ['Visibilidad',r=>Number.isFinite(r.vis)?`${(r.vis/1000).toFixed(0)} km`:'—',r=>!Number.isFinite(r.vis)?'wx-neutral':r.vis>=20000?'wx-good':r.vis>=10000?'wx-mixed':'wx-poor']
  ];
  const head=`<thead><tr><th scope="col">Hora local</th>${rows.map(r=>`<th scope="col"><button type="button" class="weather-matrix-hour" data-epoch="${r.epoch}" data-ds="${ds}">${hhmm(r.epoch)}</button></th>`).join('')}</tr></thead>`;
  const body=`<tbody>${spec.map(([name,val,cls,extra])=>`<tr><th scope="row">${name}</th>${rows.map(r=>`<td><button type="button" class="weather-matrix-cell ${cls(r)}" data-epoch="${r.epoch}" data-ds="${ds}" title="${name} · ${hhmm(r.epoch)}${extra?extra(r):''}">${val(r)}</button></td>`).join('')}</tr>`).join('')}</tbody>`;
  $('weatherMatrix').innerHTML=rows.length?head+body:'<tbody><tr><td class="subtle">La previsión no cubre esta noche.</td></tr></tbody>';
  $('weatherNote').textContent=`Open-Meteo · ${weatherCache.source||'modelos automáticos'} · última consulta: ${new Date(weatherCache.fetched_at||Date.now()).toLocaleString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:zone})} · noche del ${dateLabel}. Colores: verde favorable, ámbar dudoso, rojo desfavorable; el punto de rocío se colorea según el riesgo de condensación. El cielo real puede variar.`;
  markWeatherHour(Sky.time());window.Aurora&&Aurora.render();
 }
 function markWeatherHour(t){const el=$('weatherMatrix');if(!el||!t)return;const h=Math.floor(t.getTime()/3600e3)*3600e3;el.querySelectorAll('[data-epoch]').forEach(b=>b.classList.toggle('is-current',Number(b.dataset.epoch)===h));}
 const escH=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 let editingId=null,activeSiteId=null;
 function useSite(s){activeSiteId=s.id;cfg.lat=Number(s.latitude);cfg.lon=Number(s.longitude);cfg.name=s.name;cfg.elevation=Number(s.elevation_m||0);cfg.timezone=s.timezone||cfg.timezone;window.AstroMap&&AstroMap.setPlace(cfg);Sky.setPlace(cfg);window.SatTracker&&SatTracker.setPlace();window.Aurora&&Aurora.load();loadWeather();renderSites();}
 function renderSites(){if(activeSiteId==null){const m=sites.find(s=>Math.abs(s.latitude-cfg.lat)<1e-5&&Math.abs(s.longitude-cfg.lon)<1e-5);if(m)activeSiteId=m.id;}
  $('siteList').innerHTML=sites.map(s=>`<div class="site-item${s.id==activeSiteId?' active':''}${s.id==editingId?' editing':''}"><button type="button" class="site-chip" data-act="use" data-id="${s.id}" title="Usar este lugar">${escH(s.name)} · ${Number(s.latitude).toFixed(3)}, ${Number(s.longitude).toFixed(3)}${Number(s.is_default)?' ★':''}</button><button type="button" class="site-icon" data-act="edit" data-id="${s.id}" title="Editar ${escH(s.name)}" aria-label="Editar ${escH(s.name)}">✎</button><button type="button" class="site-icon danger" data-act="del" data-id="${s.id}" title="Borrar ${escH(s.name)}" aria-label="Borrar ${escH(s.name)}"${sites.length<2?' disabled':''}>🗑</button></div>`).join('');}
 function setEditing(s){const form=$('siteForm');editingId=s?s.id:null;form.name.value=s?s.name:'';form.latitude.value=s?Number(s.latitude):'';form.longitude.value=s?Number(s.longitude):'';$('siteSubmit').textContent=s?'Actualizar lugar':'Guardar lugar';$('siteCancel').hidden=!s;if(s){$('siteMessage').textContent=`Editando «${s.name}»`;form.name.focus();}renderSites();}
 async function loadSites(){try{const r=await fetch('api/sites.php');if(!r.ok)return;sites=(await r.json()).sites;renderSites();}catch(e){}}
 $('siteList').addEventListener('click',async e=>{const b=e.target.closest('button[data-act]');if(!b)return;const s=sites.find(x=>x.id==b.dataset.id);if(!s)return;
  if(b.dataset.act==='use')useSite(s);
  else if(b.dataset.act==='edit')setEditing(s);
  else if(b.dataset.act==='del'){if(!confirm(`¿Borrar el lugar «${s.name}»?`))return;try{const r=await fetch(`api/sites.php?id=${encodeURIComponent(s.id)}`,{method:'DELETE'});const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo borrar');if(editingId==s.id)setEditing(null);$('siteMessage').textContent=`«${s.name}» borrado.`;await loadSites();if(activeSiteId==s.id&&sites[0])useSite(sites[0]);}catch(err){$('siteMessage').textContent=err.message;}}});
 $('siteCancel').addEventListener('click',()=>{setEditing(null);$('siteMessage').textContent='';});
 {const n=new Date();if(n.getHours()<12)n.setDate(n.getDate()-1);$('nightDate').value=iso(n);}$('nightDate').addEventListener('change',()=>Sky.setDate($('nightDate').value));$('prevDay').addEventListener('click',()=>{const d=getDate();d.setDate(d.getDate()-1);$('nightDate').value=iso(d);Sky.setDate($('nightDate').value);});$('nextDay').addEventListener('click',()=>{const d=getDate();d.setDate(d.getDate()+1);$('nightDate').value=iso(d);Sky.setDate($('nightDate').value);});$('minAltitude').addEventListener('input',()=>{$('minAltitudeValue').textContent=`${$('minAltitude').value}°`;update();Sky.redraw();});$('targetFilter').addEventListener('change',update);$('refreshWeather').addEventListener('click',loadWeather);$('refreshClouds').addEventListener('click',loadWeather);$('cloudDayTabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{$('cloudDayTabs').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));renderCloudForecast(Number(b.dataset.day));}));$('redMode').addEventListener('click',()=>document.body.classList.toggle('red-mode'));$('fullscreen').addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.());
 let geoTz=null;
 $('siteGeo').addEventListener('click',()=>{const msg=$('siteMessage'),btn=$('siteGeo'),form=$('siteForm');
  if(!('geolocation' in navigator)){msg.textContent='Este navegador no permite obtener la ubicación.';return;}
  if(!window.isSecureContext){msg.textContent='La ubicación solo está disponible con HTTPS.';return;}
  btn.disabled=true;msg.textContent='Obteniendo ubicación…';
  navigator.geolocation.getCurrentPosition(async p=>{const lat=+p.coords.latitude.toFixed(6),lon=+p.coords.longitude.toFixed(6);
   if(editingId)setEditing(null);form.latitude.value=lat;form.longitude.value=lon;geoTz=Intl.DateTimeFormat().resolvedOptions().timeZone||null;
   msg.textContent=`Ubicación detectada (±${Math.round(p.coords.accuracy)} m). Buscando el nombre…`;
   let name='';try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=es&lat=${lat}&lon=${lon}`,{referrerPolicy:'strict-origin-when-cross-origin'});if(r.ok){const d=await r.json(),a=d.address||{};name=a.village||a.town||a.city||a.hamlet||a.suburb||a.municipality||a.county||'';}}catch(e){}
   if(!form.name.value.trim())form.name.value=name||'Mi ubicación';
   msg.textContent=`Ubicación detectada (±${Math.round(p.coords.accuracy)} m). Revisa el nombre y pulsa «Guardar lugar».`;form.name.focus();form.name.select();btn.disabled=false;},
  err=>{btn.disabled=false;msg.textContent=err.code===1?'Permiso de ubicación denegado. Actívalo en el navegador para este sitio.':err.code===3?'La ubicación tardó demasiado. Inténtalo de nuevo.':'No se pudo obtener la ubicación.';},
  {enableHighAccuracy:true,timeout:15000,maximumAge:60000});});
 $('siteForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),payload=Object.fromEntries(f.entries()),id=editingId;payload.latitude=Number(payload.latitude);payload.longitude=Number(payload.longitude);if(id)payload.id=id;else if(geoTz)payload.timezone=geoTz;try{const r=await fetch('api/sites.php',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo guardar');setEditing(null);geoTz=null;$('siteMessage').textContent=id?'Lugar actualizado.':'Lugar guardado.';await loadSites();if(id&&id==activeSiteId){const s=sites.find(x=>x.id==id);if(s)useSite(s);}}catch(err){$('siteMessage').textContent=err.message;}});
 window.AstroApp={weather:()=>weatherCache};
 const refresh=debounce(update,350);
 Sky.init({cfg,dateStr:$('nightDate').value,onTime:t=>{refresh();markWeatherHour(t);},onNight:showNight});
 window.AstroMap&&AstroMap.init(cfg);
 $('weatherMatrix').addEventListener('click',e=>{const b=e.target.closest('[data-epoch]');if(!b)return;$('nightDate').value=b.dataset.ds;Sky.setDate(b.dataset.ds,new Date(Number(b.dataset.epoch)));});
 loadWeather();loadSites();
})();
