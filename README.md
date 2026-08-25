# Módulo de Servicios - Guía de Migración

Este directorio (`serviciosMigracion`) contiene la documentación técnica detallada y los archivos de código fuente correspondientes a la pestaña de **Servicios** (el "ServiciosScreen" virtual) de la aplicación **cinemark-app** (proyecto `proyeccion-app`).

---

## 📂 ¿Qué contiene la pestaña de Servicios?

La pestaña de **Servicios** es un módulo administrativo crítico de la aplicación. Renders 3 sub-pestañas o pantallas operativas principales diseñadas para coordinar la programación de películas y el control físico de las salas.

Los módulos documentados son:

1. **[1. Programaciones (`ProgramacionTab.tsx`)](file:///home/julian/vacas-locas/serviciosMigracion/1_programaciones.md)**:
   - Ingesta y parseo de reportes semanales de programación de películas (desde archivos Excel `.xlsx` o PDFs `sessionByScreen.pdf` generados por el sistema de cine *Vista*).
   - Generación de reportes diarios de programación formateados y divididos por niveles (pisos).
   - Persistencia automática de programaciones en Firebase Firestore.

2. **[2. Marketing (`MarketingTab.tsx`)](file:///home/julian/vacas-locas/serviciosMigracion/2_marketing.md)**:
   - Comparación semana a semana de la cartelera por sala para determinar qué pósters se deben cambiar.
   - Detección de pósters a retirar (salidas), nuevos pósters a colocar (entradas) y traslados de salas.
   - Reporte de la primera función del jueves por sala.
   - Integración con eventos locales de Firestore para su impresión.

3. **[3. Control de Salas (`ControlSalasScreen.tsx`)](file:///home/julian/vacas-locas/serviciosMigracion/3_control_salas.md)**:
   - Visualización interactiva del mapa de butacas de cada una de las 12 salas del cine.
   - Registro en tiempo real de butacas defectuosas (respaldos, asientos o apoyabrazos rotos).
   - Editor integrado para crear y modificar distribuciones (layouts) de salas: cambiar números de butaca, agregar pasillos, filas, columnas, definir butacas D-Box y espacios vacíos.

---

## 💻 Código Fuente Incluido para Migración (`/code`)

Para facilitar la migración directa de la lógica, se han adjuntado los archivos fuente y las librerías auxiliares en la carpeta `code/`:

### Pantallas / Vistas (`code/screens/`)
- **[ProgramacionTab.tsx](file:///home/julian/vacas-locas/serviciosMigracion/code/screens/ProgramacionTab.tsx)**: Interfaz de carga de reportes, días de programación y configuración de pisos.
- **[MarketingTab.tsx](file:///home/julian/vacas-locas/serviciosMigracion/code/screens/MarketingTab.tsx)**: Interfaz de comparación de cartelera semanal y exportación a PDF.
- **[ControlSalasScreen.tsx](file:///home/julian/vacas-locas/serviciosMigracion/code/screens/ControlSalasScreen.tsx)**: Interfaz gráfica de planos de butacas, inspección y editor de mapas.

### Librerías Auxiliares y Lógica de Negocio (`code/lib/`)
- **[cineConfig.ts](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/cineConfig.ts)**: Recuperación de cantidad de salas por cine.
- **[dbService.ts](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/dbService.ts)** y **[firebaseConfig.ts](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/firebaseConfig.ts)**: Configuración y utilidades de base de datos Firebase.
- **[theme.ts](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/theme.ts)**: Paleta de colores e identificadores de estilos UI.
- **[useAuthUser.ts](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/useAuthUser.ts)**: Hook de autenticación de usuario (cineId, email, etc.).
- **Carpeta [marketing/](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/marketing)**:
  - `compare.ts`: Algoritmo de comparación de carteleras e identificación de traslados/cambios.
  - `excel.ts`: Parser de celdas de Excel para cartelera.
  - `print.ts`: Plantilla de generación de PDF/HTML del reporte de marketing.
  - `types.ts`: Tipados de TypeScript para marketing.
- **Carpeta [programacion/](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/programacion)**:
  - `excel.ts`: Parser de reportes semanales y generador de XLS diario con diseño de impresión y soporte de niveles/pisos.
  - `pdf.ts`: Decodificador y procesador Regex para leer PDFs de programación de Vista.
  - `types.ts`: Tipados de TypeScript para programación y pisos.

---

## 🗄️ Estructura de Datos en Firebase Firestore

Para que otra página o aplicación pueda adoptar estas tareas, debe conectarse a las siguientes colecciones y estructuras de Firestore:

| Colección / Ruta en Firestore | Uso del Módulo | Datos Almacenados |
| :--- | :--- | :--- |
| `/cines/[cineId]/programacion_semanal/actual` | **Programación** | Objeto JSON con el listado de películas semanales, fecha de inicio (`startDate`) y timestamp. |
| `/cines/[cineId]/programacion_semanal/[YYYY-MM-DD]` | **Programación** | Histórico de programaciones semanales guardadas por su fecha de inicio. |
| `/cines/[cineId]/showtimes/[YYYY-MM-DD]` | **Marketing (API)** | Sesiones y horarios consumidos directamente de la API de Cinemark para realizar comparaciones automáticas. |
| `/cines/[cineId]/eventos` | **Marketing** | Lista de eventos especiales programados (título, sala, fecha/hora) para adjuntar al plan impreso. |
| `/cines/[cineId]/control_salas/active` | **Control de Salas** | Reporte activo de butacas rotas por sala: `{ issues: { [salaId]: { "F-12": { respaldo: true, asiento: false... } } } }`. |
| `/cines/[cineId]/salas_layouts/[salaId]` | **Control de Salas** | Estructura física personalizada de cada sala: cantidad de filas, columnas, pasillos, tipos de butaca (Dbox, vacías) y numeración personalizada. |

---

## 📦 Librerías y Dependencias Frontend Requeridas

Si vas a migrar estos componentes de React Native/Expo a un proyecto web tradicional (React/Next.js) o a otra plataforma móvil, requerirás adoptar las siguientes dependencias clave o equivalentes:

- **Ingesta de Documentos (Document Picker)**: `expo-document-picker` (en la web se puede migrar a un `<input type="file">` tradicional).
- **Procesamiento de Excel**: Librerías de manejo de archivos de hojas de cálculo (ej. `xlsx`/SheetJS) para leer buffers de arrays y construir archivos.
- **Generación de PDFs e Impresión**: `expo-print` y `expo-sharing` (en la web se utiliza directamente `window.print()` inyectando código HTML personalizado).
- **Iconografía**: `MaterialCommunityIcons` (de `@expo/vector-icons`).
