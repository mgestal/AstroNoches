<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/app/bootstrap.php';
$lat=filter_input(INPUT_GET,'lat',FILTER_VALIDATE_FLOAT); $lon=filter_input(INPUT_GET,'lon',FILTER_VALIDATE_FLOAT);
if($lat===false||$lat===null||$lon===false||$lon===null||abs($lat)>90||abs($lon)>180) json_response(['error'=>'Coordenadas no válidas'],400);

function fetch_json(string $url): ?array {
    $data=false;
    if(function_exists('curl_init')){ $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_USERAGENT=>'AstroNoches/1.0']); $data=curl_exec($ch); $status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch); if($status>=400) $data=false; }
    if($data===false){ $ctx=stream_context_create(['http'=>['timeout'=>10,'header'=>"User-Agent: AstroNoches/1.0\r\n"]]); $data=@file_get_contents($url,false,$ctx); }
    if($data===false) return null;
    $v=json_decode($data,true); return is_array($v)&&!isset($v['error'])?$v:null;
}

// Modelo base (best match): incluye probabilidad de lluvia y visibilidad.
$base=fetch_json('https://api.open-meteo.com/v1/forecast?'.http_build_query(['latitude'=>$lat,'longitude'=>$lon,
    'hourly'=>'temperature_2m,relative_humidity_2m,dew_point_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,wind_speed_10m,wind_direction_10m,visibility',
    'daily'=>'sunrise,sunset','forecast_days'=>5,'past_days'=>1,'timezone'=>'auto']));
if($base===null) json_response(['error'=>'No se pudo consultar Open-Meteo'],502);

// Météo-France AROME/ARPEGE: prioritario para nubes, humedad, viento y temperatura cuando hay dato.
$merged=0;
$fr=fetch_json('https://api.open-meteo.com/v1/meteofrance?'.http_build_query(['latitude'=>$lat,'longitude'=>$lon,
    'hourly'=>'temperature_2m,relative_humidity_2m,dew_point_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m',
    'forecast_days'=>4,'past_days'=>1,'timezone'=>'auto']));
if($fr && isset($fr['hourly']['time'])){
    $idx=array_flip($fr['hourly']['time']);
    foreach($base['hourly']['time'] as $i=>$t){
        if(!isset($idx[$t])) continue; $j=$idx[$t]; $hit=false;
        foreach(['cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','relative_humidity_2m','wind_speed_10m','wind_direction_10m','temperature_2m','dew_point_2m'] as $k){
            $v=$fr['hourly'][$k][$j]??null; if($v!==null){ $base['hourly'][$k][$i]=$v; $hit=true; }
        }
        if($hit) $merged++;
    }
}
$base['source']=$merged>0?'Météo-France AROME/ARPEGE':'modelos regionales automáticos';
$base['fetched_at']=gmdate('c');
json_response($base);
