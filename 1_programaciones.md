# 1. Programaciones (`ProgramacionTab.tsx`)

Esta pantalla administra la carga y el procesamiento del calendario semanal de funciones y películas del cine, permitiendo generar hojas de programación diarias optimizadas y formateadas para impresión física.

---

## ⚙️ Flujo Operativo y de Procesamiento

1. **Selección del Archivo Fuente**:
   - El usuario carga el reporte de programación semanal exportado desde el sistema operativo del cine (*Vista*).
   - Se admiten dos formatos: archivos Excel (`.xlsx`/`.xls`) y archivos PDF (`sessionByScreen.pdf`).
   - El componente utiliza `DocumentPicker` de Expo para obtener la URI del archivo local.

2. **Extracción Automática de Fechas e Información**:
   - **Excel**: Llama a `parseWeeklyProgrammingExcel(uri)`. Lee el archivo, detecta la fecha del jueves inicial de la semana en la cabecera del reporte y procesa las filas mapeando salas, títulos de películas, formatos de proyección (2D, 3D, XD, D-BOX) y los horarios de funciones para cada día de la semana.
   - **PDF**: Llama a `parseWeeklyProgrammingPDF(uri)`. Realiza un parseo de texto por expresiones regulares sobre el contenido del PDF para extraer las mismas variables.
   - Si no se detecta la fecha de inicio, calcula por defecto el jueves más cercano al día de hoy.

3. **Persistencia Automática en la Nube (Auto-Save)**:
   - Al procesar el archivo por primera vez y gatillar una acción de generación, el sistema guarda de forma automática la estructura limpia de películas y horarios en **Firebase Firestore**:
     - Ruta actual: `/cines/[cineId]/programacion_semanal/actual`
     - Ruta histórica: `/cines/[cineId]/programacion_semanal/[YYYY-MM-DD]` (donde YYYY-MM-DD es la fecha del jueves de inicio).
   - **Optimización**: Al guardar con éxito en Firestore, el script limpia el archivo temporal de memoria (`weeklyUri = null`) y activa el estado `useSavedWeekly = true`. Esto permite que cualquier terminal o dispositivo del cine acceda a la misma programación sin necesidad de volver a subir el archivo.

4. **Configuración de Reporte y Generación de Excel**:
   - **Día de Programación**: El usuario selecciona el día de la semana a generar (jueves, viernes, sábado, etc.). El script calcula la fecha real sumando el offset correspondiente a partir del jueves inicial (Jueves = +0, Viernes = +1, Sábado = +2, etc.).
   - **División por Pisos (Opcional)**: Permite particionar las salas en diferentes niveles físicos del cine (ej. Piso 1: Salas 1 a 6; Piso 2: Salas 7 a 12).
   - **Generación de Reporte**:
     - Llama a `generateProgramacionWorkbook()` (para un día específico) o a `generateWeeklyProgramacionWorkbook()` (para el reporte semanal consolidado).
     - Si se activa la división por pisos, escribe los horarios correspondientes a cada piso en hojas separadas dentro del mismo libro, formateando las celdas para que al imprimir en modo **Doble Cara (Voltear por el lado largo)** el Piso 1 quede al frente y el Piso 2 al dorso de una única hoja A4.
   - **Descarga**: En la web genera un Blob y dispara una descarga clásica. En móviles utiliza la API `Sharing` de Expo para abrir el menú nativo de compartir/guardar en dispositivo.

---

## 🗄️ Dependencias y Funciones Internas de Migración

Si vas a recrear esta pantalla, debes migrar las siguientes funciones del lado del cliente:

- **`parseWeeklyProgrammingExcel`** y **`generateProgramacionWorkbook`** (`lib/programacion/excel`): Parseador SheetJS y generador de XLS que inyecta bordes, colores del tema, formatos de celdas y fórmulas.
- **`parseWeeklyProgrammingPDF`** (`lib/programacion/pdf`): Parser que decodifica streams de texto de PDF en estructuras JSON de salas/horarios.

### Estructura de un Documento de Programación en Firestore:
```json
{
  "startDate": "2026-06-25",
  "savedAt": "2026-06-25T14:32:00.000Z",
  "weeklyRows": [
    {
      "movieName": "MINIONS 4 2D CAS",
      "theaterRoom": "1",
      "sessionFormat": "2D",
      "language": "CAS",
      "showtimes": {
        "jueves": ["14:00", "16:15", "18:30", "20:45"],
        "viernes": ["14:00", "16:15", "18:30", "20:45", "23:00"],
        ...
      }
    }
  ]
}
```
