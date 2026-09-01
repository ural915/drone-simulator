const DEG = Cesium.Math.toRadians;

// DJI benzeri dört-motorlu drone - ENU (Doğu-Kuzey-Yukarı) yerel koordinatlarında fizik.
// Her drone modelinin kendi hız/ivme/sensör profili DRONE_MODELS'ten (config.js) gelir.
export class Drone {
  constructor(viewer, droneModel, originLon, originLat, originHeight) {
    this.viewer = viewer;
    this.model = droneModel;
    this.setHome(originLon, originLat, originHeight);

    // local state
    this.x = 0; // east (m)
    this.y = 0; // north (m)
    this.z = 0; // up (m), relative to home
    this.heading = 0; // rad
    this.pitchVisual = 0; // gövde eğimi (görsel)
    this.rollVisual = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;

    this.gimbalPitch = -20; // derece, -90 (aşağı) .. +30 (yukarı)
    this.zoom = 1; // 1x - 4x
    this.armed = false;
    this.flying = false;
    this.mode = "N";
    this.battery = 100;
    this.flightSeconds = 0;
    this.rthActive = false;
    this.landingActive = false;
    this.homeDistance = 0;
    this.sensors = { front: 999, back: 999, left: 999, right: 999, up: 999, down: 999 };
    this._sensorTimer = 0;

    // Ayarlar menüsünden (Güvenlik sekmesi) gelen sınırlar ve engel kaçınma davranışı
    this.maxAltitude = 120; // m, DJI varsayılanı
    this.maxDistance = 500; // m
    this.obstacleAvoidanceMode = "brake"; // "bypass" | "brake" | "off"

    this.entity = this._createEntity();
  }

  setHome(lon, lat, height) {
    this.homeLon = lon;
    this.homeLat = lat;
    this.homeHeight = height;
    this.homeCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    this.enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(this.homeCartesian);
  }

  _createEntity() {
    const drone = this;
    const positionProperty = new Cesium.CallbackProperty(() => drone._worldPosition(), false);
    const orientationProperty = new Cesium.CallbackProperty(() => drone._orientation(), false);
    return this.viewer.entities.add({
      position: positionProperty,
      orientation: orientationProperty,
      model: {
        uri: "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumDrone/CesiumDrone.glb",
        minimumPixelSize: 48,
        maximumScale: 8,
        scale: 1,
      },
      point: { pixelSize: 0 }, // model yüklenemezse görünmez fallback
    });
  }

  _worldPosition() {
    const local = new Cesium.Cartesian3(this.x, this.y, this.z);
    return Cesium.Matrix4.multiplyByPoint(this.enuMatrix, local, new Cesium.Cartesian3());
  }

  _orientation() {
    const pos = this._worldPosition();
    const hpr = new Cesium.HeadingPitchRoll(this.heading, this.pitchVisual, this.rollVisual);
    return Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
  }

  takeOff() {
    if (this.flying) return;
    this.armed = true;
    this.flying = true;
    this.rthActive = false;
    this.landingActive = false;
    if (this.z < 1.2) this.z = 1.2;
  }

  land() {
    if (!this.flying) return;
    this.landingActive = true;
    this.rthActive = false;
  }

  returnToHome() {
    if (!this.flying) return;
    this.rthActive = true;
    this.landingActive = false;
  }

  cancelAuto() {
    this.rthActive = false;
    this.landingActive = false;
  }

  setMode(mode) {
    this.mode = mode;
  }

  setModel(droneModel) {
    this.model = droneModel;
  }

  adjustGimbal(deltaDeg) {
    this.gimbalPitch = Cesium.Math.clamp(this.gimbalPitch + deltaDeg, -90, 30);
  }

  adjustZoom(deltaX) {
    this.zoom = Cesium.Math.clamp(this.zoom + deltaX, 1, 4);
  }

  get altitude() {
    return this.z;
  }

  get horizontalSpeed() {
    return Math.hypot(this.vx, this.vy);
  }

  get verticalSpeed() {
    return this.vz;
  }

  // controls: {throttle, yaw, pitch, roll} each -1..1
  update(dt, controls) {
    const cfg = this.model.modes[this.mode];
    this.flightSeconds += this.flying ? dt : 0;
    if (this.flying && !this.landingActive) {
      const baseDrain = 100 / (this.model.flightTimeMin * 60);
      const modeMul = this.mode === "S" ? 1.3 : this.mode === "C" ? 0.85 : 1;
      this.battery = Math.max(0, this.battery - dt * baseDrain * modeMul);
      if (this.battery <= 8 && !this.rthActive && !this.landingActive) this.rthActive = true;
    }

    if (this.rthActive) {
      this._autoReturnHome(dt, cfg);
    } else if (this.landingActive) {
      this._autoLand(dt);
    } else if (this.flying) {
      this._manualControl(dt, cfg, controls);
    } else {
      this.vx = this.vy = this.vz = 0;
    }

    // entegrasyon
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z = Math.max(0, this.z + this.vz * dt);
    if (this.z === 0 && this.vz < 0) {
      this.vz = 0;
      if (this.landingActive) {
        this.flying = false;
        this.armed = false;
        this.landingActive = false;
      }
    }

    // görsel eğim: hız yönünden yaklaşık hesap
    const targetPitchVisual = Cesium.Math.clamp(-this.vy * 0.03 * (cfg.maxSpeed > 0 ? 1 : 0), DEG(-25), DEG(25)) +
      Cesium.Math.clamp(-Math.cos(this.heading) * 0, 0, 0);
    this.pitchVisual = Cesium.Math.lerp(this.pitchVisual, this._forwardTilt(), Math.min(1, dt * 6));
    this.rollVisual = Cesium.Math.lerp(this.rollVisual, this._lateralTilt(), Math.min(1, dt * 6));

    this.homeDistance = Math.hypot(this.x, this.y);

    this._sensorTimer -= dt;
    if (this._sensorTimer <= 0) {
      this._sensorTimer = 0.25;
      this._updateSensors();
    }
  }

