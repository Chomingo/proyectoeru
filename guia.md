================================================================================
DOCUMENTO TÉCNICO: PROYECTO GESTOMED - INTERFAZ SIN CONTACTO Y ASISTENCIA ROBÓTICA
================================================================================

[DESCRIPCIÓN GENERAL]
GestoMed es un sistema de visión artificial y robótica asistida diseñado para entornos médicos y quirúrgicos (como quirófanos). Permite a los profesionales de la salud interactuar de forma estéril con expedientes clínicos, examinar radiografías mediante zoom y controlar hardware médico físico (como servomotores y luces indicadoras) mediante gestos en el aire sin contacto.

Esta versión está construida enteramente en JavaScript, utilizando Electron para el entorno de escritorio, MediaPipe para la inteligencia artificial de mapeo de manos en el cliente, y Node.js en el proceso principal para comunicarse con la base de datos local (SQLite) y placas de microcontroladores (Arduino) a través de USB.

--------------------------------------------------------------------------------
1. ARQUITECTURA DEL SISTEMA (¿Cómo fluyen los datos?)
--------------------------------------------------------------------------------

  +--------------------------------------------------------------+
  |                   PROCESO DE RENDERIZADOR (UI)               |
  |  - Cámara Web (Captura de frames)                            |
  |  - MediaPipe Hands CDN (Detección de puntos anatómicos)      |
  |  - Lógica de gestos y eventos en app.js                      |
  +--------------------------------------------------------------+
                                |
                                | (IPC Bridge / Preload)
                                v
  +--------------------------------------------------------------+
  |                   PROCESO PRINCIPAL (Electron)               |
  |  - Node.js (Servicio de Backend)                             |
  |  - SQLite (Log de acciones e información médica)             |
  |  - SerialPort (Comunicación USB por COM)                     |
  +--------------------------------------------------------------+
                                |
                                v (Conexión Serial USB)
  +--------------------------------------------------------------+
  |                   MICROCONTROLADOR (Arduino)                 |
  |  - Escucha el puerto serial y opera servomotores / LEDs      |
  +--------------------------------------------------------------+

--------------------------------------------------------------------------------
2. REQUISITOS E INSTALACIÓN DEL ENTORNO
--------------------------------------------------------------------------------

Para ejecutar la aplicación localmente en tu computadora, sigue estos pasos:

1. Instala Node.js (versión 18 o superior) en tu sistema operativo.
2. Abre la consola de comandos (Terminal/PowerShell) en la carpeta del proyecto.
3. Instala todas las dependencias del proyecto ejecutando:
   > npm install
4. Inicia la aplicación en modo desarrollo:
   > npm run dev

* electron: Contenedor que ejecuta la app como si fuera un programa nativo de Windows.
* @mediapipe/hands: IA encargada de mapear los 21 puntos clave de la mano.
* better-sqlite3: Base de datos ligera e interna donde se registran logs e historiales.
* serialport: Librería de Node.js para interactuar con Arduino mediante puertos USB/COM.

--------------------------------------------------------------------------------
3. TABLA DE GESTOS E INTERACCIÓN
--------------------------------------------------------------------------------

El sistema está entrenado para reaccionar ante los siguientes gestos del cirujano:

* ✊ PUÑO CERRADO (Fist): Detecta si los cuatro dedos principales están contraídos. Restablece el zoom de la radiografía al nivel original (1.0x). Envía el comando "G:FIST\n" al Arduino.
* 👆 DESLIZAR ARRIBA (Swipe Up): Incrementa el zoom de la radiografía en pasos de 0.25x. Envía "G:UP\n" al Arduino.
* 👇 DESLIZAR ABAJO (Swipe Down): Reduce el zoom de la radiografía en pasos de 0.25x. Envía "G:DOWN\n" al Arduino.
* 👉 DESLIZAR DERECHA (Swipe Right): Selecciona el expediente del siguiente paciente de la lista. Envía "G:RIGHT\n" al Arduino.
* 👈 DESLIZAR IZQUIERDA (Swipe Left): Selecciona el expediente del paciente anterior de la lista. Envía "G:LEFT\n" al Arduino.
* 🤏 PINZA / CLICK (Pinch): Detecta si la punta del pulgar y el índice se tocan. Genera un marcador táctil (círculo verde láser) sobre la radiografía. Envía "G:PINCH\n" al Arduino.

