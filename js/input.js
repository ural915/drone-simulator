// Klavye + Gamepad (DualSense/Xbox gibi standart Bluetooth/USB oyun kolu — asıl kontrol yöntemi)
// + dokunmatik ekran joystick'leri (main.js'te eklenir, gamepad'le birlikte çalışır) +
// isteğe bağlı gerçek DJI RC-N3 köprüsü (native iOS kabuğu varsa) girişlerini birleştirir.
// DualSense (ve standart eşlemeli her gamepad) buton indeksi -> uygulama eylemi.
// Standart Gamepad API: 0=Cross,1=Circle,2=Square,3=Triangle,4=L1,5=R1,9=Options,12-15=D-pad.
const GAMEPAD_BUTTON_ACTIONS = {
  0: "pause", // Cross: Kalkış/İniş
  1: "goHome", // Circle: Eve Dön
  2: "shutter", // Square: Fotoğraf/Video çek
  3: "record", // Triangle: Kayıt başlat/durdur
  4: "zoomOut", // L1
  5: "zoomIn", // R1
  9: "settings", // Options
  12: "gimbalUp", // D-pad yukarı
  13: "gimbalDown", // D-pad aşağı
  14: "modePrev", // D-pad sol
  15: "modeNext", // D-pad sağ
};

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.gamepadIndex = null;
    this._prevGamepadButtons = {};
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("gamepadconnected", (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.onGamepadChange?.(true, e.gamepad.id);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
      this.onGamepadChange?.(false, e.gamepad.id);
    });

    // --- Native DJI RC-N3 köprüsü (iOS uygulama kabuğu bu global'leri dolduracak) ---
    window.__djiRC = { connected: false, leftStick: { h: 0, v: 0 }, rightStick: { h: 0, v: 0 }, gimbalDial: 0 };
    window.setDJIRCState = (state) => {
      const wasConnected = window.__djiRC.connected;
      Object.assign(window.__djiRC, state);
      if (state.connected !== undefined && state.connected !== wasConnected) {
        this.onRCConnectionChange?.(state.connected);
      }
    };
    window.__djiRCButton = (name) => { this.onRCButton?.(name); };
  }

  get rcConnected() {
    return !!window.__djiRC?.connected;
  }

  _keyAxis(negCode, posCode) {
    let v = 0;
    if (this.keys.has(negCode)) v -= 1;
    if (this.keys.has(posCode)) v += 1;
    return v;
  }

  _deadzone(v, dz = 0.08) {
    return Math.abs(v) < dz ? 0 : v;
  }

  // returns {throttle, yaw, pitch, roll} each -1..1, Mode 2 layout
  read() {
    // Gerçek DJI RC-N3 bağlıysa (native köprü üzerinden) her zaman öncelikli — gerçek donanım kazanır.
    if (this.rcConnected) {
      const rc = window.__djiRC;
      return {
        throttle: this._deadzone(rc.leftStick.v),
        yaw: this._deadzone(rc.leftStick.h),
        pitch: this._deadzone(rc.rightStick.v),
        roll: this._deadzone(rc.rightStick.h),
      };
    }

    let throttle = this._keyAxis("KeyS", "KeyW"); // left stick Y (W/S) - alt.
    let yaw = this._keyAxis("KeyA", "KeyD"); // left stick X - yaw
    let pitch = this._keyAxis("ArrowDown", "ArrowUp"); // right stick Y - ileri/geri
    let roll = this._keyAxis("ArrowLeft", "ArrowRight"); // right stick X - sağa/sola

    if (this.gamepadIndex !== null) {
      const gp = navigator.getGamepads()[this.gamepadIndex];
      if (gp) {
        const lx = this._deadzone(gp.axes[0] || 0);
        const ly = this._deadzone(gp.axes[1] || 0);
        const rx = this._deadzone(gp.axes[2] || 0);
        const ry = this._deadzone(gp.axes[3] || 0);
        if (Math.abs(lx) > Math.abs(yaw)) yaw = lx;
        if (Math.abs(-ly) > Math.abs(throttle)) throttle = -ly;
        if (Math.abs(rx) > Math.abs(roll)) roll = rx;
        if (Math.abs(-ry) > Math.abs(pitch)) pitch = -ry;
        this._readGamepadButtons(gp);
      }
    }
    return { throttle, yaw, pitch, roll };
  }

  // DualSense (Cross/Circle/Square/Triangle/L1/R1/Options/D-pad) — kenar tetiklemeli buton okuma.
  _readGamepadButtons(gp) {
    for (const idxStr in GAMEPAD_BUTTON_ACTIONS) {
      const idx = Number(idxStr);
      const pressed = !!gp.buttons[idx]?.pressed;
      const wasPressed = !!this._prevGamepadButtons[idx];
      if (pressed && !wasPressed) this.onRCButton?.(GAMEPAD_BUTTON_ACTIONS[idx]);
      this._prevGamepadButtons[idx] = pressed;
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }
}
