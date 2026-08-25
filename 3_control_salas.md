# 3. Control e Inspección de Salas (`ControlSalasScreen.tsx`)

Este módulo proporciona una interfaz gráfica e interactiva para relevar roturas de butacas en tiempo real dentro del cine y configurar la disposición física (distribución de asientos) de cada una de las salas.

---

## 📐 1. Modelo de Disposición de Salas (Layouts)

Cada sala se representa mediante una cuadrícula (grid) bidimensional:
- **Filas (`rows`)**: Arreglo de letras ordenadas (ej. `["A", "B", "C", "D", "E"]`).
- **Columnas**: Número de columna física (`colIndex`) del 1 al máximo configurado (`maxCol`).
- **Pasillos (`aisles`)**: Índices de columnas que representan pasillos de circulación vertical (vacíos de butacas).
- **Tipos de Celda**:
  - `seat`: Butaca estándar.
  - `dbox`: Butaca especial con movimiento D-BOX (destacada en color morado).
  - `empty`: Espacio vacío, pasillo o columna sin butacas físicas.

---

## 🛠️ 2. Flujo de Inspección y Reporte de Butacas

1. **Escucha en Vivo (Real-time Sync)**:
   - Al seleccionar una sala, el componente se suscribe al documento de Firestore `/control_salas/active` utilizando `onSnapshot`.
   - Cualquier butaca reportada como rota por otro inspector en la sala se resalta de inmediato en color **Rojo** en la pantalla de todos los usuarios conectados.

2. **Registro de Fallas en Butaca**:
   - Al hacer click sobre una butaca, se abre un modal con opciones estructuradas:
     - **Respaldo** roto (checkbox).
     - **Asiento** roto (checkbox).
     - **Apoyabrazos** roto/dañado (checkbox).
     - **Observaciones extra** (campo de texto).
   - **Lógica de Guardado**:
     - Si se activa al menos una falla, guarda el objeto en el reporte activo indexado por la clave del asiento: `{ [salaId]: { "E-10": { respaldo: true, asiento: false, apoyabrazos: true, detalles: "Flojo" } } }`.
     - Si se desmarcan todas las opciones y se borra el texto, el sistema elimina de forma automática la butaca del listado de problemas.
     - Graba la información en Firestore, registrando el correo del usuario inspector (`updatedBy`) y el timestamp (`updatedAt`).

3. **Reportes Generales**:
   - Además de reportar butacas individuales, permite registrar observaciones generales de la sala (problemas con la pantalla, sonido, limpieza, temperatura, etc.).
   - Se guardan como un listado de cadenas de texto en `generalIssues[salaId]`.

4. **Reinicio de Reporte**:
   - El administrador del cine puede reiniciar todo el reporte de todas las salas (acción típica al iniciar o finalizar una jornada) previa confirmación de seguridad en pantalla. Setea la base de datos a un estado vacío.

---

## 📐 3. Editor de Distribución de Butacas (Layout Editor)

Permite ajustar los mapas de las salas de forma visual para que coincidan con la arquitectura real de cada cine.

- **Parámetros Editables**:
  - Listado de filas (letras separadas por coma).
  - Ancho máximo (número de columnas).
  - Columnas de pasillo vertical (números de columnas que serán tratadas como espacios vacíos).
  - Orientación invertida (permite numerar de izquierda a derecha o de derecha a izquierda).
- **Herramienta de Pintar (Paint Tool)**:
  - **Pintar Espacio Vacío (`empty`)**: Remueve la butaca del casillero haciendo click sobre ella en la grilla.
  - **Pintar D-BOX (`dbox`)**: Convierte una butaca estándar en D-BOX.
  - **Pintar Butaca Estándar (`seat`)**: Restablece el casillero a butaca estándar.
  - **Modificar Número (`number`)**: Abre un cuadro de diálogo para inyectar un número de butaca personalizado (para salas con saltos de numeración o asientos de discapacitados).
- **Persistencia**: Guarda la configuración personalizada en `/cines/[cineId]/salas_layouts/[salaId]`. Si no existe configuración en Firestore, el sistema autodetecta y levanta layouts estáticos por defecto definidos en el código (salas 1 a 12 de Cinemark).

---

## 🔌 Lógica de Auto-Migración

Para facilitar la adopción rápida en un nuevo cine sin configurar las salas manualmente de antemano:
- Al iniciar la pantalla, consulta si existe la configuración de la Sala 1 en `/salas_layouts/1`.
- Si no existe (primer inicio del cine), recorre las 12 salas, convierte sus layouts definidos por código al formato JSON de base de datos y los escribe automáticamente en Firestore.
- A partir de ese momento, la aplicación lee siempre los layouts editables de Firestore.
