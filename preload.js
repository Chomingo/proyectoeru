const { contextBridge, ipcRenderer } = require('electron');
const { FilesetResolver, HandLandmarker } = require('@mediapipe/tasks-vision');

async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );
  return await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      delegate: "CPU"
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
}

const gestureAPI = {
  onGestureDetected: (callback) => {
    ipcRenderer.on('gesture:detected', (_, data) => callback(data));
  },
  onGestureStarted: (callback) => {
    ipcRenderer.on('gesture:started', (_, data) => callback(data));
  },
  onGestureStopped: (callback) => {
    ipcRenderer.on('gesture:stopped', (_, data) => callback(data));
  },
  onGestureError: (callback) => {
    ipcRenderer.on('gesture:error', (_, data) => callback(data));
  },
  start: () => ipcRenderer.invoke('gesture:start'),
  stop: () => ipcRenderer.invoke('gesture:stop'),
  detected: (gesture, handedness) => ipcRenderer.invoke('gesture:detected', { gesture, handedness }),
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

const arduinoAPI = {
  onConnected: (callback) => {
    ipcRenderer.on('arduino:connected', (_, data) => callback(data));
  },
  onDisconnected: (callback) => {
    ipcRenderer.on('arduino:disconnected', (_, data) => callback(data));
  },
  onError: (callback) => {
    ipcRenderer.on('arduino:error', (_, data) => callback(data));
  },
  connect: (port, baudRate = 9600) => ipcRenderer.invoke('arduino:connect', { port, baudRate }),
  disconnect: () => ipcRenderer.invoke('arduino:disconnect'),
  listPorts: () => ipcRenderer.invoke('arduino:list-ports')
};

const databaseAPI = {
  getPatients: () => ipcRenderer.invoke('db:get-patients'),
  addPatient: (patient) => ipcRenderer.invoke('db:add-patient', patient),
  logGesture: (gesture, handedness) => ipcRenderer.invoke('db:log-gesture', { gesture, handedness })
};

const dialogAPI = {
  openImage: () => ipcRenderer.invoke('dialog:open-image')
};

contextBridge.exposeInMainWorld('gestomed', {
  gesture: gestureAPI,
  arduino: arduinoAPI,
  database: databaseAPI,
  dialog: dialogAPI,
  vision: { createHandLandmarker }
});