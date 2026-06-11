const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Desactivar aceleración por hardware y sandboxing para evitar Access Violation en WASM/MediaPipe/GPU
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// serialport es opcional — si falla (sin binarios nativos) seguimos sin él
let SerialPort = null;
try {
  SerialPort = require('serialport').SerialPort;
  console.log('[GestoMed] serialport cargado correctamente.');
} catch (e) {
  console.warn('[GestoMed] serialport no disponible — Arduino deshabilitado:', e.message);
}

let mainWindow = null;
let arduinoPort = null;

// Archivo de base de datos simulada en JSON para evitar compilación de C++ en Windows
let dbPath = null;
let dbData = { patients: [], gestures_log: [] };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    title: 'GestoMed - Interfaz Sin Contacto',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`[GestoMed] Renderer process gone! Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    closeArduino();
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// --- BASE DE DATOS LOCAL (JSON con fs) ---
function initDatabase() {
  try {
    dbPath = path.join(app.getPath('userData'), 'gestomed_db.json');
    console.log('[GestoMed] Cargando base de datos JSON en:', dbPath);

    if (fs.existsSync(dbPath)) {
      const fileContent = fs.readFileSync(dbPath, 'utf8');
      dbData = JSON.parse(fileContent);
    } else {
      dbData = { patients: [], gestures_log: [] };
    }

    // Asegurar estructura
    if (!dbData.patients) dbData.patients = [];
    if (!dbData.gestures_log) dbData.gestures_log = [];

    // Poblar con datos simulados si está vacía
    if (dbData.patients.length === 0) {
      dbData.patients = [
        {
          id: 1,
          name: 'Dr. Alejandro Silva (Simulado)',
          diagnosis: 'Ruptura de ligamento cruzado anterior (LCA) en la rodilla derecha. Se observa líquido intraarticular libre. Requiere reconstrucción artroscópica.',
          image_path: 'images/radiografia_rodilla.png',
          created_at: new Date(Date.now() - 3600000 * 24).toISOString() // Ayer
        },
        {
          id: 2,
          name: 'Sofía Montenegro',
          diagnosis: 'Fractura desplazada en el tercio medio de la clavícula izquierda. Superposición ósea de 1.5 cm. Se sugiere osteosíntesis con placa y tornillos.',
          image_path: 'images/radiografia_clavicula.png',
          created_at: new Date(Date.now() - 3600000 * 5).toISOString() // Hace 5 horas
        },
        {
          id: 3,
          name: 'Mateo Valenzuela',
          diagnosis: 'Radiografía de tórax posteroanterior muestra cardiomegalia grado II y ensanchamiento del mediastino superior. Congestión hiliar leve.',
          image_path: 'images/radiografia_torax.png',
          created_at: new Date().toISOString() // Ahora
        }
      ];
      saveDatabase();
      console.log('[GestoMed] Datos médicos simulados cargados en el archivo JSON');
    }

    return true;
  } catch (error) {
    console.error('[GestoMed] Error al iniciar la base de datos JSON:', error);
    return false;
  }
}

function saveDatabase() {
  try {
    if (dbPath) {
      fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('[GestoMed] Error al guardar datos en JSON:', error);
  }
}

function getPatients() {
  // Ordenar de más nuevo a más antiguo
  return [...dbData.patients].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function addPatient(patient) {
  const maxId = dbData.patients.reduce((max, p) => (p.id > max ? p.id : max), 0);
  const newPatient = {
    id: maxId + 1,
    name: patient.name,
    diagnosis: patient.diagnosis || '',
    image_path: patient.image_path || '',
    created_at: new Date().toISOString()
  };
  dbData.patients.push(newPatient);
  saveDatabase();
  return newPatient;
}

function logGesture(gesture, handedness) {
  const maxId = dbData.gestures_log.reduce((max, g) => (g.id > max ? g.id : max), 0);
  const logEntry = {
    id: maxId + 1,
    gesture_type: gesture,
    handedness: handedness,
    timestamp: new Date().toISOString()
  };
  dbData.gestures_log.push(logEntry);
  saveDatabase();
}

// --- COMUNICACIÓN ARDUINO (serialport) ---
async function connectArduino(portPath, baudRate = 9600) {
  try {
    if (arduinoPort && arduinoPort.isOpen) {
      await closeArduino();
    }

    arduinoPort = new SerialPort({ path: portPath, baudRate });
    
    arduinoPort.on('open', () => {
      console.log(`[GestoMed] Arduino conectado en ${portPath}`);
      sendToRenderer('arduino:connected', { port: portPath });
    });

    arduinoPort.on('error', (err) => {
      console.error('[GestoMed] Error de puerto serial:', err.message);
      sendToRenderer('arduino:error', { message: err.message });
    });

    arduinoPort.on('close', () => {
      console.log('[GestoMed] Puerto serial cerrado');
      sendToRenderer('arduino:disconnected', {});
    });

    return true;
  } catch (error) {
    console.error('[GestoMed] Error al conectar con Arduino:', error);
    sendToRenderer('arduino:error', { message: error.message });
    return false;
  }
}

async function closeArduino() {
  if (arduinoPort && arduinoPort.isOpen) {
    await new Promise((resolve) => arduinoPort.close(resolve));
  }
  arduinoPort = null;
}

function sendToArduino(gesture) {
  if (!arduinoPort || !arduinoPort.isOpen) return;

  const commands = {
    pinch: 'G:PINCH\n',
    fist: 'G:FIST\n',
    swipe_up: 'G:UP\n',
    swipe_down: 'G:DOWN\n',
    swipe_left: 'G:LEFT\n',
    swipe_right: 'G:RIGHT\n'
  };

  const cmd = commands[gesture];
  if (cmd) {
    arduinoPort.write(cmd, (err) => {
      if (err) console.error('[GestoMed] Error al enviar comando a Arduino:', err.message);
    });
  }
}

// --- MANEJADORES DE IPC ---

ipcMain.handle('gesture:detected', async (_, { gesture, handedness }) => {
  logGesture(gesture, handedness);
  sendToArduino(gesture);
  return { success: true };
});

ipcMain.handle('arduino:connect', async (_, { port, baudRate }) => {
  const result = await connectArduino(port, baudRate);
  return { success: result };
});

ipcMain.handle('arduino:disconnect', async () => {
  await closeArduino();
  return { success: true };
});

ipcMain.handle('arduino:list-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer }));
  } catch (error) {
    console.error('[GestoMed] Error al listar puertos seriales:', error);
    return [];
  }
});

ipcMain.handle('db:get-patients', async () => {
  return getPatients();
});

ipcMain.handle('db:add-patient', async (_, patient) => {
  return addPatient(patient);
});

ipcMain.handle('db:log-gesture', async (_, { gesture, handedness }) => {
  logGesture(gesture, handedness);
  return { success: true };
});

ipcMain.handle('dialog:open-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Imágenes Médicas', extensions: ['jpg', 'jpeg', 'png'] }]
  });
  return result.filePaths[0] || null;
});

// Lanzamiento de la App
app.whenReady().then(async () => {
  initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  console.error('[GestoMed] Excepción no controlada en Proceso Principal:', error);
});