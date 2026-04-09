// ══════════════════════════════════════════════════════════════
// CRM Aliados — Autolab | Google Apps Script Backend
// ══════════════════════════════════════════════════════════════
//
// SETUP (solo la primera vez):
//   1. Crea un Google Sheet nuevo y copia su ID desde la URL
//      (la parte entre /d/ y /edit)
//   2. Pega ese ID en SS_ID abajo
//   3. En el editor de Apps Script, ejecuta la función setupSheets()
//      una sola vez para crear las hojas y encabezados
//   4. Deploy → New deployment → Web App
//      - Execute as: Me
//      - Who has access: Anyone
//   5. Copia la URL del deployment y pégala en el login del CRM
// ══════════════════════════════════════════════════════════════

const SS_ID = 'PEGA_AQUI_EL_ID_DE_TU_SPREADSHEET';

const SHEET_NAMES = {
  talleres:    'Talleres',
  contactos:   'Contactos',
  actividades: 'Actividades',
  tareas:      'Tareas',
  usuarios:    'Usuarios',
};

// ── ROUTER ────────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case 'getAll':        result = getAll();                          break;
      case 'getTaller':     result = getTaller(e.parameter.id);        break;
      case 'addTaller':     result = addTaller(JSON.parse(e.parameter.data)); break;
      case 'updateTaller':  result = updateTaller(e.parameter.id, e.parameter.field, e.parameter.value); break;
      case 'deleteTaller':  result = deleteTaller(e.parameter.id);     break;
      case 'addContacto':   result = addContacto(e.parameter);         break;
      case 'addActividad':  result = addActividad(e.parameter);        break;
      case 'addTarea':      result = addTarea(e.parameter);            break;
      case 'updateTarea':   result = updateTarea(e.parameter.id, e.parameter.estado); break;
      default:              result = { error: 'Acción desconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET ALL (lista principal + conteo de tareas) ───────────────
function getAll() {
  const ss = SpreadsheetApp.openById(SS_ID);

  const talleresRaw = getRows(ss, 'talleres');
  const tareasRaw   = getRows(ss, 'tareas');
  const usuariosRaw = getRows(ss, 'usuarios');

  const talleres = talleresRaw.map(r => ({
    id:               r[0],
    nombre:           r[1],
    ciudad:           r[2],
    tipo_servicio:    r[3],
    etapa:            r[4],
    asesor:           r[5],
    notas:            r[6],
    fecha_creacion:   r[7],
    ultima_actividad: r[8],
    creado_por:       r[9],
    direccion:        r[10],
    tareas_pendientes: 0,
    tareas_vencidas:   0,
  }));

  // Contar tareas pendientes y vencidas por taller
  const hoy = new Date();
  tareasRaw.forEach(t => {
    if (t[5] === 'completada') return;
    const taller = talleres.find(x => x.id === t[1]);
    if (!taller) return;
    taller.tareas_pendientes++;
    if (t[4] && new Date(t[4]) < hoy) taller.tareas_vencidas++;
  });

  const usuarios = usuariosRaw
    .filter(r => r[2] !== 'inactivo')
    .map(r => ({ id: r[0], nombre: r[1] }));

  return { talleres, usuarios };
}

// ── GET TALLER DETALLE ─────────────────────────────────────────
function getTaller(id) {
  const ss = SpreadsheetApp.openById(SS_ID);

  const contactos = getRows(ss, 'contactos')
    .filter(r => r[1] === id)
    .map(r => ({ id: r[0], taller_id: r[1], nombre: r[2], cargo: r[3], telefono: r[4], email: r[5], notas: r[6] }));

  const actividades = getRows(ss, 'actividades')
    .filter(r => r[1] === id)
    .sort((a, b) => new Date(b[5]) - new Date(a[5]))
    .map(r => ({ id: r[0], taller_id: r[1], tipo: r[2], descripcion: r[3], usuario: r[4], fecha: r[5] }));

  const tareas = getRows(ss, 'tareas')
    .filter(r => r[1] === id)
    .map(r => ({ id: r[0], taller_id: r[1], descripcion: r[2], asignado_a: r[3], vencimiento: r[4], estado: r[5], creado_por: r[6], fecha_creacion: r[7] }));

  return { contactos, actividades, tareas };
}

// ── ADD TALLER ─────────────────────────────────────────────────
function addTaller(data) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.talleres);
  const id    = Utilities.getUuid();
  const now   = new Date().toISOString();
  sheet.appendRow([
    id,
    data.nombre       || '',
    data.ciudad       || '',
    data.tipo_servicio|| '',
    data.etapa        || 'prospecto',
    data.asesor       || '',
    data.notas        || '',
    now,
    '',                       // ultima_actividad
    data.creado_por   || '',
    data.direccion    || '',
  ]);
  return { id };
}

