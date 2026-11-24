<?php
declare(strict_types=1);
return [
    'app' => ['name'=>'AstroNoches','timezone'=>'Europe/Madrid','debug'=>false],
    'database' => ['host'=>'localhost','port'=>3306,'name'=>'astronoches','user'=>'astronoches_user','password'=>'CAMBIAR_ESTA_CLAVE','charset'=>'utf8mb4'],
    'defaults' => ['latitude'=>43.3623,'longitude'=>-8.4115,'location_name'=>'A Coruña','elevation_m'=>20],
    'astronomy' => ['python'=>'/usr/bin/python3'],
];
