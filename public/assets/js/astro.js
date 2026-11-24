/* Compact low-precision solar-system model for planning previews. Angles in degrees. */
(() => {
 const D=Math.PI/180, R=180/Math.PI, norm=x=>((x%360)+360)%360;
 const jd=date=>date.getTime()/86400000+2440587.5;
 const days=date=>jd(date)-2451543.5;
 const kepler=(M,e)=>{let E=M+e*R*Math.sin(M*D)*(1+e*Math.cos(M*D));for(let i=0;i<8;i++)E-= (E-e*R*Math.sin(E*D)-M)/(1-e*Math.cos(E*D));return E;};
 const elements={
  Mercury:[48.3313,3.24587e-5,7.0047,5e-8,29.1241,1.01444e-5,0.387098,0,0.205635,5.59e-10,168.6562,4.092334436],
  Venus:[76.6799,2.4659e-5,3.3946,2.75e-8,54.891,1.38374e-5,0.72333,0,0.006773,-1.302e-9,48.0052,1.602130224],
  Mars:[49.5574,2.11081e-5,1.8497,-1.78e-8,286.5016,2.92961e-5,1.523688,0,0.093405,2.516e-9,18.6021,0.5240207766],
  Jupiter:[100.4542,2.76854e-5,1.303,-1.557e-7,273.8777,1.64505e-5,5.20256,0,0.048498,4.469e-9,19.895,0.0830853001],
  Saturn:[113.6634,2.3898e-5,2.4886,-1.081e-7,339.3939,2.97661e-5,9.55475,0,0.055546,-9.499e-9,316.967,0.0334442282]
 };
 function heliocentric(name,d){const p=elements[name],N=norm(p[0]+p[1]*d),inc=p[2]+p[3]*d,w=p[4]+p[5]*d,a=p[6]+p[7]*d,e=p[8]+p[9]*d,M=norm(p[10]+p[11]*d),E=kepler(M,e),xv=a*(Math.cos(E*D)-e),yv=a*Math.sqrt(1-e*e)*Math.sin(E*D),v=Math.atan2(yv,xv)*R,r=Math.hypot(xv,yv),u=(v+w)*D;
 return {x:r*(Math.cos(N*D)*Math.cos(u)-Math.sin(N*D)*Math.sin(u)*Math.cos(inc*D)),y:r*(Math.sin(N*D)*Math.cos(u)+Math.cos(N*D)*Math.sin(u)*Math.cos(inc*D)),z:r*Math.sin(u)*Math.sin(inc*D)};}
 function sunEquatorial(date){const d=days(date),w=norm(282.9404+4.70935e-5*d),e=.016709-1.151e-9*d,M=norm(356.047+0.9856002585*d),E=kepler(M,e),x=Math.cos(E*D)-e,y=Math.sqrt(1-e*e)*Math.sin(E*D),v=Math.atan2(y,x)*R,r=Math.hypot(x,y),lon=(v+w)*D,eps=(23.4393-3.563e-7*d)*D;return {ra:norm(Math.atan2(Math.sin(lon)*Math.cos(eps),Math.cos(lon))*R),dec:Math.asin(Math.sin(eps)*Math.sin(lon))*R,dist:r};}
 function moonEquatorial(date){const d=days(date),N=norm(125.1228-0.0529538083*d),i=5.1454,w=norm(318.0634+0.1643573223*d),a=60.2666,e=.0549,M=norm(115.3654+13.0649929509*d),E=kepler(M,e),xv=a*(Math.cos(E*D)-e),yv=a*Math.sqrt(1-e*e)*Math.sin(E*D),v=Math.atan2(yv,xv)*R,r=Math.hypot(xv,yv),u=(v+w)*D,x=r*(Math.cos(N*D)*Math.cos(u)-Math.sin(N*D)*Math.sin(u)*Math.cos(i*D)),y=r*(Math.sin(N*D)*Math.cos(u)+Math.cos(N*D)*Math.sin(u)*Math.cos(i*D)),z=r*Math.sin(u)*Math.sin(i*D),lon=Math.atan2(y,x),lat=Math.atan2(z,Math.hypot(x,y)),sun=sunEquatorial(date),L=norm(N+w+M),Lm=norm(sun.ra), elong=norm(L-Lm),phase=(1-Math.cos(elong*D))/2,eps=23.4393*D;
 const xe=Math.cos(lat)*Math.cos(lon),ye=Math.cos(lat)*Math.sin(lon),ze=Math.sin(lat),yeq=ye*Math.cos(eps)-ze*Math.sin(eps),zeq=ye*Math.sin(eps)+ze*Math.cos(eps);return {ra:norm(Math.atan2(yeq,xe)*R),dec:Math.atan2(zeq,Math.hypot(xe,yeq))*R,illumination:phase*100,age:29.530588*elong/360};}
 function planetEquatorial(name,date){const d=days(date); // Earth orbit is derived separately below.
  const N=norm(0),w=282.9404+4.70935e-5*d,a=1,e=.016709-1.151e-9*d,M=norm(356.047+0.9856002585*d),E=kepler(M,e),xv=a*(Math.cos(E*D)-e),yv=a*Math.sqrt(1-e*e)*Math.sin(E*D),v=Math.atan2(yv,xv)*R,r=Math.hypot(xv,yv),L=(v+w)*D,ex=r*Math.cos(L),ey=r*Math.sin(L);
  const p=heliocentric(name,d),x=p.x-ex,y=p.y-ey,z=p.z,eps=23.4393*D,yeq=y*Math.cos(eps)-z*Math.sin(eps),zeq=y*Math.sin(eps)+z*Math.cos(eps);return {ra:norm(Math.atan2(yeq,x)*R),dec:Math.atan2(zeq,Math.hypot(x,yeq))*R};}
 function sidereal(date){const T=(jd(date)-2451545)/36525;return norm(280.46061837+360.98564736629*(jd(date)-2451545)+.000387933*T*T-T*T*T/38710000);}
 function horizontal(ra,dec,date,lat,lon){const H=norm(sidereal(date)+lon-ra+180)-180,hr=H*D,dr=dec*D,lr=lat*D;const alt=Math.asin(Math.sin(lr)*Math.sin(dr)+Math.cos(lr)*Math.cos(dr)*Math.cos(hr));const az=Math.atan2(-Math.sin(hr),Math.tan(dr)*Math.cos(lr)-Math.sin(lr)*Math.cos(hr));return {alt:alt*R,az:norm(az*R)};}
 function moonPhaseName(illum,age){if(illum<2)return 'Luna nueva';if(illum>98)return 'Luna llena';if(age<7.4)return 'Creciente';if(age<14.8)return 'Gibosa creciente';if(age<22.1)return 'Gibosa menguante';return 'Menguante';}
 function calculate(date,lat,lon){const sun=sunEquatorial(date),moon=moonEquatorial(date),bodies=[{name:'Sol',...sun},{name:'Luna',...moon},...['Mercury','Venus','Mars','Jupiter','Saturn'].map(n=>({name:({Mercury:'Mercurio',Venus:'Venus',Mars:'Marte',Jupiter:'Júpiter',Saturn:'Saturno'})[n],...planetEquatorial(n,date)}))];const objects=bodies.map(o=>({...o,...horizontal(o.ra,o.dec,date,lat,lon)}));return {objects,moonPhase:moonPhaseName(moon.illumination,moon.age),moon};}
 function sunAltitude(date,lat,lon){const s=sunEquatorial(date);return horizontal(s.ra,s.dec,date,lat,lon).alt;}
 function darkness(date,lat,lon){const base=new Date(date);base.setHours(12,0,0,0);const events=[];for(let h=0;h<24;h+=.25){const t=new Date(base.getTime()+h*3600000),a=sunAltitude(t,lat,lon);if(a<=-18)events.push(t);}if(!events.length)return 'No hay noche astronómica';const first=events[0],last=events[events.length-1];const fmt=d=>d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});return `${fmt(first)} – ${fmt(last)}`;}
 window.AstroMath={calculate,horizontal,sunEquatorial,moonEquatorial,sunAltitude,darkness,norm};
})();
