# Copa Internacional Murano 2026 · U16 — Marcador

App web para llevar el conteo del torneo de 36 equipos (Copa Oro, Plata y Bronce).

## Cómo usarla

Abre `app/index.html` con doble clic (Chrome, Edge, etc.). No necesita internet ni instalación.

- **Partidos:** toca un partido, escribe los puntos de cada set y presiona Enter. Los sets ganados, la tabla, las copas, los triangulares y los play-offs se calculan solos.
- **Ajustes → Equipos:** cambia el nombre del "Por confirmar (Cupo 27)" cuando se confirme.
- **Ajustes → Respaldo:** descarga un `.json` al terminar cada jornada.
- **Ajustes → Modo demo:** prueba la app con datos inventados sin tocar los reales.

Los datos se guardan en el navegador y el computador donde se abre. Para usarla en otro equipo: descargar respaldo → cargarlo allá.

## Reglas implementadas (según el dossier)

- Fase 1: 9 grupos de 4, todos contra todos. Tabla general 1°–36° por posición en el grupo, puntos, diferencia de sets y diferencia de puntos.
- Copas: Oro 1°–12°, Plata 13°–24°, Bronce 25°–36°.
- Fase 2: 12 triangulares con siembra en serpentina y regla de protección de rival.
- Fase 3: semifinales y finales de posición (puesto exacto 1°–36°).

Supuestos que el dossier no define (configurables en Ajustes): puntos de tabla 2/1/0, partidos al mejor de 3 sets (Gran Final de Oro a 5), W.O. como 0-2 con 25-0, desempate por resultado directo y luego orden manual.

## Desarrollo

```
node --test tests/        # pruebas del motor de cálculo
node tools/serve.js       # servidor local opcional en http://localhost:5173
```

`app/js/data.js` se generó desde `Fixture_Copa_Murano_2026_Ajustado.xlsx`; `app/js/engine.js` contiene todas las reglas.
