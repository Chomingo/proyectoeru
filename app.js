// GestoMed - Lógica del Renderizador (Frontend)
// IMPORTANTE: Todo el código se inicializa dentro de DOMContentLoaded
// para evitar que las queries de elementos fallen antes de que el DOM esté listo.

document.addEventListener('DOMContentLoaded', async () => {

  // ==========================================================================
  // ESTADOS DE LA APLICACIÓN
  // ==========================================================================
  let activeView = 'view-dashboard';
  let patients = [];
  let selectedPatient = null;
  let selectedPatientIndex = -1;
  let selectedXrayPath = null;

  let zoomScale = 1.0;
  let rotateAngle = 0;

  let serialPorts = [];
  let isArduinoConnected = false;
  let connectedPort = null;

  let isCamActive = false;
  let localStream = null;
  let handLandmarker = null;
  let animationFrameId = null;

  let historyX = [];
  let historyY = [];
  const historyLimit = 6;
  let gestureCooldown = false;
  const cooldownDuration = 1000;

  // ==========================================================================
  // ELEMENTOS DEL DOM (seguros porque ya existe el DOM)
  // ==========================================================================
  const viewContainers = document.querySelectorAll('.view-container');
  const menuItems = document.querySelectorAll('.menu-item');
  const viewTitle = document.getElementById('current-view-title');

  const statusCam = document.getElementById('status-cam');
  const statusArduino = document.getElementById('status-arduino');
  const liveGestureText = document.getElementById('gesture-text');
  const liveGestureDot = document.getElementById('gesture-dot');

  const flashEffect = document.getElementById('flash-effect');
  const toastEffect = document.getElementById('toast-effect');
  const toastIcon = document.getElementById('toast-icon');
  const toastText = document.getElementById('toast-text');

  const videoEl = document.getElementById('webcam');
  const canvasEl = document.getElementById('canvas-overlay');
  const ctx = canvasEl ? canvasEl.getContext('2d') : null;
  const btnStartCam = document.getElementById('btn-start-camera');
  const btnStopCam = document.getElementById('btn-stop-camera');
  const noCamMsg = document.getElementById('no-camera-msg');
  const systemLogs = document.getElementById('system-logs');

  const patientSearchInput = document.getElementById('patient-search');
  const patientListEl = document.getElementById('patient-list');
  const patientDetailsView = document.getElementById('patient-details-view');
  const patientAddView = document.getElementById('patient-add-view');
  const btnShowAddPatient = document.getElementById('btn-show-add-patient');
  const btnCancelAdd = document.getElementById('btn-cancel-add');
  const addPatientForm = document.getElementById('add-patient-form');
  const btnSelectXray = document.getElementById('btn-select-xray-file');
  const selectedXrayFilename = document.getElementById('selected-xray-filename');

  const xrayImg = document.getElementById('active-xray-img');
  const noXrayMsg = document.getElementById('no-xray-msg');
  const viewerPatientName = document.getElementById('viewer-patient-name');
  const viewerPatientDiag = document.getElementById('viewer-patient-diag-summary');
  const zoomLevelEl = document.getElementById('xray-zoom-level');
  const rotateLevelEl = document.getElementById('xray-rotate-level');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  const portSelect = document.getElementById('arduino-port-select');
  const baudrateSelect = document.getElementById('arduino-baudrate-select');
  const btnRefreshPorts = document.getElementById('btn-refresh-ports');
  const btnConnectArduino = document.getElementById('btn-connect-arduino');
  const btnDisconnectArduino = document.getElementById('btn-disconnect-arduino');
  const terminalOutput = document.getElementById('terminal-output');
  const testGestureBtns = document.querySelectorAll('.btn-test-gesture');

  // ==========================================================================
  // 1. NAVEGACIÓN ENTRE VISTAS
  // ==========================================================================
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      switchView(target);
    });
  });

  function switchView(targetId) {
    menuItems.forEach(item => {
      if (item.getAttribute('data-target') === targetId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    viewContainers.forEach(container => {
      if (container.id === targetId) {
        container.classList.add('active');
      } else {
        container.classList.remove('active');
      }
    });

    activeView = targetId;

    const titles = {
      'view-dashboard': 'Dashboard Médico',
      'view-patients': 'Expedientes Clínicos',
      'view-xray': 'Visor Quirúrgico de Radiografías',
      'view-hardware': 'Configuración de Hardware y Robótica'
    };
    viewTitle.innerText = titles[targetId] || 'GestoMed';
    logToConsole(`Vista: ${titles[targetId]}`, 'info');
  }

  // ==========================================================================
  // 2. SISTEMA DE LOGS
  // ==========================================================================
  function logToConsole(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    if (systemLogs) {
      const entry = document.createElement('div');
      entry.classList.add('log-entry', type);
      entry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
      systemLogs.appendChild(entry);
      systemLogs.scrollTop = systemLogs.scrollHeight;
      if (systemLogs.children.length > 50) {
        systemLogs.removeChild(systemLogs.firstChild);
      }
    }

    if ((type === 'tx' || message.includes('Arduino')) && terminalOutput) {
      const termLine = document.createElement('div');
      termLine.classList.add('terminal-line', type === 'tx' ? 'tx' : 'info');
      termLine.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
      terminalOutput.appendChild(termLine);
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
  }

  // ==========================================================================
  // 3. EXPEDIENTES (BASE DE DATOS JSON)
  // ==========================================================================
  async function loadPatients() {
    try {
      patients = await window.gestomed.database.getPatients();
      renderPatientList();
      logToConsole(`${patients.length} expedientes cargados.`, 'success');
    } catch (error) {
      console.error('Error cargando pacientes:', error);
      logToConsole('Error al cargar los expedientes.', 'error');
    }
  }

  function renderPatientList(filterText = '') {
    if (!patientListEl) return;
    patientListEl.innerHTML = '';

    const filtered = patients.filter(p =>
      p.name.toLowerCase().includes(filterText.toLowerCase()) ||
      (p.diagnosis && p.diagnosis.toLowerCase().includes(filterText.toLowerCase()))
    );

    if (filtered.length === 0) {
      patientListEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px;">Sin resultados</div>';
      return;
    }

    filtered.forEach((p, idx) => {
      const card = document.createElement('div');
      card.classList.add('patient-mini-card');
      if (selectedPatient && selectedPatient.id === p.id) {
        card.classList.add('active');
        selectedPatientIndex = idx;
      }
      const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
      card.innerHTML = `<div class="patient-mini-name">${p.name}</div><div class="patient-mini-date">Registrado: ${dateStr}</div>`;
      card.addEventListener('click', () => selectPatient(p, idx));
      patientListEl.appendChild(card);
    });
  }

  function selectPatient(patient, index) {
    selectedPatient = patient;
    selectedPatientIndex = index;
    const cards = patientListEl.querySelectorAll('.patient-mini-card');
    cards.forEach((card, idx) => {
      if (idx === index) card.classList.add('active');
      else card.classList.remove('active');
    });
    renderPatientDetails();
    loadXrayViewer();
    logToConsole(`Expediente: ${patient.name}`, 'info');
  }

  function renderPatientDetails() {
    if (!selectedPatient || !patientDetailsView) return;

    const dateStr = selectedPatient.created_at ? new Date(selectedPatient.created_at).toLocaleString() : '';
    const isLocal = selectedPatient.image_path && selectedPatient.image_path.startsWith('images/');
    const imgUrl = isLocal ? selectedPatient.image_path : (selectedPatient.image_path ? `file:///${selectedPatient.image_path}` : '');

    patientDetailsView.style.display = 'flex';
    patientAddView.style.display = 'none';
    patientDetailsView.innerHTML = `
      <div class="patient-header">
        <div>
          <div class="patient-detail-name">${selectedPatient.name}</div>
          <div class="patient-detail-info">ID: #${selectedPatient.id} | ${dateStr}</div>
        </div>
        <div class="patient-record-header-actions">
          <button class="btn btn-primary" id="btn-open-in-viewer-tab"><span>🩻</span> Ver en Quirófano</button>
        </div>
      </div>
      <div class="patient-grid-details">
        <div class="patient-diagnosis-box">
          <div class="patient-diagnosis-title">Diagnóstico Médico Oficial</div>
          <div class="patient-diagnosis-text">${selectedPatient.diagnosis}</div>
        </div>
        <div class="patient-xray-preview">
          <div class="patient-diagnosis-title">Radiografía Asociada</div>
          <div class="xray-thumb" id="details-xray-thumb-container">
            ${imgUrl ? `<img src="${imgUrl}" alt="Diagnóstico"><div class="xray-overlay-btn">Ver Detalle</div>` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">Sin Radiografía</div>'}
          </div>
        </div>
      </div>`;

    document.getElementById('btn-open-in-viewer-tab').addEventListener('click', () => switchView('view-xray'));
    const thumb = document.getElementById('details-xray-thumb-container');
    if (thumb && imgUrl) thumb.addEventListener('click', () => switchView('view-xray'));
  }

  if (patientSearchInput) {
    patientSearchInput.addEventListener('input', (e) => renderPatientList(e.target.value));
  }

  if (btnShowAddPatient) {
    btnShowAddPatient.addEventListener('click', () => {
      patientDetailsView.style.display = 'none';
      patientAddView.style.display = 'block';
      addPatientForm.reset();
      selectedXrayPath = null;
      selectedXrayFilename.innerText = 'Ningún archivo';
      selectedXrayFilename.style.color = 'var(--text-muted)';
    });
  }

  if (btnCancelAdd) {
    btnCancelAdd.addEventListener('click', () => {
      if (selectedPatient) {
        renderPatientDetails();
      } else {
        patientDetailsView.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:var(--text-muted);"><span style="font-size:40px;">📂</span><p>Selecciona un expediente.</p></div>`;
        patientDetailsView.style.display = 'flex';
        patientAddView.style.display = 'none';
      }
    });
  }

  if (btnSelectXray) {
    btnSelectXray.addEventListener('click', async () => {
      try {
        const filePath = await window.gestomed.dialog.openImage();
        if (filePath) {
          selectedXrayPath = filePath;
          const filename = filePath.split(/[\\/]/).pop();
          selectedXrayFilename.innerText = filename;
          selectedXrayFilename.style.color = 'var(--accent-green)';
        }
      } catch (e) { console.error(e); }
    });
  }

  if (addPatientForm) {
    addPatientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-patient-name').value.trim();
      const diagnosis = document.getElementById('new-patient-diagnosis').value.trim();
      if (!name || !diagnosis) return;
      try {
        const saved = await window.gestomed.database.addPatient({ name, diagnosis, image_path: selectedXrayPath || '' });
        if (saved) {
          logToConsole(`Paciente "${name}" guardado.`, 'success');
          await loadPatients();
          const newIdx = patients.findIndex(p => p.id === saved.id);
          if (newIdx !== -1) selectPatient(patients[newIdx], newIdx);
        }
      } catch (e) {
        logToConsole('Error al guardar el expediente.', 'error');
      }
    });
  }

  // ==========================================================================
  // 4. VISOR DE RADIOGRAFÍAS
  // ==========================================================================
  function loadXrayViewer() {
    if (!selectedPatient) {
      if (xrayImg) xrayImg.style.display = 'none';
      if (noXrayMsg) noXrayMsg.style.display = 'flex';
      if (viewerPatientName) viewerPatientName.innerText = 'PACIENTE: Ninguno';
      return;
    }
    const isLocal = selectedPatient.image_path && selectedPatient.image_path.startsWith('images/');
    const imgUrl = isLocal ? selectedPatient.image_path : (selectedPatient.image_path ? `file:///${selectedPatient.image_path}` : '');

    if (imgUrl && xrayImg) {
      xrayImg.src = imgUrl;
      xrayImg.style.display = 'block';
      if (noXrayMsg) noXrayMsg.style.display = 'none';
      resetZoom();
    } else {
      if (xrayImg) xrayImg.style.display = 'none';
      if (noXrayMsg) noXrayMsg.style.display = 'flex';
    }
    if (viewerPatientName) viewerPatientName.innerText = `PACIENTE: ${selectedPatient.name.toUpperCase()}`;
    if (viewerPatientDiag) {
      const shortDiag = selectedPatient.diagnosis.length > 120
        ? selectedPatient.diagnosis.substring(0, 120) + '...'
        : selectedPatient.diagnosis;
      viewerPatientDiag.innerText = shortDiag;
    }
  }

  function updateZoomStyles() {
    if (xrayImg) xrayImg.style.transform = `scale(${zoomScale}) rotate(${rotateAngle}deg)`;
    if (zoomLevelEl) zoomLevelEl.innerText = `${zoomScale.toFixed(2)}x`;
    if (rotateLevelEl) rotateLevelEl.innerText = `${rotateAngle}°`;
  }

  function adjustZoom(amount) {
    if (!selectedPatient || !selectedPatient.image_path) return;
    zoomScale = Math.max(0.5, Math.min(4.0, zoomScale + amount));
    updateZoomStyles();
  }

  function resetZoom() {
    zoomScale = 1.0;
    rotateAngle = 0;
    updateZoomStyles();
  }

  if (btnZoomIn) btnZoomIn.addEventListener('click', () => adjustZoom(0.25));
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => adjustZoom(-0.25));
  if (btnZoomReset) btnZoomReset.addEventListener('click', resetZoom);

  // ==========================================================================
  // 5. ARDUINO / PUERTO SERIAL
  // ==========================================================================
  async function refreshSerialPorts() {
    try {
      const list = await window.gestomed.arduino.listPorts();
      serialPorts = list;
      if (!portSelect) return;
      portSelect.innerHTML = '';
      if (serialPorts.length === 0) {
        portSelect.innerHTML = '<option value="">No se detectaron puertos</option>';
        return;
      }
      serialPorts.forEach(port => {
        const opt = document.createElement('option');
        opt.value = port.path;
        opt.innerText = `${port.path} ${port.manufacturer ? `(${port.manufacturer})` : ''}`;
        portSelect.appendChild(opt);
      });
      logToConsole(`Puertos detectados: ${serialPorts.length}`, 'info');
    } catch (e) {
      if (portSelect) portSelect.innerHTML = '<option value="">Error al leer puertos</option>';
    }
  }

  if (btnRefreshPorts) btnRefreshPorts.addEventListener('click', refreshSerialPorts);

  if (btnConnectArduino) {
    btnConnectArduino.addEventListener('click', async () => {
      const port = portSelect ? portSelect.value : '';
      const baudRate = baudrateSelect ? parseInt(baudrateSelect.value, 10) : 9600;
      if (!port) { logToConsole('Selecciona un puerto COM.', 'warning'); return; }
      const res = await window.gestomed.arduino.connect(port, baudRate);
      if (res.success) {
        isArduinoConnected = true;
        connectedPort = port;
        if (btnConnectArduino) btnConnectArduino.disabled = true;
        if (btnDisconnectArduino) btnDisconnectArduino.disabled = false;
        if (statusArduino) statusArduino.innerHTML = `<span class="indicator connected"></span>Conectado (${port})`;
        logToConsole(`Conexión serial en ${port}.`, 'success');
      } else {
        logToConsole('Error de conexión. Verifica el cable USB.', 'error');
      }
    });
  }

  if (btnDisconnectArduino) {
    btnDisconnectArduino.addEventListener('click', async () => {
      await window.gestomed.arduino.disconnect();
      isArduinoConnected = false;
      connectedPort = null;
      if (btnConnectArduino) btnConnectArduino.disabled = false;
      if (btnDisconnectArduino) btnDisconnectArduino.disabled = true;
      if (statusArduino) statusArduino.innerHTML = '<span class="indicator disconnected"></span>Desconectado';
    });
  }

  window.gestomed.arduino.onConnected(({ port }) => {
    isArduinoConnected = true;
    if (statusArduino) statusArduino.innerHTML = `<span class="indicator connected"></span>Conectado (${port})`;
    if (btnConnectArduino) btnConnectArduino.disabled = true;
    if (btnDisconnectArduino) btnDisconnectArduino.disabled = false;
  });

  window.gestomed.arduino.onDisconnected(() => {
    isArduinoConnected = false;
    if (statusArduino) statusArduino.innerHTML = '<span class="indicator disconnected"></span>Desconectado';
    if (btnConnectArduino) btnConnectArduino.disabled = false;
    if (btnDisconnectArduino) btnDisconnectArduino.disabled = true;
  });

  window.gestomed.arduino.onError(({ message }) => {
    logToConsole(`Error USB: ${message}`, 'error');
  });

  testGestureBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const gesture = btn.getAttribute('data-gesture');
      executeGestureAction(gesture, 'Simulated');
    });
  });

  // ==========================================================================
  // 6. CÁMARA + MEDIAPIPE TASKS VISION (nueva API WASM estable)
  // ==========================================================================

  async function startWebcam() {
    if (isCamActive) return;

    if (btnStartCam) btnStartCam.disabled = true;
    if (noCamMsg) noCamMsg.style.display = 'none';
    logToConsole('Iniciando cámara y cargando IA...', 'info');

    try {
      // Cargar MediaPipe Tasks Vision via factory function en preload
      handLandmarker = await window.gestomed.vision.createHandLandmarker();

      // Iniciar cámara con getUserMedia nativo
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
      });
      videoEl.srcObject = localStream;

      await new Promise((resolve, reject) => {
        videoEl.onloadedmetadata = () => {
          videoEl.play().then(resolve).catch(reject);
        };
        videoEl.onerror = reject;
      });

      // Asegurar que el canvas coincida con el tamaño real del video
      if (canvasEl) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
      }

      isCamActive = true;
      if (btnStartCam) btnStartCam.disabled = true;
      if (btnStopCam) btnStopCam.disabled = false;
      if (statusCam) statusCam.innerHTML = '<span class="indicator connected"></span>Activa (Visión)';
      logToConsole('Cámara activa. Mueve tu mano frente a la cámara.', 'success');

      // Loop de procesamiento de frames
      processVideoFrame();

    } catch (err) {
      console.error('Error al iniciar cámara:', err);
      logToConsole(`Error: ${err.message}. Verifica que la cámara esté conectada.`, 'error');
      if (noCamMsg) noCamMsg.style.display = 'flex';
      if (btnStartCam) btnStartCam.disabled = false;
      isCamActive = false;
    }
  }

  function processVideoFrame() {
    if (!isCamActive || !handLandmarker || videoEl.readyState < 2) {
      animationFrameId = requestAnimationFrame(processVideoFrame);
      return;
    }
    try {
      const results = handLandmarker.detectForVideo(videoEl, performance.now());
      onHandResults(results);
    } catch (err) {
      console.error('Error en detección:', err);
    }
    animationFrameId = requestAnimationFrame(processVideoFrame);
  }

  function stopWebcam() {
    isCamActive = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    videoEl.srcObject = null;
    if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (btnStartCam) btnStartCam.disabled = false;
    if (btnStopCam) btnStopCam.disabled = true;
    if (statusCam) statusCam.innerHTML = '<span class="indicator disconnected"></span>Inactiva';
    if (noCamMsg) noCamMsg.style.display = 'flex';
    logToConsole('Cámara detenida.', 'info');
  }

  if (btnStartCam) btnStartCam.addEventListener('click', startWebcam);
  if (btnStopCam) btnStopCam.addEventListener('click', stopWebcam);

  // ==========================================================================
  // 7. DIBUJADO DEL ESQUELETO DE MANO
  // ==========================================================================
  function drawHandOverlay(landmarks) {
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17]
    ];

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8;

    connections.forEach(([i, j]) => {
      const p1 = landmarks[i], p2 = landmarks[j];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * canvasEl.width, p1.y * canvasEl.height);
        ctx.lineTo(p2.x * canvasEl.width, p2.y * canvasEl.height);
        ctx.stroke();
      }
    });

    landmarks.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt.x * canvasEl.width, pt.y * canvasEl.height, idx === 8 ? 7 : 5, 0, 2 * Math.PI);
      if (idx === 8) {
        ctx.fillStyle = '#ff3366';
        ctx.shadowColor = '#ff3366';
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = '#00ffaa';
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 6;
      }
      ctx.fill();
    });
    ctx.restore();
  }

  // ==========================================================================
  // 8. PROCESAMIENTO DE RESULTADOS DE MEDIAPIPE TASKS VISION
  // ==========================================================================
  function onHandResults(results) {
    if (!isCamActive) return;

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      const handedness = results.handedness && results.handedness[0] && results.handedness[0][0]
        ? results.handedness[0][0].categoryName : 'Right';
      drawHandOverlay(landmarks);
      processGestureDetection(landmarks, handedness);
    } else {
      if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      if (!gestureCooldown && liveGestureText) {
        liveGestureText.innerText = 'ESPERANDO MANO...';
        liveGestureText.style.color = 'var(--text-muted)';
      }
      if (!gestureCooldown && liveGestureDot) liveGestureDot.className = 'indicator disconnected';
      historyX = [];
      historyY = [];
    }
  }

  function processGestureDetection(landmarks, handedness) {
    if (gestureCooldown) return;

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];

    const isFist = indexTip.y > indexMcp.y && middleTip.y > middleMcp.y && ringTip.y > ringMcp.y && pinkyTip.y > pinkyMcp.y;
    if (isFist) { executeGestureAction('fist', handedness); return; }

    const pinchDist = Math.hypot(
      (thumbTip.x - indexTip.x) * (canvasEl ? canvasEl.width : 640),
      (thumbTip.y - indexTip.y) * (canvasEl ? canvasEl.height : 480)
    );
    if (pinchDist < 25) { executeGestureAction('pinch', handedness, indexTip); return; }

    const trackPt = landmarks[5];
    historyX.push(trackPt.x);
    historyY.push(trackPt.y);
    if (historyX.length > historyLimit) { historyX.shift(); historyY.shift(); }

    if (historyX.length === historyLimit) {
      const dx = historyX[historyX.length - 1] - historyX[0];
      const dy = historyY[historyY.length - 1] - historyY[0];
      const threshold = 0.12;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > threshold) executeGestureAction('swipe_right', handedness);
        else if (dx < -threshold) executeGestureAction('swipe_left', handedness);
      } else {
        if (dy < -threshold) executeGestureAction('swipe_up', handedness);
        else if (dy > threshold) executeGestureAction('swipe_down', handedness);
      }
    }
  }

  // ==========================================================================
  // 9. ACCIONES POR GESTO
  // ==========================================================================
  function executeGestureAction(gesture, handedness, extraData = null) {
    gestureCooldown = true;
    historyX = [];
    historyY = [];
    if (liveGestureDot) liveGestureDot.className = 'indicator connected';

    let gestureLabel = '';
    let gestureIcon = '';
    let flashColor = 'flash-blue';

    switch (gesture) {
      case 'fist':
        gestureLabel = 'PUÑO CERRADO';
        gestureIcon = '✊';
        flashColor = 'flash-gold';
        resetZoom();
        logToConsole('[QUIRÓFANO] Zoom restablecido.', 'info');
        break;
      case 'pinch':
        gestureLabel = 'PINZA / CLICK';
        gestureIcon = '🤏';
        flashColor = 'flash-green';
        if (activeView === 'view-xray' && extraData) showPinchPointer(extraData);
        break;
      case 'swipe_up':
        gestureLabel = 'DESLIZAR ARRIBA';
        gestureIcon = '👆';
        if (activeView === 'view-xray') { adjustZoom(0.25); logToConsole('[QUIRÓFANO] Zoom +0.25x.', 'info'); }
        break;
      case 'swipe_down':
        gestureLabel = 'DESLIZAR ABAJO';
        gestureIcon = '👇';
        if (activeView === 'view-xray') { adjustZoom(-0.25); logToConsole('[QUIRÓFANO] Zoom -0.25x.', 'info'); }
        break;
      case 'swipe_right':
        gestureLabel = 'DESLIZAR DERECHA';
        gestureIcon = '👉';
        navigatePatient(1);
        break;
      case 'swipe_left':
        gestureLabel = 'DESLIZAR IZQUIERDA';
        gestureIcon = '👈';
        navigatePatient(-1);
        break;
    }

    // Notificar al backend (no bloquea la UI)
    window.gestomed.gesture.detected(gesture, handedness).catch(e => console.error(e));

    showGestureToast(gestureIcon, gestureLabel);
    triggerFlashEffect(flashColor);
    if (liveGestureText) { liveGestureText.innerText = `${gestureIcon} ${gestureLabel}`; liveGestureText.style.color = 'var(--accent-green)'; }
    logToConsole(`Gesto: ${gesture}`, 'success');

    setTimeout(() => {
      gestureCooldown = false;
      if (liveGestureText) { liveGestureText.innerText = 'ESPERANDO MANO...'; liveGestureText.style.color = 'var(--text-muted)'; }
      if (liveGestureDot) liveGestureDot.className = 'indicator disconnected';
    }, cooldownDuration);
  }

  function navigatePatient(direction) {
    if (patients.length === 0) return;
    let newIndex = selectedPatientIndex + direction;
    if (newIndex >= patients.length) newIndex = 0;
    else if (newIndex < 0) newIndex = patients.length - 1;
    selectPatient(patients[newIndex], newIndex);
  }

  function showGestureToast(icon, text) {
    if (!toastEffect || !toastIcon || !toastText) return;
    toastIcon.innerText = icon;
    toastText.innerText = text;
    toastEffect.classList.add('show');
    setTimeout(() => toastEffect.classList.remove('show'), 1200);
  }

  function triggerFlashEffect(colorClass) {
    if (!flashEffect) return;
    flashEffect.className = `gesture-flash ${colorClass}`;
    flashEffect.style.opacity = '1';
    setTimeout(() => { flashEffect.style.opacity = '0'; }, 200);
  }

  function showPinchPointer(point) {
    const old = document.getElementById('xray-laser-pointer');
    if (old) old.remove();
    if (!xrayImg || xrayImg.style.display === 'none') return;
    const container = xrayImg.parentElement;
    if (!container) return;

    const pointer = document.createElement('div');
    pointer.id = 'xray-laser-pointer';
    pointer.style.cssText = `position:absolute;left:${(1 - point.x) * container.clientWidth - 10}px;top:${point.y * container.clientHeight - 10}px;width:20px;height:20px;border-radius:50%;background:var(--accent-green);border:2px solid white;box-shadow:0 0 15px var(--accent-green);pointer-events:none;z-index:50;transition:opacity 1s;`;
    container.appendChild(pointer);
    setTimeout(() => { pointer.style.opacity = '0'; setTimeout(() => pointer.remove(), 1000); }, 1000);
  }

  // ==========================================================================
  // 10. ARRANQUE INICIAL
  // ==========================================================================
  await loadPatients();
  if (patients.length > 0) selectPatient(patients[0], 0);
  await refreshSerialPorts();
  logToConsole('GestoMed listo.', 'success');

  // Arrancar la cámara automáticamente (igual que entornoweb.html)
  startWebcam();

}); // Fin DOMContentLoaded