// ── UPDATE TALLER (campo individual) ──────────────────────────
function updateTaller(id, field, value) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.talleres);
  const data  = sheet.getDataRange().getValues();

  // Columnas (1-indexed para getRange): id=1, nombre=2, ciudad=3, tipo=4,
  // etapa=5, asesor=6, notas=7, fecha_creacion=8, ultima_actividad=9, creado_por=10, direccion=11
  const fieldCol = { etapa: 5, asesor: 6, notas: 7, ultima_actividad: 9, direccion: 11 };
  const col = fieldCol[field];
  if (!col) return { error: 'Campo no permitido: ' + field };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, col).setValue(value);
      return { ok: true };
    }
  }
  return { error: 'Taller no encontrado' };
}

// ── DELETE TALLER (+ cascada) ──────────────────────────────────
function deleteTaller(id) {
  const ss = SpreadsheetApp.openById(SS_ID);
  deleteRowById(ss, 'talleres', id);

  // Eliminar registros relacionados
  ['contactos', 'actividades', 'tareas'].forEach(key => {
    const sheet = ss.getSheetByName(SHEET_NAMES[key]);
    const data  = sheet.getDataRange().getValues();
    // Recorrer de abajo hacia arriba para no saltar filas
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === String(id)) sheet.deleteRow(i + 1);
    }
  });
  return { ok: true };
}

// ── ADD CONTACTO ───────────────────────────────────────────────
function addContacto(p) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.contactos);
  const id    = Utilities.getUuid();
  sheet.appendRow([id, p.taller_id, p.nombre, p.cargo || '', p.telefono || '', p.email || '', p.notas || '']);
  return { id };
}

// ── ADD ACTIVIDAD ──────────────────────────────────────────────
function addActividad(p) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.actividades);
  const id    = Utilities.getUuid();
  const now   = new Date().toISOString();
  sheet.appendRow([id, p.taller_id, p.tipo, p.descripcion, p.usuario, now]);
  // Actualizar ultima_actividad del taller
  updateTaller(p.taller_id, 'ultima_actividad', now);
  return { id };
}

// ── ADD TAREA ──────────────────────────────────────────────────
function addTarea(p) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.tareas);
  const id    = Utilities.getUuid();
  const now   = new Date().toISOString();
  sheet.appendRow([id, p.taller_id, p.descripcion, p.asignado_a || '', p.vencimiento || '', 'pendiente', p.creado_por || '', now]);
  return { id };
}

// ── UPDATE TAREA (estado) ──────────────────────────────────────
function updateTarea(id, estado) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.tareas);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 6).setValue(estado); // col 6 = estado
      return { ok: true };
    }
  }
  return { error: 'Tarea no encontrada' };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getRows(ss, key) {
  const sheet = ss.getSheetByName(SHEET_NAMES[key]);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function deleteRowById(ss, key, id) {
  const sheet = ss.getSheetByName(SHEET_NAMES[key]);
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) { sheet.deleteRow(i + 1); return; }
  }
}

// ══════════════════════════════════════════════════════════════
// SETUP — ejecutar UNA SOLA VEZ desde el editor de Apps Script
// ══════════════════════════════════════════════════════════════
function setupSheets() {
  const ss = SpreadsheetApp.openById(SS_ID);

  const config = {
    Talleres:    ['id','nombre','ciudad','tipo_servicio','etapa','asesor','notas','fecha_creacion','ultima_actividad','creado_por','direccion'],
    Contactos:   ['id','taller_id','nombre','cargo','telefono','email','notas'],
    Actividades: ['id','taller_id','tipo','descripcion','usuario','fecha'],
    Tareas:      ['id','taller_id','descripcion','asignado_a','vencimiento','estado','creado_por','fecha_creacion'],
    Usuarios:    ['id','nombre','estado'],
  };

  Object.entries(config).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });

  // Agregar usuarios iniciales de ejemplo (edítalos en el Sheet después)
  const usersSheet = ss.getSheetByName('Usuarios');
  if (usersSheet.getLastRow() <= 1) {
    const ejemplos = ['Juan Reclutador', 'María Alianzas', 'Carlos Ventas'];
    ejemplos.forEach(nombre => {
      usersSheet.appendRow([Utilities.getUuid(), nombre, 'activo']);
    });
  }

  Logger.log('✅ Sheets creadas correctamente. Ya puedes hacer el deployment.');
}
