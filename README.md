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

## 🔌 Capa de Abstracción de Base de Datos (`code/lib/dbService.ts`)

> [!IMPORTANT]
> **Relevancia para la migración de base de datos**:
> Si vas a utilizar una base de datos propia distinta a Firebase, **no debes eliminar `dbService.ts`**.
>
> Este archivo actúa como una capa de abstracción intermedia (Patrón Repositorio / Middleware). Actualmente intercepta las llamadas estándar de Firestore en las pantallas (como `collection()`, `doc()`, `getDoc()`, `setDoc()`, `onSnapshot()`) y hace lo siguiente:
> 1. Si detecta que la API REST local (Node/Docker) está activa, **traduce las consultas de la base de datos a peticiones HTTP `fetch` (JSON)** enviando tokens JWT para autorización.
> 2. Si el servidor local no responde, activa un modo de respaldo (`fallbackModeActive = true`) y realiza las consultas directamente al SDK de Firebase Firestore.
>
> **Recomendación de migración**: Si el nuevo desarrollador quiere conectar la aplicación a un backend personalizado (como Node+PostgreSQL o Spring Boot+MySQL), **solo debe modificar el archivo `dbService.ts`** para que las llamadas apunten a sus nuevos endpoints. De esta forma, **no tendrá que modificar una sola línea de código en las pantallas de la interfaz (`ProgramacionTab`, `MarketingTab`, `ControlSalasScreen`)**, ya que estas seguirán consumiendo las mismas funciones de acceso a datos expuestas por este servicio.
>
> El archivo complementario **[firebaseConfig.ts](file:///home/julian/vacas-locas/serviciosMigracion/code/lib/firebaseConfig.ts)** únicamente inicializa el SDK de Firebase (Auth y Firestore) que sirve como respaldo secundario y almacena nombres de constantes globales.
