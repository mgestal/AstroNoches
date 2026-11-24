<?php
declare(strict_types=1); require_once dirname(__DIR__,2).'/app/bootstrap.php';
try { $q=trim((string)($_GET['q']??'')); $sql='SELECT id,catalog,catalog_id,common_name,object_type,ra_deg,dec_deg,magnitude,season_notes FROM celestial_objects'; $args=[]; if($q!==''){ $sql.=' WHERE common_name LIKE ? OR catalog_id LIKE ? OR object_type LIKE ?'; $like='%'.$q.'%'; $args=[$like,$like,$like]; } $sql.=' ORDER BY magnitude IS NULL,magnitude,common_name LIMIT 100'; $st=db()->prepare($sql);$st->execute($args);json_response(['objects'=>$st->fetchAll()]); }
catch(Throwable $e){ error_log('AstroNoches catalog: '.$e->getMessage()); json_response(['error'=>'No se pudo consultar el catálogo'],503); }
