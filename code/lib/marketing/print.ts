import { MarketingCompareResult, EventoForPrint } from "./types";

function esc(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildEventosHtml(eventos?: EventoForPrint[]): string {
  if (!eventos || !eventos.length) {
    return `<div class="muted">No hay eventos próximos cargados.</div>`;
  }

  return eventos
    .map((ev) => {
      const salaDisplay =
        ev.sala.toUpperCase() === "AC"
          ? `<span class="evento-sala-ac">A confirmar</span>`
          : `Sala ${esc(ev.sala)}`;

      return `
        <div class="evento-item">
          <div class="evento-title">${esc(ev.pelicula)}</div>
          <div class="evento-meta">${salaDisplay} · ${esc(ev.fecha)} · ${esc(ev.hora)}</div>
        </div>
      `;
    })
    .join("");
}

export function buildMarketingPrintHtml(
  result: MarketingCompareResult,
  _opts?: {
    semanaAnteriorLabel?: string;
    semanaActualLabel?: string;
    generadoPor?: string;
  },
  eventos?: EventoForPrint[]
): string {
  const carteleraEntries = Object.entries(result.ponerEnCarteleraPorSala || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const carteleraHtml = carteleraEntries.length
    ? `<ul>${carteleraEntries
        .map(
          ([sala, pelicula]) =>
            `<li><strong>Sala ${esc(sala)}</strong>: ${esc(
              pelicula || "Sin dato"
            )}</li>`
        )
        .join("")}</ul>`
    : `<div class="muted">Sin datos de cartelera.</div>`;

    const nuevosHtml = result.summary.postersNuevosGlobales.length
    ? `<div class="new-items-grid">${result.summary.postersNuevosGlobales
        .map((p) => {
          const hasMovement = !!p.possibleSourceSalas?.length;
  
          return `
            <div class="movement-card compact ${hasMovement ? "has-movement" : "is-new"}">
              <div class="movement-card-row">
                <div class="movement-main">
                  <div class="movement-title">
                    ${esc(p.pelicula)} <span class="muted">x${p.cantidad} → ${
                      p.cantidad === 1 ? "Sala" : "Salas"
                    } ${p.salas.join(", ")}</span>
                  </div>
  
                  ${
                    hasMovement
                      ? `<div class="movement-subtitle muted">
                          Puede moverse de sala ${esc(
                            p.possibleSourceSalas!.join("/")
                          )}${
                            p.cantidad > p.possibleSourceSalas!.length
                              ? ` - Bajar ${p.cantidad - p.possibleSourceSalas!.length} sí o sí de marketing`
                              : p.possibleSourceSalas!.length > p.cantidad
                              ? ` - Devolver ${p.possibleSourceSalas!.length - p.cantidad} a marketing`
                              : ""
                          }
                        </div>`
                      : ``
                  }
                </div>
  
                ${
                  hasMovement
                    ? `<div class="check-tall-box">
                        <span class="check-tall-item">☐ Nuevo</span>
                        <span class="check-tall-item">☐ Movimiento</span>
                      </div>`
                    : `<div class="new-inline-badge">Nuevo</div>`
                }
              </div>
            </div>
          `;
        })
        .join("")}</div>`
    : `<div class="muted">No hay nuevos o movimientos.</div>`;

  const salenCarteleraHtml = result.summary.postersRetirarGlobales.length
    ? `<ul>${result.summary.postersRetirarGlobales
        .map(
          (p) =>
            `<li>${esc(p.pelicula)} <span class="muted">x${p.cantidad} → ${
              p.cantidad === 1 ? "Sala" : "Salas"
            } ${p.salas.join(", ")} - Devolver ${p.cantidad} a marketing</span></li>`
        )
        .join("")}</ul>`
    : `<div class="muted">No hay películas que salgan de cartelera.</div>`;

  const roomsHtml = `<div class="new-items-grid">${result.salas
    .map((sala) => {
      const ponerEnCartelera =
        result.ponerEnCarteleraPorSala?.[String(sala.sala)] || "Sin dato";

      const funcionesHtml = sala.funciones.length
        ? sala.funciones
            .map(
              (m) =>
                `<li>${esc(m.pelicula)} </li>`
            )
            .join("")
        : `<li class="muted">Sin funciones detectadas</li>`;

    

      return `
      
        <section class="room">
          <h2>Sala ${sala.sala}</h2>

          <div class="compact-card cartelera-card full-width">
            <h3>🎬 Primera función del jueves</h3>
            <div class="single-line">${esc(ponerEnCartelera)}</div>
          </div>

          <div class="compact-card full-width">
            <h3 class="h3-text">Funciones </h3>
            <ul class="list">${funcionesHtml}</ul>
          </div>

        </section>
      `;
    })
    .join("")}</div>`;

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Plan MKT - Pósters</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }

    html, body {
      background: #fff;
    }

    body {
      font-family: Arial, sans-serif;
      color: #111;
      margin: 7mm;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 9px;
    }

    .print-wrap {
      width: 100%;
    }

    .summary {
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
      page-break-after: always;
    }

    .summary-title {
      font-size: 18px;
      font-weight: 800;
      margin-bottom: 10px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }

    .summary-grid div {
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 7px;
      font-size: 10px;
    }

    .summary-grid strong {
      display: block;
      margin-top: 3px;
      font-size: 16px;
    }

    .global-block {
      margin-top: 8px;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .global-title {
      font-weight: 700;
      margin-bottom: 4px;
      font-size: 11px;
    }

    .salen-eventos-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .salen-block {
      flex: 1;
      margin-top: 0;
    }

    .eventos-block {
      flex: 1;
      margin-top: 0;
      border-color: #b8d4f0;
      background: #f0f7ff;
    }

    .eventos-note {
      font-size: 8px;
      color: #666;
      font-style: italic;
      margin-bottom: 6px;
    }

    .evento-item {
      border: 1px solid #d4e4f4;
      border-radius: 4px;
      padding: 4px 6px;
      margin-bottom: 4px;
      background: #fff;
    }

    .evento-title {
      font-weight: 700;
      font-size: 9px;
    }

    .evento-meta {
      font-size: 8px;
      color: #555;
      margin-top: 2px;
    }

    .evento-sala-ac {
      color: #c26200;
      font-weight: 700;
    }

  .new-items-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.movement-card.compact {
  border: 1px solid #e3e3e3;
  border-radius: 6px;
  padding: 6px 7px;
  background: #fff;
  break-inside: avoid;
  page-break-inside: avoid;
  min-height: auto;
}

.movement-card-row {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 8px;
}

.movement-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.movement-title {
  font-size: 9.5px;
  line-height: 1.2;
  font-weight: 700;
}

.movement-subtitle {
  margin-top: 3px;
  font-size: 8.5px;
  line-height: 1.12;
}

.check-tall-box {
  flex-shrink: 0;
  min-width: 128px;
  border: 1px solid #d9d9d9;
  border-radius: 5px;
  padding: 4px 6px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.check-tall-item {
  display: block;
  font-size: 8.4px;
  color: #111;
  white-space: nowrap;
}

.new-inline-badge {
  flex-shrink: 0;
  align-self: center;
  display: inline-block;
  border: 1px solid #d9d9d9;
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 8.2px;
  font-weight: 700;
  background: #f8fafc;
  white-space: nowrap;
}

    .room {
      border: 1px solid #d9d9d9;
      border-radius: 7px;
      padding: 6px;
      margin: 0 0 6px 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .room h2 {
      margin: 0 0 5px;
      font-size: 12px;
      line-height: 1.1;
    }
      .h3-text{
      margin-left:4px}

    .list{
    margin-left:3px}
    .compact-card {
    margin-top:3px;
    margin:2px;
    border: 1px solid #ededed;
      border-radius: 5px;
      break-inside: avoid;
      page-break-inside: avoid;
      min-height: 30px;
      margin-bottom: 5px;
    }

    .full-width {
      width: 100%;
    }

    .cartelera-card {
      background: #fff4d6;
      border-color: #ead9a5;
    }

    .compact-card h3 {
    padding-top:3px;
      margin: 0 0 4px 3px;
      font-size: 9.5px;
      line-height: 1.05;
    }

    .single-line {
    margin-left:4px;
      font-size: 8.5px;
      line-height: 1.15;
    }

    ul {
      margin: 0;
      padding-left: 12px;
    }

    li {
      margin: 1px 0;
      font-size: 8.2px;
      line-height: 1.2;
    }

    .summary li,
    .summary .muted,
    .summary ul {
      font-size: 10px;
      line-height: 1.2;
    }

    .muted {
      color: #666;
    }

    @media print {
      body {
        margin: 0;
      }

      .summary {
        break-inside: avoid;
        page-break-inside: avoid;
        page-break-after: always;
      }

      .global-block,
      .room,
      .compact-card,
      .movement-card {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .new-items-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
    }
  </style>
</head>
<body>
  <div class="print-wrap">
    <section class="summary">

     

      <div class="global-block">
        <div class="global-title">🎬 Primera función del jueves</div>
        ${carteleraHtml}
      </div>

      <div class="global-block">
        <div class="global-title">🆕 Nuevos / Movimientos</div>
        ${nuevosHtml}
      </div>

      <div class="salen-eventos-row">
        <div class="global-block salen-block">
          <div class="global-title">🎞️ Películas que salen de cartelera</div>
          ${salenCarteleraHtml}
        </div>

        <div class="global-block eventos-block">
          <div class="global-title">📅 Eventos</div>
          <div class="eventos-note">Revisar fecha del evento para ver si se da la semana entrante</div>
          ${buildEventosHtml(eventos)}
        </div>
      </div>
    </section>

    ${roomsHtml}
  </div>
</body>
</html>
`;
}