--------------------------------------------------------------------------------
4. CÓDIGO ARDUINO: CONTROL HARDWARE (Físico)
--------------------------------------------------------------------------------

Para demostrar la escalabilidad robótica en la feria de ciencias, carga el siguiente código en tu placa Arduino (usando Arduino IDE) y conecta la placa a tu laptop por puerto USB:

```cpp
#include <Servo.h>

Servo pinzaServo; // Objeto para controlar el servomotor
const int pinLedVerde = 5; // Simula encendido de luz quirúrgica
const int pinLedAzul = 6;  // Simula estado de sistema

void setup() {
  Serial.begin(9600); // Iniciar comunicación serial a 9600 baudios
  
  pinzaServo.attach(9); // Servomotor conectado en pin digital 9
  pinzaServo.write(0);  // Inicializar motor en 0 grados
  
  pinMode(pinLedVerde, OUTPUT);
  pinMode(pinLedAzul, OUTPUT);
  
  // LED de encendido/sistema listo
  digitalWrite(pinLedAzul, HIGH);
}

void loop() {
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim(); // Limpiar espacios o saltos de línea adicionales
    
    if (comando == "G:FIST") {
      // Puño cerrado: Girar motor a 0 grados (cerrar/bloquear)
      pinzaServo.write(0);
      digitalWrite(pinLedVerde, LOW);
    }
    else if (comando == "G:PINCH") {
      // Pinza: Hacer parpadear la luz
      digitalWrite(pinLedVerde, HIGH);
      delay(200);
      digitalWrite(pinLedVerde, LOW);
    }
    else if (comando == "G:UP") {
      // Deslizar arriba: Mover motor a 90 grados (subir brazo de luz)
      pinzaServo.write(90);
      digitalWrite(pinLedVerde, HIGH);
    }
    else if (comando == "G:DOWN") {
      // Deslizar abajo: Mover motor a 180 grados (bajar brazo de luz)
      pinzaServo.write(180);
      digitalWrite(pinLedVerde, HIGH);
    }
    else if (comando == "G:RIGHT") {
      // Destello rápido en LED azul al cambiar de paciente
      digitalWrite(pinLedAzul, LOW);
      delay(150);
      digitalWrite(pinLedAzul, HIGH);
    }
    else if (comando == "G:LEFT") {
      // Dos destellos rápidos en LED azul al retroceder paciente
      digitalWrite(pinLedAzul, LOW);
      delay(100);
      digitalWrite(pinLedAzul, HIGH);
      delay(100);
      digitalWrite(pinLedAzul, LOW);
      delay(100);
      digitalWrite(pinLedAzul, HIGH);
    }
  }
}
```

--------------------------------------------------------------------------------
5. GUÍA DE PRESENTACIÓN PARA LA FERIA EUREKA
--------------------------------------------------------------------------------

Para impresionar a los jurados evaluadores de la feria científica Eureka, te recomendamos estructurar tu presentación de la siguiente manera:

1. **Planteamiento del Problema (Infecciones Nosocomiales):**
   Explica que en un quirófano, el contacto físico directo de los cirujanos con pantallas, teclados o mouse para revisar el historial del paciente o hacer zoom en una radiografía rompe la esterilidad, lo cual incrementa el riesgo de infecciones intrahospitalarias severas.
2. **La Solución (GestoMed):**
   Muestra cómo el cirujano puede operar el software a 1 o 2 metros de distancia haciendo gestos intuitivos en el aire que la cámara web y la inteligencia artificial detectan al instante.
3. **Demostración en Vivo (Interactividad):**
   - Muestra cómo cambias de expediente médico con deslizar la mano.
   - Demuestra el zoom de la radiografía en pantalla completa deslizando arriba/abajo.
   - Haz un puño cerrado para resetear el zoom.
   - Utiliza la pinza para apuntar una anomalía de la radiografía al jurado.
4. **La Integración de Ingeniería (Arduino):**
   Explica que el sistema no solo controla una pantalla, sino que envía comandos por USB a un microcontrolador que puede accionar lámparas de iluminación quirúrgicas reales o posicionar brazos robóticos de soporte.

================================================================================
                       FIN DEL ARCHIVO DE DOCUMENTACIÓN
================================================================================