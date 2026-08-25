# 2. Marketing y Cartelera (`MarketingTab.tsx`)

Este módulo automatiza la planificación de cambio de pósters, marquesinas y banners físicos del cine al finalizar cada semana cinematográfica (miércoles por la noche / jueves por la mañana).

---

## ⚙️ Flujo Operativo y de Comparación

1. **Definición del Origen de Datos**:
   - **Modo Cargar Excels (`excel`)**: El usuario selecciona dos archivos Excel exportados desde el sistema de boletería (*Vista*), correspondientes a la semana anterior (jueves pasado a miércoles de ayer) y la semana actual (de este jueves al próximo miércoles).
   - **Modo Programación API (`programacion`)**: Lee los horarios consolidados directamente desde Firestore (`/showtimes`), permitiendo realizar la comparación de manera directa para la fecha seleccionada sin cargar archivos.

2. **Mapeo de Funciones a Formato Marketing**:
   - Las sesiones de cine se parsean y normalizan para agruparlas bajo nombres de póster legibles.
   - **Ejemplo de Regla de Normalización**: La función `"Minions 4 (3D) Subtitulada"` se convierte en `"MINIONS 4 3D SUB"`. Esto asegura que las variaciones horarias de una misma película no distorsionen la comparación física del póster.
   - Setea las salas del 1 al total de salas configurado (`salasCount`).

3. **Motor de Comparación de Cartelera (`compareMarketingWeeks`)**:
   - Compara las películas proyectadas en cada sala de la **Semana Anterior** versus la **Semana Actual**.
   - Clasifica las acciones físicas de la siguiente manera:
     - **Dejar**: Películas que continúan proyectándose en la misma sala. El póster físico no debe moverse.
     - **Salen (Retirar)**: Películas que dejan de proyectarse en esa sala. El póster debe ser retirado de las vitrinas.
     - **Nuevos (Colocar)**: Películas que inician proyección en esa sala. Se debe colocar su póster.
     - **Traslados (Movimientos de Sala)**: Si una película sale de la Sala 3 y entra en la Sala 5, el sistema lo identifica como un **traslado** (mover el póster existente de la Sala 3 a la 5) en lugar de ordenar la impresión o búsqueda de un póster nuevo.

4. **Cartelera: Primera Función del Jueves**:
   - Extrae de forma automática la primera película y el primer horario programado para el día Jueves (inicio de semana de estreno) para cada sala. Esto permite al equipo de operaciones y boletería conocer con precisión el orden de apertura de las salas.

5. **Listado de Eventos Especiales**:
   - Consulta la colección `/eventos` en Firestore buscando eventos especiales configurados para las próximas horas. Mapea la fecha y hora en formato legible (Ej. `"Jue 25 Jun 19:30"`) y los adjunta al reporte de marketing final.

6. **Generador e Impresión de PDF**:
   - Consolida los resultados de comparación (pósters que entran, salen, se trasladan), la cartelera del jueves y los eventos especiales.
   - Compila la información dentro de una plantilla HTML estilizada mediante `buildMarketingPrintHtml()`.
   - **Web**: Abre una ventana secundaria limpia de impresión y ejecuta `window.print()`.
   - **Móvil**: Genera un archivo `.pdf` en disco y lo comparte mediante las utilidades nativas del sistema operativo.

---

## 🗄️ Dependencias y Funciones Internas de Migración

- **`parseMarketingExcelFromArrayBuffer`** (`lib/marketing/excel`): Parsea celdas de hojas de cálculo buscando columnas de pantallas y películas.
- **`compareMarketingWeeks`** (`lib/marketing/compare`): Contiene los algoritmos de conjuntos (intersecciones y diferencias) para detectar películas entrantes, salientes y traslados.
- **`buildMarketingPrintHtml`** (`lib/marketing/print`): Plantilla HTML/CSS responsiva diseñada para ajustarse a hojas A4 impresas.
- **`getCineConfig`** (`lib/cineConfig`): Recupera el número total de salas del cine para limitar el bucle de comparación.
