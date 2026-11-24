<?php
declare(strict_types=1);
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) { http_response_code(500); exit('Falta app/config.php. Copia config.example.php y configura MariaDB.'); }
$config = require $configFile;
date_default_timezone_set($config['app']['timezone'] ?? 'Europe/Madrid');
function app_config(): array { global $config; return $config; }
function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = app_config()['database'];
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s',$c['host'],$c['port'],$c['name'],$c['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn,$c['user'],$c['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    return $pdo;
}
function json_response(array $data, int $status=200): never { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); exit; }
function input_json(): array { $raw=file_get_contents('php://input'); if(!$raw)return []; $v=json_decode($raw,true); return is_array($v)?$v:[]; }
