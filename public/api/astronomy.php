<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/app/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$lat=filter_input(INPUT_GET,'lat',FILTER_VALIDATE_FLOAT);
$lon=filter_input(INPUT_GET,'lon',FILTER_VALIDATE_FLOAT);
$elevation=filter_input(INPUT_GET,'elevation',FILTER_VALIDATE_INT);
$datetime=(string)($_GET['datetime']??'');
$timezone=(string)($_GET['timezone']??'Europe/Madrid');
if($lat===false||$lat===null||$lon===false||$lon===null||$lat < -90||$lat > 90||$lon < -180||$lon > 180){http_response_code(400);echo json_encode(['error'=>'Coordenadas no válidas']);exit;}
try{$tz=new DateTimeZone($timezone);$dt=new DateTimeImmutable($datetime?:'now',$tz);}catch(Throwable $e){http_response_code(400);echo json_encode(['error'=>'Fecha u zona horaria no válidas']);exit;}
$payload=json_encode(['lat'=>$lat,'lon'=>$lon,'elevation'=>$elevation?:0,'datetime'=>$dt->format(DateTimeInterface::ATOM),'timezone'=>$timezone],JSON_THROW_ON_ERROR);
$python=app_config()['astronomy']['python']??'/var/www/astronoches/venv/bin/python';
$script=dirname(__DIR__,2).'/app/astronomy/engine.py';
if(!is_executable($python))$python='/usr/bin/python3';
$proc=proc_open([$python,$script],[['pipe','r'],['pipe','w'],['pipe','w']],$pipes);
if(!is_resource($proc)){http_response_code(503);echo json_encode(['error'=>'No se pudo iniciar el motor astronómico']);exit;}
fwrite($pipes[0],$payload);fclose($pipes[0]);$stdout=stream_get_contents($pipes[1]);fclose($pipes[1]);$stderr=stream_get_contents($pipes[2]);fclose($pipes[2]);$code=proc_close($proc);
if($code!==0){http_response_code(503);echo json_encode(['error'=>'Fallo del motor astronómico','detail'=>trim($stderr)]);exit;}
http_response_code(200);echo $stdout;