  _forwardTilt() {
    // body-frame ileri hız -> burun aşağı eğim
    const fwd = this.vx * Math.sin(this.heading) + this.vy * Math.cos(this.heading);
    return Cesium.Math.clamp(-fwd * 0.035, DEG(-25), DEG(25));
  }

  _lateralTilt() {
    const lat = this.vx * Math.cos(this.heading) - this.vy * Math.sin(this.heading);
    return Cesium.Math.clamp(-lat * 0.035, DEG(-25), DEG(25));
  }

  _manualControl(dt, cfg, controls) {
    const { throttle, yaw, pitch, roll } = controls;
    // yaw
    this.heading += DEG(cfg.maxYawRate) * yaw * dt;

    // hedef body-frame hızlar
    const targetFwd = pitch * cfg.maxSpeed;
    const targetLat = roll * cfg.maxSpeed;
    const targetUp = throttle * cfg.maxVerticalSpeed;

    // body -> world (ENU) dönüşümü
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const targetVx = targetFwd * sin + targetLat * cos;
    const targetVy = targetFwd * cos - targetLat * sin;

    const accel = cfg.accel;
    this.vx = this._approach(this.vx, targetVx, accel * dt);
    this.vy = this._approach(this.vy, targetVy, accel * dt);
    this.vz = this._approach(this.vz, targetUp, accel * dt);

    // basit engel kaçınma: mod + Ayarlar > Güvenlik > Engel Kaçınma birlikte belirler
    const avoidanceActive = cfg.avoidance && this.obstacleAvoidanceMode === "brake";
    if (avoidanceActive) {
      if (this.sensors.front < 3 && this.vx * sin + this.vy * cos > 0) {
        this.vx *= 0.1;
        this.vy *= 0.1;
      }
      if (this.sensors.down < 1.5 && this.vz < 0) this.vz = Math.max(this.vz, -0.3);
    }

    // Ayarlar > Güvenlik: Maks. İrtifa / Maks. Mesafe sınırları
    if (this.z >= this.maxAltitude && this.vz > 0) this.vz = 0;
    const distNow = Math.hypot(this.x + this.vx * dt, this.y + this.vy * dt);
    if (distNow >= this.maxDistance) {
      const outward = (this.x * this.vx + this.y * this.vy) / Math.max(1, Math.hypot(this.x, this.y));
      if (outward > 0) { this.vx *= 0.05; this.vy *= 0.05; }
    }
  }

  _approach(current, target, maxDelta) {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
  }

  _autoReturnHome(dt, cfg) {
    const rthAlt = Math.max(this.z, 30);
    if (this.z < rthAlt - 0.5) {
      this.vz = this._approach(this.vz, cfg.maxVerticalSpeed, cfg.accel * dt);
      this.vx = this._approach(this.vx, 0, cfg.accel * dt);
      this.vy = this._approach(this.vy, 0, cfg.accel * dt);
      return;
    }
    const dist = Math.hypot(this.x, this.y);
    if (dist > 1.5) {
      const dirX = -this.x / dist;
      const dirY = -this.y / dist;
      this.heading = Math.atan2(dirX, dirY);
      this.vx = this._approach(this.vx, dirX * cfg.maxSpeed, cfg.accel * dt);
      this.vy = this._approach(this.vy, dirY * cfg.maxSpeed, cfg.accel * dt);
      this.vz = this._approach(this.vz, 0, cfg.accel * dt);
    } else {
      this.vx = this._approach(this.vx, 0, cfg.accel * dt);
      this.vy = this._approach(this.vy, 0, cfg.accel * dt);
      this.landingActive = true;
      this.rthActive = false;
    }
  }

  _autoLand(dt) {
    this.vx = this._approach(this.vx, 0, 8 * dt);
    this.vy = this._approach(this.vy, 0, 8 * dt);
    this.vz = this._approach(this.vz, -1.2, 3 * dt);
  }

  _updateSensors() {
    // Basitleştirilmiş: zemine olan dikey mesafe gerçek terrain'den, yatay yönler yaklaşık.
    this.sensors.down = this.z;
    // FPV / Avata gibi modellerde sadece ön sensör var (gerçek DJI FPV/Avata omnidirectional değildir).
    this.sensors.up = this.model.sensorsOmni ? 999 : -1;
    this.sensors.left = this.model.sensorsOmni ? 999 : -1;
    this.sensors.right = this.model.sensorsOmni ? 999 : -1;
    this.sensors.back = this.model.sensorsOmni ? 999 : -1;
    this.sensors.front = 999;
  }
}
