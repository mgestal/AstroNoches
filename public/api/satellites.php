<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/app/bootstrap.php';
// Elementos orbitales TLE de CelesTrak, con caché local de 2 h (CelesTrak pide no consultar más a menudo).
$groups=['visual'=>'Satélites brillantes','stations'=>'Estaciones espaciales','starlink'=>'Starlink','active'=>'Todos los activos'];
$group=(string)($_GET['group']??'visual');
if(!isset($groups[$group])) json_response(['ok'=>false,'error'=>'Grupo no válido'],400);
$cache=sys_get_temp_dir().'/astronoches-tle-'.$group.'.txt';
$maxAge=2*3600; $text=null; $stale=false;
if(is_file($cache) && time()-filemtime($cache)<$maxAge) $text=file_get_contents($cache);
if($text===null||$text===false){
    $url='https://celestrak.org/NORAD/elements/gp.php?'.http_build_query(['GROUP'=>$group,'FORMAT'=>'tle']);
    $data=false;
    if(function_exists('curl_init')){ $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>25,CURLOPT_USERAGENT=>'AstroNoches/1.0']); $data=curl_exec($ch); $st=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch); if($st>=400) $data=false; }
    if($data!==false && str_contains($data,"\n1 ")){ $text=$data; @file_put_contents($cache,$data,LOCK_EX); }
    elseif(is_file($cache)){ $text=file_get_contents($cache); $stale=true; }
    else json_response(['ok'=>false,'error'=>'No se pudo descargar el catálogo de CelesTrak'],502);
}
$lines=preg_split('/\r?\n/',trim((string)$text)); $sats=[];
for($i=0;$i+2<count($lines);$i++){
    $l1=$lines[$i+1]??''; $l2=$lines[$i+2]??'';
    if(!str_starts_with($l1,'1 ')||!str_starts_with($l2,'2 ')) continue;
    $sats[]=['name'=>trim($lines[$i]),'norad'=>(int)substr($l1,2,5),'l1'=>rtrim($l1),'l2'=>rtrim($l2)]; $i+=2;
}
json_response(['ok'=>true,'group'=>$group,'label'=>$groups[$group],'updated'=>gmdate('c',(int)@filemtime($cache)),'stale'=>$stale,'source'=>'CelesTrak','satellites'=>$sats]);
