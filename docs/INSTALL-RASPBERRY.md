# Instalación en Raspberry Pi (Debian)

Los comandos asumen que Apache y MariaDB ya están instalados. AstroNoches no modifica la configuración ni los datos de mySky.

```bash
sudo apt update
sudo apt install apache2 mariadb-server php php-mysql php-curl python3 python3-ephem
sudo mkdir -p /var/www/astronoches
sudo chown -R "$USER":www-data /var/www/astronoches
```

Copia el contenido del proyecto a `/var/www/astronoches` y crea la configuración:

```bash
cd /var/www/astronoches
cp app/config.example.php app/config.php
nano app/config.php
```

Crea una base de datos y un usuario dedicados (sustituye la contraseña):

```sql
sudo mariadb
CREATE DATABASE astronoches CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'astronoches_user'@'localhost' IDENTIFIED BY 'UNA_CLAVE_LARGA_Y_UNICA';
GRANT ALL PRIVILEGES ON astronoches.* TO 'astronoches_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Carga el esquema:

```bash
sudo mariadb astronoches < database/schema.sql
```

Edita `app/config.php` con los mismos datos de acceso. En Apache:

```bash
sudo cp docs/apache-vhost.conf /etc/apache2/sites-available/astronoches.conf
sudo a2ensite astronoches.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

Si no tienes DNS local para `astronoches.local`, accede usando la IP del Raspberry o añade el nombre al fichero `hosts` del equipo cliente. Si ya usas un virtual host para varios proyectos, integra únicamente `DocumentRoot` y el bloque `Directory` en tu configuración existente.

Comprueba que `app/config.php` no está dentro de `public/` y que Apache puede leer los ficheros. No des permisos `777`.

## Motor astronómico

La API `public/api/astronomy.php` invoca `app/astronomy/engine.py` y devuelve posiciones topocéntricas del Sol, la Luna y los cinco planetas clásicos mediante PyEphem. También calcula la iluminación y edad lunar, y los eventos de puesta/salida para horizonte, crepúsculo civil, náutico y astronómico. Se desactiva la refracción atmosférica (`pressure=0`) para que la altura geométrica sea consistente; cerca del horizonte la posición aparente puede diferir.

El usuario de Apache (`www-data`) necesita permiso de lectura y ejecución sobre `/usr/bin/python3` y el script. Comprueba la instalación con:

```bash
/usr/bin/python3 -c "import ephem; print(ephem.__version__)"
```

La interfaz usa el motor PyEphem como fuente principal. Si la API o la dependencia no están disponibles, conserva un cálculo JS aproximado como respaldo e indica esa circunstancia en la carta celeste.
