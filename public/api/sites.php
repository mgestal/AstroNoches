<?php
declare(strict_types=1); require_once dirname(__DIR__,2).'/app/bootstrap.php';
/* Lugares de observación: GET lista · POST crea · PUT edita (id en el cuerpo) · DELETE ?id= borra */
function site_fields(array $v): array {
 $name=trim((string)($v['name']??'')); $lat=filter_var($v['latitude']??null,FILTER_VALIDATE_FLOAT); $lon=filter_var($v['longitude']??null,FILTER_VALIDATE_FLOAT);
 if(!preg_match('/^.{1,120}$/u',$name)||$lat===false||$lon===false||$lat===null||$lon===null||abs($lat)>90||abs($lon)>180) json_response(['error'=>'Nombre o coordenadas no válidas'],422);
 return [$name,$lat,$lon];
}
try {
 $m=$_SERVER['REQUEST_METHOD'];
 if($m==='GET') json_response(['sites'=>db()->query('SELECT id,name,latitude,longitude,elevation_m,timezone,is_default FROM observing_sites ORDER BY is_default DESC,name')->fetchAll()]);
 if($m==='POST') {
  $v=input_json(); [$name,$lat,$lon]=site_fields($v);
  $q=db()->prepare('INSERT INTO observing_sites(name,latitude,longitude,elevation_m,timezone,is_default) VALUES(?,?,?,?,?,0)'); $q->execute([$name,$lat,$lon,(int)($v['elevation_m']??0), in_array($v['timezone']??null,timezone_identifiers_list(),true)?$v['timezone']:'Europe/Madrid']); json_response(['ok'=>true,'id'=>(int)db()->lastInsertId()],201);
 }
 if($m==='PUT') {
  $v=input_json(); $id=filter_var($v['id']??null,FILTER_VALIDATE_INT); if(!$id) json_response(['error'=>'Lugar no indicado'],422);
  [$name,$lat,$lon]=site_fields($v);
  $q=db()->prepare('UPDATE observing_sites SET name=?,latitude=?,longitude=? WHERE id=?'); $q->execute([$name,$lat,$lon,$id]);
  $e=db()->prepare('SELECT COUNT(*) FROM observing_sites WHERE id=?'); $e->execute([$id]); if(!$e->fetchColumn()) json_response(['error'=>'El lugar no existe'],404);
  json_response(['ok'=>true,'id'=>$id]);
 }
 if($m==='DELETE') {
  $id=filter_var($_GET['id']??null,FILTER_VALIDATE_INT); if(!$id) json_response(['error'=>'Lugar no indicado'],422);
  $pdo=db(); $pdo->beginTransaction();
  $s=$pdo->prepare('SELECT is_default FROM observing_sites WHERE id=? FOR UPDATE'); $s->execute([$id]); $row=$s->fetch();
  if(!$row){ $pdo->rollBack(); json_response(['error'=>'El lugar no existe'],404); }
  if((int)$pdo->query('SELECT COUNT(*) FROM observing_sites')->fetchColumn()<=1){ $pdo->rollBack(); json_response(['error'=>'No se puede borrar el único lugar guardado'],409); }
  $pdo->prepare('DELETE FROM observing_sites WHERE id=?')->execute([$id]);
  if((int)$row['is_default']) $pdo->exec('UPDATE observing_sites SET is_default=1 ORDER BY id LIMIT 1');
  $pdo->commit(); json_response(['ok'=>true]);
 }
 json_response(['error'=>'Método no permitido'],405);
} catch(Throwable $e) { error_log('AstroNoches sites: '.$e->getMessage()); json_response(['error'=>'No se pudo acceder a los lugares'],503); }
