<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/app/bootstrap.php';
// Clima espacial NOAA SWPC agregado: viento solar (RTSW, L1), Kp observado/previsto, escalas NOAA y óvalo OVATION.
const SWPC='https://services.swpc.noaa.gov/';
function swpc(string $path,int $ttl): ?array {
    $file=sys_get_temp_dir().'/astronoches-swpc-'.md5($path).'.json';
    if(is_file($file)&&time()-filemtime($file)<$ttl){ $v=json_decode((string)file_get_contents($file),true); if(is_array($v)) return $v; }
    $data=false;
    if(function_exists('curl_init')){ $ch=curl_init(SWPC.$path); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'AstroNoches/1.0',CURLOPT_ENCODING=>'']); $data=curl_exec($ch); $st=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch); if($st>=400) $data=false; }
    $v=$data!==false?json_decode((string)$data,true):null;
    if(is_array($v)){ @file_put_contents($file,$data,LOCK_EX); return $v; }
    if(is_file($file)){ $v=json_decode((string)file_get_contents($file),true); return is_array($v)?$v:null; }
    return null;
}
function utc(string $t): int { return (int)strtotime($t.(str_ends_with($t,'Z')?'':'Z')); }
// Promedios de 5 min de la fuente activa (DSCOVR/ACE/IMAP/SOLAR1) para las últimas 24 h.
function resample(?array $rows,array $keys): array {
    if(!$rows) return []; $bins=[];
    foreach($rows as $r){ if(empty($r['active'])) continue; $t=utc($r['time_tag']); $b=intdiv($t,300)*300;
        foreach($keys as $out=>$k){ $v=$r[$k]??null; if($v===null||!is_numeric($v)) continue; $bins[$b][$out][]=(float)$v; } }
    ksort($bins); $res=[];
    foreach($bins as $b=>$vals){ $row=['t'=>$b*1000]; foreach($keys as $out=>$k){ $a=$vals[$out]??[]; $row[$out]=$a?round(array_sum($a)/count($a),2):null; } $res[]=$row; }
    return $res;
}
$mag=resample(swpc('json/rtsw/rtsw_mag_1m.json',120),['bz'=>'bz_gsm','bt'=>'bt','by'=>'by_gsm']);
$wind=resample(swpc('json/rtsw/rtsw_wind_1m.json',120),['speed'=>'proton_speed','density'=>'proton_density','temp'=>'proton_temperature']);
$kpf=array_map(fn($r)=>['t'=>utc($r['time_tag'])*1000,'kp'=>(float)$r['kp'],'type'=>$r['observed'],'g'=>$r['noaa_scale']],swpc('products/noaa-planetary-k-index-forecast.json',1800)??[]);
$kp1=swpc('json/planetary_k_index_1m.json',120)??[]; $kpNow=$kp1?end($kp1):null;
$scales=swpc('products/noaa-scales.json',1800)??[];
$ov=swpc('json/ovation_aurora_latest.json',300); $oval=[];
if($ov) foreach($ov['coordinates'] as [$lon,$lat,$val]) if($lat>=20&&$val>=1) $oval[]=[$lon>180?$lon-360:$lon,$lat,$val];
// Índice Dst (Kyoto, horario) de las últimas 48 h.
$dst=array_values(array_filter(array_map(fn($r)=>['t'=>utc($r['time_tag'])*1000,'dst'=>(float)$r['dst']],swpc('products/kyoto-dst.json',900)??[]),fn($r)=>$r['t']>=(time()-48*3600)*1000));
// Potencia hemisférica OVATION (GW): «obs fcst norte sur».
$hp=[]; $hpFile=sys_get_temp_dir().'/astronoches-swpc-hp.txt';
if(!is_file($hpFile)||time()-filemtime($hpFile)>300){ $ch=curl_init(SWPC.'text/aurora-nowcast-hemi-power.txt'); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'AstroNoches/1.0']); $txt=curl_exec($ch); $st=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch); if($txt!==false&&$st<400) @file_put_contents($hpFile,$txt,LOCK_EX); }
if(is_file($hpFile)) foreach(preg_split('/\r?\n/',(string)file_get_contents($hpFile)) as $line){
    if(!preg_match('/^(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+(\d+)\s+(\d+)/',$line,$m)) continue;
    $t=strtotime("$m[1] $m[2]:00 UTC"); if($t<time()-24*3600) continue;
    $hp[]=['t'=>$t*1000,'f'=>strtotime("$m[3] $m[4]:00 UTC")*1000,'north'=>(int)$m[5],'south'=>(int)$m[6]];
}
// Alertas, avisos y vigilancias de las últimas 72 h.
$alerts=[];
foreach(swpc('products/alerts.json',300)??[] as $a){
    $t=utc(str_replace(' ','T',substr($a['issue_datetime'],0,19))); if($t<time()-72*3600) continue;
    $msg=str_replace("\r",'',(string)$a['message']); $lines=array_values(array_filter(array_map('trim',explode("\n",$msg)),'strlen'));
    $title=''; foreach($lines as $l) if(preg_match('/^(ALERT|WARNING|WATCH|SUMMARY|EXTENDED WARNING|CANCEL[A-Z ]*):/i',$l)){ $title=$l; break; }
    $body=array_slice($lines,array_search($title,$lines,true)+1,8);
    $alerts[]=['t'=>$t*1000,'id'=>$a['product_id'],'title'=>$title?:($lines[3]??$a['product_id']),'body'=>array_values(array_filter($body,fn($l)=>!preg_match('/^(NOAA Space Weather Scale|www\.|Potential Impacts|Comment:\s*$)/i',$l)))];
}
json_response(['ok'=>true,
 'mag'=>$mag,'wind'=>$wind,'kp_forecast'=>$kpf,
 'kp_now'=>$kpNow?['t'=>utc($kpNow['time_tag'])*1000,'kp'=>(float)$kpNow['estimated_kp']]:null,
 'scales'=>$scales,
 'ovation'=>$ov?['observed'=>utc($ov['Observation Time'])*1000,'forecast'=>utc($ov['Forecast Time'])*1000,'cells'=>$oval]:null,
 'dst'=>$dst,'hp'=>$hp,'alerts'=>$alerts,
 'generated'=>time()*1000]);
