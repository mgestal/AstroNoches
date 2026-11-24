# Motor astronómico

## Arquitectura

- `public/api/astronomy.php`: valida coordenadas, fecha y zona horaria; ejecuta el motor local y devuelve JSON.
- `app/astronomy/engine.py`: cálculo con PyEphem de Sol, Luna, Mercurio, Venus, Marte, Júpiter y Saturno.
- `public/assets/js/app.js`: consume la API y representa las posiciones; usa el cálculo JS anterior únicamente como respaldo.

## Magnitudes devueltas

Para cada cuerpo se devuelven ascensión recta, declinación, altura geométrica, azimut, distancia geocéntrica en UA cuando PyEphem la proporciona y magnitud aparente cuando está disponible. Para la Luna se devuelve porcentaje iluminado, edad desde la última luna nueva y fase nominal.

Los eventos se calculan para la fecha local elegida: puesta y salida del Sol, y los límites de crepúsculo civil (-6°), náutico (-12°) y astronómico (-18°). La interfaz presenta la ventana astronómica vespertina-nocturna.

## Convenciones y límites

- Coordenadas geográficas WGS84 en grados decimales; longitud este positiva.
- La zona horaria se proporciona explícitamente (por defecto `Europe/Madrid`).
- Se fija presión atmosférica a cero: las alturas son geométricas y no incluyen refracción.
- PyEphem ofrece efemérides astronómicas de buena precisión para planificación, pero conviene contrastar casos límite con JPL Horizons antes de etiquetar la aplicación como herramienta científica.
- En latitudes extremas algunos eventos no existen; la API devuelve `null` para esos eventos.
