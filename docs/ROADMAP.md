# Hoja de ruta AstroNoches

## Incluido en la base ampliada
- Panel responsive y modo de visión roja.
- Selección de fecha y ubicación guardable en MariaDB.
- Motor PyEphem integrado para Sol, Luna y planetas clásicos; fase/edad lunar y eventos de crepúsculos.
- Carta cenital vectorial y horizonte panorámico 360° esquemático.
- Previsión horaria Open-Meteo y estimación de riesgo de rocío.
- Catálogo inicial Messier y planificación básica de objetivos.

## Siguientes hitos
1. Validar sistemáticamente el motor PyEphem frente a JPL Horizons para distintas fechas, latitudes altas y cambios de horario.
2. Añadir catálogo estelar completo, constelaciones y líneas de referencia.
3. Mejorar panorama 360° con horizonte real por ubicación y alturas de obstáculos configurables.
4. Calcular ventanas de captura por altura mínima, oscuridad, Luna, tránsito y duración.
5. Añadir calendario mensual, comparación de noches, favoritos y registro de sesiones.
6. Incorporar mapas de contaminación lumínica y perfiles de equipo fotográfico.

## Precisión
La fuente principal de posiciones y eventos es PyEphem. El cálculo JavaScript se conserva como respaldo aproximado. Las alturas se expresan sin refracción atmosférica. Los datos meteorológicos proceden de Open-Meteo y pueden diferir de las condiciones reales locales.


## Actualización 0.4 · Previsión de nubosidad
- Incorporadas las capas de nubes altas, medias y bajas de Open-Meteo.
- Vista horaria de cobertura total y resumen para cuatro noches consecutivas.
- Indicador orientativo de calidad de la noche y tramo horario menos nuboso.
- Mapa OpenStreetMap centrado en el lugar de observación seleccionado.
