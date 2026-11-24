# AstroNoches

Planificador astronómico y de astrofotografía para observación visual y fotografía nocturna. Proyecto independiente de mySky.

## Características de esta versión (0.5)
- Panel nocturno responsive con modo de visión roja.
- Ubicación configurable, con A Coruña como valor inicial.
- Carta celeste cenital y panorámica 360° reales y sincronizadas: ~1.600 estrellas hasta magnitud 5 (Yale BSC vía d3-celestial), constelaciones, Vía Láctea, Luna con su fase, planetas, objetos del catálogo, eclíptica y recorridos del Sol y la Luna (Astronomy Engine en el navegador).
- Deslizador de hora de la noche elegida (puesta → salida del Sol) con crepúsculos, animación, botón «Ahora» y enlace directo `?t=AAAA-MM-DDTHH:MM`.
- Mapa Leaflet del lugar a toda la tarjeta con radar de lluvia (RainViewer), viento (Open-Meteo) y nubes de satélite (EUMETSAT).
- Motor astronómico PyEphem: posiciones topocéntricas del Sol, la Luna y Mercurio–Saturno, iluminación/edad lunar y eventos de puesta/salida y crepúsculos civil, náutico y astronómico. Incluye respaldo JS aproximado si el motor no está instalado.
- Planificador básico de objetos con altura/azimut, ventana útil y separación lunar.
- Previsión meteorológica Open-Meteo ampliada: nubes altas, medias y bajas por separado, cobertura total hora a hora, selector de cuatro noches, precipitación, temperatura, humedad, viento y riesgo de condensación. Incluye mapa OpenStreetMap del lugar seleccionado.
- Base MariaDB para lugares, preferencias, catálogo, favoritos y sesiones.
- API PHP sencilla, sin framework ni dependencias Composer.

> La fuente principal de efemérides es PyEphem, ejecutado localmente en el servidor. Se usa altura geométrica sin refracción atmosférica; cerca del horizonte puede diferir de la altura aparente. El respaldo JavaScript sí es aproximado y se identifica en pantalla. No debe utilizarse para navegación.

## Requisitos
- PHP 8.1+ con PDO MySQL, cURL (o allow_url_fopen habilitado) y `proc_open` habilitado.
- Python 3.9+ y PyEphem (`sudo apt install python3 python3-ephem` en Debian).
- MariaDB 10.5+ o MySQL 8+.
- Apache 2.4 con `mod_rewrite` opcional.
- Navegador moderno con JavaScript habilitado.

## Instalación en Raspberry Pi
1. Descomprime en `/var/www/astronoches`.
2. Crea la base de datos: `sudo mariadb < database/schema.sql`.
3. Copia `app/config.example.php` a `app/config.php` y ajusta credenciales.
4. Instala el motor: `sudo apt install python3 python3-ephem`.
5. Activa PDO MySQL: `sudo apt install php-mysql` y reinicia Apache.
6. Abre la URL del virtual host.

El fichero `app/config.php` queda fuera del directorio público y no debe subirse al repositorio.

## Estructura
- `app/`: configuración y servicios internos.
- `database/`: esquema MariaDB y datos iniciales.
- `public/`: única raíz pública, API y recursos web.
- `public/vendor/`: Leaflet 1.9.4 y Astronomy Engine 2.1.19 servidos localmente.
- `public/assets/data/sky.json`: catálogo estelar y líneas de constelaciones (d3-celestial, BSD-3).
- `docs/`: notas de instalación, arquitectura y hoja de ruta.

## Seguridad
No publicar credenciales. Para producción, servir siempre por HTTPS, restringir permisos de escritura y limitar el acceso a endpoints administrativos. Las API públicas externas están sujetas a disponibilidad y límites de sus proveedores.
