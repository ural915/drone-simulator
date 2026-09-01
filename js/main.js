import { CESIUM_ION_TOKEN, GOOGLE_3D_TILES_ASSET_ID, DRONE_MODELS, FAMOUS_LOCATIONS } from "./config.js";
import { Joystick } from "./joystick.js";
import { InputManager } from "./input.js";
import { Drone } from "./drone.js";

const $ = (id) => document.getElementById(id);

const AIRCRAFT_ICON = {
  mini4pro: "🚁", air3: "🛸", mavic3pro: "🛸", inspire3: "🎬", fpv: "🏎️", avata2: "🕶️",
};

let currentLocation = FAMOUS_LOCATIONS[0];
let selectedModel = DRONE_MODELS[0];
let viewer, drone, input;
let leftJoy, rightJoy;
let recording = false;
let camMode = "photo";
let mediaRecorder, recordChunks = [];
let recordSeconds = 0;
let lastWarnState = { battery30: false, battery15: false };

// Ayarlar > gerçek DJI Fly menü yapısı (Güvenlik/Kontrol/Kamera/İletim/Hakkında)
const settings = {
  units: "m",             // "m" | "ft"
  stickMode: 2,            // 1 | 2 | 3 (Mode 2 = TR/dünya standardı)
  maxAltitude: 120,
  maxDistance: 500,
  obstacleAvoidance: "brake", // "bypass" | "brake" | "off"
  advancedRTH: true,
  displayRadarMap: true,
  gimbalMode: "follow",    // "follow" | "fpv"
  displayZoom: true,
  subjectScanning: false,
  photoFormat: "jpeg",
  videoFormat: "mp4",
  colorMode: "normal",     // "normal" | "dlog" | "hlg"
  gridlines: false,
  histogram: false,
  overexposure: false,
  antiFlicker: "auto",
  channelMode: "auto",
};
let cinematicUntil = 0;
let bottombarHidden = false;
let zoomLevels = [1];
let zoomIdx = 0;

function cycleZoom(dir) {
  zoomIdx = (zoomIdx + dir + zoomLevels.length) % zoomLevels.length;
  drone.zoom = zoomLevels[zoomIdx];
  $("zoomBadge").textContent = drone.zoom + "x";
}

function buildAircraftGrid() {
  const grid = $("aircraftGrid");
  grid.innerHTML = "";
  DRONE_MODELS.forEach((m) => {
    const card = document.createElement("div");
    card.className = "aircraft-card" + (m.id === selectedModel.id ? " selected" : "");
    card.innerHTML = `
      <div class="ac-icon">${AIRCRAFT_ICON[m.id] || "🚁"}</div>
      <div class="ac-name">${m.name}</div>
      <div class="ac-tag">${m.tag}</div>
      <div class="ac-specs">
        <span><b>${m.modes.S.maxSpeed}</b> m/s Sport</span>
        <span><b>${m.flightTimeMin}</b> dk</span>
      </div>`;
    card.onclick = () => {
      selectedModel = m;
      $("startBtn").disabled = false;
      document.querySelectorAll(".aircraft-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
    };
    grid.appendChild(card);
  });
}

function buildLocationList() {
  const list = $("locList");
  list.innerHTML = "";
  FAMOUS_LOCATIONS.forEach((loc) => {
    const el = document.createElement("div");
    el.className = "loc-item";
    el.innerHTML = `<b>${loc.name}</b><span>${loc.country}</span>`;
    el.onclick = () => {
      teleportTo(loc);
      $("locPanel").classList.remove("open");
    };
    list.appendChild(el);
  });
}

function teleportTo(loc) {
  currentLocation = loc;
  drone.setHome(loc.lon, loc.lat, loc.homeAlt);
  drone.x = 0; drone.y = 0; drone.z = 0;
  drone.vx = drone.vy = drone.vz = 0;
  drone.heading = Cesium.Math.toRadians(loc.heading || 0);
  drone.flying = false;
  drone.armed = false;
  drone.rthActive = false;
  drone.landingActive = false;
  drone.battery = 100;

  cinematicUntil = performance.now() + 2500;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, loc.height),
    orientation: { heading: Cesium.Math.toRadians(loc.heading || 0), pitch: Cesium.Math.toRadians(-25), roll: 0 },
    duration: 2.5,
  });
}

async function initCesium() {
  const hasToken = CESIUM_ION_TOKEN && !CESIUM_ION_TOKEN.startsWith("PASTE_");
  const viewerOptions = {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false, shadows: false,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  };

  if (hasToken) {
    Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
  }
  // Varsayılan ion tabanlı temel katman token'sız 401 verir; kendi katmanımızı elle ekleyeceğiz.
  viewerOptions.baseLayer = false;

  viewer = new Cesium.Viewer("cesiumContainer", viewerOptions);
  viewer.scene.debugShowFramesPerSecond = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.enableLighting = false;
  // Kamerayı tamamen biz sürüyoruz (drone fizikinden) — Cesium'un varsayılan sürükle/yakınlaştır
  // kontrolcüsünü kapatıyoruz ki hem çakışma olmasın hem de canvas'ı gimbal sürüklemesi için kullanabilelim.
  const ctl = viewer.scene.screenSpaceCameraController;
  ctl.enableRotate = ctl.enableTranslate = ctl.enableZoom = ctl.enableTilt = ctl.enableLook = false;

  // Hızlı başlangıç: önce her zaman OSM ile anında uçulabilir hale getir, ağır katmanları arka planda yükle.
  viewer.imageryLayers.addImageryProvider(
    new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })
  );

  if (hasToken) {
    upgradeToPhotorealistic(); // await ETMİYORUZ — arka planda, uçuşu bloklamadan yüklenir
  }
}

async function upgradeToPhotorealistic() {
  pushWarning("🌍 Fotogerçekçi dünya verisi yükleniyor…");
  try {
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_3D_TILES_ASSET_ID);
    tileset.maximumScreenSpaceError = 24; // daha hızlı yüklenmesi için biraz daha düşük detay
    viewer.scene.primitives.add(tileset);
    viewer.scene.globe.show = false; // 3D tiles zeminle birlikte geliyor, çift zemin gereksiz
    pushWarning("✅ Fotogerçekçi dünya hazır");
  } catch (e) {
    console.warn("Fotogerçekçi 3D tiles yüklenemedi, standart görüntü/arazi kullanılıyor:", e.message);
    try {
      const [imagery, terrain] = await Promise.all([
        Cesium.createWorldImageryAsync(),
        Cesium.createWorldTerrainAsync(),
      ]);
      viewer.imageryLayers.addImageryProvider(imagery);
      viewer.terrainProvider = terrain;
    } catch (e2) { /* OSM ile devam */ }
  }
}

// ---------- AYARLAR PANELİ (gerçek DJI Fly menü yapısı) ----------
function row(label, sub, controlHtml) {
  return `<div class="set-row"><div><div class="set-label">${label}</div>${sub ? `<div class="set-sub">${sub}</div>` : ""}</div>${controlHtml}</div>`;
}
function toggleHtml(id, on) {
  return `<button class="set-toggle ${on ? "on" : ""}" data-toggle="${id}"></button>`;
}
function selectHtml(id, options, current) {
  return `<div class="set-select" data-select="${id}">${options
    .map((o) => `<button data-val="${o.v}" class="${o.v === current ? "active" : ""}">${o.l}</button>`)
    .join("")}</div>`;
}
function sliderHtml(id, min, max, step, val, unit) {
  return `<div style="display:flex;align-items:center;gap:8px;"><input type="range" class="set-slider" data-slider="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="set-val" id="setVal-${id}">${val}${unit}</span></div>`;
}

function renderSettingsTab(tab) {
  const body = $("settingsBody");
  let html = "";
  if (tab === "safety") {
    html += `<div class="set-section">Eve Dönüş</div>`;
    html += row("Gelişmiş Eve Dönüş", "Optimum rota / güvenli irtifa ile döner", toggleHtml("advancedRTH", settings.advancedRTH));
    html += row("Radar Haritasını Göster", "Eve dönüş sırasında engel haritası", toggleHtml("displayRadarMap", settings.displayRadarMap));
    html += `<div class="set-section">Uçuş Sınırları</div>`;
    html += row("Maks. İrtifa", "Kalkış noktasına göre", sliderHtml("maxAltitude", 20, 500, 5, settings.maxAltitude, "m"));
    html += row("Maks. Mesafe", "Kalkış noktasına göre", sliderHtml("maxDistance", 50, 8000, 50, settings.maxDistance, "m"));
    html += `<div class="set-section">Engelden Kaçınma</div>`;
    html += row("Engelden Kaçınma Eylemi", "Sport modunda ve Manuel'de her zaman kapalı", selectHtml("obstacleAvoidance", [
      { v: "bypass", l: "Etrafından Dolaş" }, { v: "brake", l: "Fren Yap" }, { v: "off", l: "Kapalı" },
    ], settings.obstacleAvoidance));
    html += `<div class="set-section">Pusula / IMU</div>`;
    html += row("Pusula Kalibrasyonu", "Son kalibrasyon: bugün", `<button class="set-btn" disabled>Kalibre Et</button>`);
    html += row("IMU Durumu", "", `<span class="set-val" style="color:var(--accent)">İyi</span>`);
  } else if (tab === "control") {
    html += `<div class="set-section">Genel</div>`;
    html += row("Birimler", "Hız / yükseklik / mesafe", selectHtml("units", [{ v: "m", l: "Metrik" }, { v: "ft", l: "İngiliz" }], settings.units));
    html += row("Ekran Zoom", "Ekranda iki parmakla yakınlaştır", toggleHtml("displayZoom", settings.displayZoom));
    html += row("Konu Tarama", "Otomatik takip için nesne algıla", toggleHtml("subjectScanning", settings.subjectScanning));
    html += `<div class="set-section">Kumanda</div>`;
    html += row("Stick Modu", "Mode 1: Sol=Pitch/Yaw · Mode 2: Sol=Gaz/Yaw", selectHtml("stickMode", [
      { v: 1, l: "Mode 1" }, { v: 2, l: "Mode 2" }, { v: 3, l: "Mode 3" },
    ], settings.stickMode));
    html += row("Gimbal Modu", "Follow: gövdeyle döner · FPV: sabit açı", selectHtml("gimbalMode", [
      { v: "follow", l: "Follow" }, { v: "fpv", l: "FPV" },
    ], settings.gimbalMode));
    html += row("RC Kalibrasyonu", "", `<button class="set-btn" disabled>Kalibre Et</button>`);
    html += row("Uçuş Eğitimi", "Temel kontrolleri tekrar izle", `<button class="set-btn" disabled>Oynat</button>`);
  } else if (tab === "camera") {
    html += `<div class="set-section">Fotoğraf</div>`;
    html += row("Format", "", selectHtml("photoFormat", [{ v: "jpeg", l: "JPEG" }, { v: "raw", l: "RAW" }, { v: "both", l: "JPEG+RAW" }], settings.photoFormat));
    html += `<div class="set-section">Video</div>`;
    html += row("Format", "", selectHtml("videoFormat", [{ v: "mp4", l: "MP4" }, { v: "mov", l: "MOV" }], settings.videoFormat));
    html += row("Renk Modu", "D-Log M / HLG düzenleme için düz profil kaydeder", selectHtml("colorMode", [
      { v: "normal", l: "Normal" }, { v: "dlog", l: "D-Log M" }, { v: "hlg", l: "HLG" },
    ], settings.colorMode));
    html += row("Çözünürlük", selectedModel.cameraRes, `<span class="set-val">${selectedModel.cameraRes}</span>`);
    html += `<div class="set-section">Genel</div>`;
    html += row("Izgara Çizgileri", "Kompozisyon için 3x3 ızgara", toggleHtml("gridlines", settings.gridlines));
    html += row("Histogram", "Pozlama grafiği göster", toggleHtml("histogram", settings.histogram));
    html += row("Aşırı Pozlama Uyarısı", "\"Zebra\" desenle vurgula", toggleHtml("overexposure", settings.overexposure));
    html += row("Anti-Flicker", "50/60Hz yapay ışık titreşimini önler", selectHtml("antiFlicker", [
      { v: "auto", l: "Oto" }, { v: "50hz", l: "50Hz" }, { v: "60hz", l: "60Hz" },
    ], settings.antiFlicker));
  } else if (tab === "transmission") {
    html += `<div class="set-section">Görüntü Aktarımı</div>`;
    html += row("Frekans", "", selectHtml("channelMode", [{ v: "auto", l: "Oto" }, { v: "2.4", l: "2.4 GHz" }, { v: "5.8", l: "5.8 GHz" }], settings.channelMode));
    html += row("İletim Modu", "O4 — DJI OcuSync 4", `<span class="set-val">O4</span>`);
    html += `<div class="set-section">Canlı Yayın</div>`;
    html += row("RTMP Canlı Yayın", "YouTube/Facebook/özel sunucuya yayınla", `<button class="set-btn" disabled>Yapılandır</button>`);
  } else if (tab === "about") {
    html += `<div class="set-section">Uçak</div>`;
    html += row("Model", "", `<span class="set-val">${selectedModel.name}</span>`);
    html += row("Uçak Adı", "", `<span class="set-val">${selectedModel.id.toUpperCase()}-01</span>`);
    html += row("Seri No", "", `<span class="set-val">SIM${selectedModel.id.slice(0,4).toUpperCase()}0001</span>`);
    html += row("Uçak Yazılımı", "", `<span class="set-val">v08.02.01.00 (güncel)</span>`);
    html += `<div class="set-section">Uygulama</div>`;
    html += row("DJI Fly Simülatör Sürümü", "", `<span class="set-val">1.0.0</span>`);
    html += row("RC Yazılımı", "", `<span class="set-val">v05.01.11.00</span>`);
    html += row("Fly Safe Veritabanı", "", `<span class="set-val">güncel</span>`);
    html += `<div class="set-section">Sıfırlama</div>`;
    html += row("Tüm Ayarları Sıfırla", "", `<button class="set-btn danger" id="resetSettingsBtn">Sıfırla</button>`);
  }
  body.innerHTML = html;
  wireSettingsControls();
}

function wireSettingsControls() {
  const body = $("settingsBody");
  body.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      settings[key] = !settings[key];
      applySettings();
      renderSettingsTab(document.querySelector(".settings-tab.active").dataset.tab);
    });
  });
  body.querySelectorAll("[data-select]").forEach((group) => {
    group.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = group.dataset.select;
        let v = btn.dataset.val;
        if (!isNaN(v) && key === "stickMode") v = parseInt(v, 10);
        settings[key] = v;
        applySettings();
        renderSettingsTab(document.querySelector(".settings-tab.active").dataset.tab);
      });
    });
  });
  body.querySelectorAll("[data-slider]").forEach((slider) => {
    slider.addEventListener("input", () => {
      const key = slider.dataset.slider;
      settings[key] = parseFloat(slider.value);
      $("setVal-" + key).textContent = slider.value + (key === "maxAltitude" || key === "maxDistance" ? "m" : "");
      applySettings();
    });
  });
  const resetBtn = $("resetSettingsBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => location.reload());
}

function applySettings() {
  if (!drone) return;
  drone.maxAltitude = settings.maxAltitude;
  drone.maxDistance = settings.maxDistance;
  drone.obstacleAvoidanceMode = settings.obstacleAvoidance;
}

function setupSettingsPanel() {
  $("menuOpenSettings").addEventListener("click", () => {
    $("moreMenu").classList.remove("open");
    $("settingsPanel").classList.add("open");
    renderSettingsTab("safety");
  });
  $("settingsClose").addEventListener("click", () => $("settingsPanel").classList.remove("open"));
  $("settingsTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".settings-tab");
    if (!tab) return;
    document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderSettingsTab(tab.dataset.tab);
  });
}

// Gerçek DJI Fly'daki gibi: video görüntüsünü yukarı/aşağı sürükleyerek gimbal açısını ayarla.
function setupGimbalDrag() {
  const target = viewer.scene.canvas;
  target.style.touchAction = "none";
  let active = false, startY = 0, startPitch = 0, pointerId = null;
  let hideTimer = null;
  const readout = $("gimbalReadout");

  const isOverHud = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest(".clickable"));
  };

  target.addEventListener("pointerdown", (e) => {
    if (isOverHud(e.clientX, e.clientY)) return; // sanal joystick/panel üstündeyse karışma
    active = true;
    pointerId = e.pointerId;
    startY = e.clientY;
    startPitch = drone.gimbalPitch;
  });
  window.addEventListener("pointermove", (e) => {
    if (!active || e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    drone.gimbalPitch = Cesium.Math.clamp(startPitch - dy * 0.15, -90, 30);
    readout.textContent = Math.round(drone.gimbalPitch) + "°";
    readout.classList.add("show");
    clearTimeout(hideTimer);
  });
  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    active = false;
    hideTimer = setTimeout(() => readout.classList.remove("show"), 500);
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function setupJoysticks() {
  leftJoy = new Joystick($("leftBase"), $("leftStick"));
  rightJoy = new Joystick($("rightBase"), $("rightStick"));
}

const MODE_ORDER = ["C", "N", "S"];

function selectFlightMode(mode) {
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  drone.setMode(mode);
  const badge = $("modeBadge");
  badge.textContent = mode === "C" ? selectedModel.thirdMode : mode;
  badge.className = "mode-badge " + mode;
}

function cycleFlightMode(dir) {
  const idx = MODE_ORDER.indexOf(drone.mode);
  selectFlightMode(MODE_ORDER[(idx + dir + MODE_ORDER.length) % MODE_ORDER.length]);
}

function setupModeSwitch() {
  $("modeSwitch").addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn) return;
    selectFlightMode(btn.dataset.mode);
  });
}

// Her uçağın gerçek 3. modu farklı (Cine ya da Manuel/Acro) — seçilen uçağa göre etiketi güncelle.
function applyThirdModeLabel() {
  const btn = document.querySelector('.mode-btn[data-mode="C"]');
  btn.textContent = selectedModel.thirdMode;
  btn.title = selectedModel.thirdModeName;
  const badge = $("modeBadge");
  if (drone && drone.mode === "C") badge.textContent = selectedModel.thirdMode;
}

function setupHoldButton(btnId, fillId, onComplete, holdMs = 900) {
  const btn = $(btnId), fill = $(fillId);
  let raf, startTime;
  const step = (t) => {
    if (!startTime) startTime = t;
    const pct = Math.min(1, (t - startTime) / holdMs);
    fill.style.width = pct * 100 + "%";
    if (pct >= 1) { onComplete(); cancel(); return; }
    raf = requestAnimationFrame(step);
  };
  const start = (e) => { e.preventDefault(); startTime = null; raf = requestAnimationFrame(step); };
  const cancel = () => { cancelAnimationFrame(raf); fill.style.width = "0%"; startTime = null; };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", cancel);
  btn.addEventListener("pointerleave", cancel);
  btn.addEventListener("pointercancel", cancel);
}

function setupActions() {
  setupHoldButton("takeoffBtn", "takeoffFill", () => {
    if (drone.flying) { drone.land(); } else { drone.takeOff(); }
  });
  setupHoldButton("rthBtn", "rthFill", () => {
    if (drone.rthActive) drone.cancelAuto(); else drone.returnToHome();
  });

  setupGimbalDrag();

  zoomLevels = selectedModel.cameraZoomMax >= 7 ? [1, 2, 4, 7] : selectedModel.cameraZoomMax >= 3 ? [1, 2, 3] : [1, 2, 4];
  zoomIdx = 0;
  $("zoomBadge").addEventListener("click", () => cycleZoom(1));

  $("locBtn").addEventListener("click", () => {
    $("moreMenu").classList.remove("open");
    $("locPanel").classList.toggle("open");
  });
  $("moreBtn").addEventListener("click", () => {
    $("locPanel").classList.remove("open");
    $("moreMenu").classList.toggle("open");
  });
  $("menuChangeAircraft").addEventListener("click", () => location.reload());
  $("menuToggleHint").addEventListener("click", () => {
    const hint = $("gimbalHint");
    hint.style.display = hint.style.display === "none" ? "block" : "none";
    $("moreMenu").classList.remove("open");
  });

  $("camToggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".cam-toggle-btn");
    if (!btn || recording) return; // kayıt sırasında mod değiştirilemez (gerçek DJI Fly'da da böyle)
    document.querySelectorAll(".cam-toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    camMode = btn.dataset.cam;
    $("shutterBtn").classList.toggle("video-mode", camMode === "video");
  });

  $("shutterBtn").addEventListener("click", () => {
    if (camMode === "photo") takePhoto();
    else toggleRecording();
  });
}

function takePhoto() {
  const canvas = viewer.scene.canvas;
  const flash = document.createElement("div");
  flash.style.cssText = "position:absolute;inset:0;background:#fff;opacity:0.8;z-index:60;pointer-events:none;transition:opacity 0.3s;";
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = "0"; setTimeout(() => flash.remove(), 300); });

  const link = document.createElement("a");
  link.download = `DJI_FOTO_${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function toggleRecording() {
  const canvas = viewer.scene.canvas;
  const shutterBtn = $("shutterBtn");
  if (!recording) {
    const stream = canvas.captureStream(30);
    recordChunks = [];
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordChunks, { type: "video/webm" });
      const link = document.createElement("a");
      link.download = `DJI_VIDEO_${Date.now()}.webm`;
      link.href = URL.createObjectURL(blob);
      link.click();
    };
    mediaRecorder.start();
    recording = true;
    recordSeconds = 0;
    shutterBtn.classList.add("recording");
    $("recIndicator").style.display = "flex";
  } else {
    mediaRecorder.stop();
    recording = false;
    shutterBtn.classList.remove("recording");
    $("recIndicator").style.display = "none";
  }
}

function pushWarning(text) {
  const el = document.createElement("div");
  el.className = "warn-toast";
  el.textContent = text;
  $("warnings").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtDist(m) {
  return settings.units === "ft" ? (m * 3.28084).toFixed(1) + "ft" : m.toFixed(1) + "m";
}
function fmtSpeed(ms) {
  return settings.units === "ft" ? (ms * 2.23694).toFixed(1) + "mph" : ms.toFixed(1) + "m/s";
}

function updateHUD() {
  $("tAlt").textContent = fmtDist(drone.altitude);
  $("tDist").textContent = fmtDist(drone.homeDistance);
  $("tHS").textContent = fmtSpeed(drone.horizontalSpeed);
  $("tVS").textContent = fmtSpeed(drone.verticalSpeed);
  $("tTime").textContent = fmtTime(drone.flightSeconds);

  const battery = Math.round(drone.battery);
  $("batteryPct").textContent = battery + "%";
  const fill = $("batteryFill");
  fill.style.width = battery + "%";
  fill.className = "battery-fill" + (battery <= 15 ? " danger" : battery <= 30 ? " warn" : "");

  if (battery <= 30 && !lastWarnState.battery30) { pushWarning("⚠ Batarya %30 altında"); lastWarnState.battery30 = true; }
  if (battery <= 15 && !lastWarnState.battery15) { pushWarning("⚠ Kritik batarya! Eve dönülüyor"); lastWarnState.battery15 = true; }
  if (battery > 30) lastWarnState.battery30 = false;
  if (battery > 15) lastWarnState.battery15 = false;

  const label = $("takeoffLabel");
  label.textContent = drone.flying ? (drone.landingActive ? "🛬 İNİYOR" : "🛬 İNİŞ") : "🛫 KALKIŞ";

  if (recording) {
    recordSeconds += 1 / 60;
    $("recLabel").textContent = fmtTime(recordSeconds);
  }

  // sensör küme renkleri (-1 = bu modelde o yönde sensör yok, örn. DJI FPV/Avata 2)
  const dirs = ["front", "back", "left", "right", "up", "down"];
  let minActiveDist = 999;
  dirs.forEach((d) => {
    const dist = drone.sensors[d];
    const el = $("sen-" + d);
    const cls = dist < 0 ? " inactive" : dist < 1.5 ? " danger" : dist < 4 ? " warn" : dist < 900 ? " ok" : "";
    el.className = "sensor s-" + d + cls;
    if (dist >= 0 && dist < minActiveDist) minActiveDist = dist;
  });
  // Güvenlik noktası: yerdeyken "aşağı" sensörü 0m okur, bu normaldir — sadece uçuş sırasında yakınlık uyarısı ver.
  const safetyDot = $("safetyDot");
  const proximityBad = drone.flying && minActiveDist < 1.5;
  const proximityWarn = drone.flying && minActiveDist < 4;
  safetyDot.className = "safety-dot" + (proximityBad || drone.battery <= 15 ? " danger" : proximityWarn || drone.battery <= 30 ? " warn" : "");

  // minimap
  const dot = $("droneDot");
  const scale = 45 / Math.max(30, drone.homeDistance);
  const mx = Cesium.Math.clamp(drone.x * scale, -45, 45);
  const my = Cesium.Math.clamp(drone.y * scale, -45, 45);
  dot.style.transform = `translate(${mx}px, ${-my}px) rotate(${Cesium.Math.toDegrees(drone.heading)}deg)`;
}

function updateCamera() {
  if (performance.now() < cinematicUntil) return;
  const dronePos = drone._worldPosition();
  const heading = drone.heading;
  const gimbalPitchRad = Cesium.Math.toRadians(drone.gimbalPitch);

  // FPV kamera: drone pozisyonundan, gimbal açısına bakarak
  viewer.camera.setView({
    destination: dronePos,
    orientation: { heading, pitch: gimbalPitchRad, roll: 0 },
  });
  viewer.camera.frustum.fov = Cesium.Math.toRadians(60 / drone.zoom);
}

function mainLoop() {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const controls = input.read();
    if (!input.rcConnected) {
      controls.throttle += leftJoy.y;
      controls.yaw += leftJoy.x;
      controls.pitch += rightJoy.y;
      controls.roll += rightJoy.x;
    } else {
      // Gerçek RC-N3'ün gimbal çarkı gimbal açısını doğrudan sürer.
      drone.gimbalPitch = Cesium.Math.clamp(window.__djiRC.gimbalDial, -90, 30);
    }
    controls.throttle = Cesium.Math.clamp(controls.throttle, -1, 1);
    controls.yaw = Cesium.Math.clamp(controls.yaw, -1, 1);
    controls.pitch = Cesium.Math.clamp(controls.pitch, -1, 1);
    controls.roll = Cesium.Math.clamp(controls.roll, -1, 1);

    // Ayarlar > Kontrol > Stick Modu: Mode 1'de gaz/pitch sol-sağ stickler arasında yer değiştirir.
    if (settings.stickMode === 1) {
      const t = controls.throttle;
      controls.throttle = controls.pitch;
      controls.pitch = t;
    }

    if (input.rcConnected !== bottombarHidden) {
      bottombarHidden = input.rcConnected;
      $("bottombar").querySelectorAll(".joy-wrap").forEach((el) => { el.style.visibility = bottombarHidden ? "hidden" : "visible"; });
    }

    drone.update(dt, controls);
    updateCamera();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function boot() {
  await initCesium();
  drone = new Drone(viewer, selectedModel, currentLocation.lon, currentLocation.lat, currentLocation.homeAlt);
  drone.heading = Cesium.Math.toRadians(currentLocation.heading || 0);
  input = new InputManager();

  $("aircraftBadge").innerHTML =
    `<span>${AIRCRAFT_ICON[selectedModel.id] || "🚁"}</span><span>${selectedModel.name}</span>` +
    `<span class="ac-cam-res">· ${selectedModel.cameraRes}</span>`;
  drone.zoom = 1;
  $("zoomBadge").textContent = "1x";
  input.onGamepadChange = (connected, id) => {
    pushWarning(connected ? `🎮 Gamepad bağlandı: ${id}` : "🎮 Gamepad bağlantısı kesildi");
  };
  input.onRCConnectionChange = (connected) => {
    pushWarning(connected ? "🎮 DJI RC-N3 bağlandı — gerçek kumanda kontrolde" : "🎮 DJI RC-N3 bağlantısı kesildi");
    $("rcBadge").style.display = connected ? "flex" : "none";
  };
  input.onRCButton = (name) => {
    if (name === "shutter") { if (camMode === "photo") takePhoto(); else toggleRecording(); }
    else if (name === "record") toggleRecording();
    else if (name === "goHome") { if (drone.rthActive) drone.cancelAuto(); else drone.returnToHome(); }
    else if (name === "pause") { if (drone.flying) drone.land(); else drone.takeOff(); }
    else if (name === "zoomIn") cycleZoom(1);
    else if (name === "zoomOut") cycleZoom(-1);
    else if (name === "gimbalUp") drone.adjustGimbal(5);
    else if (name === "gimbalDown") drone.adjustGimbal(-5);
    else if (name === "modeNext") cycleFlightMode(1);
    else if (name === "modePrev") cycleFlightMode(-1);
    else if (name === "settings") {
      const isOpen = $("settingsPanel").classList.contains("open");
      $("moreMenu").classList.remove("open");
      $("settingsPanel").classList.toggle("open", !isOpen);
      if (!isOpen) renderSettingsTab("safety");
    }
  };

  setupJoysticks();
  setupModeSwitch();
  setupActions();
  setupSettingsPanel();
  buildLocationList();
  applyThirdModeLabel();
  applySettings();

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(currentLocation.lon, currentLocation.lat, currentLocation.height),
    orientation: { heading: Cesium.Math.toRadians(currentLocation.heading || 0), pitch: Cesium.Math.toRadians(-25), roll: 0 },
    duration: 0,
  });

  mainLoop();
}

if (!CESIUM_ION_TOKEN || CESIUM_ION_TOKEN.startsWith("PASTE_")) {
  $("tokenWarn").textContent =
    "Uyarı: js/config.js içine kendi ücretsiz Cesium ion token'ını eklemedin — dünya haritası düşük kaliteli varsayılan görüntüyle yüklenecek.";
}

buildAircraftGrid();

$("startBtn").addEventListener("click", async () => {
  $("startOverlay").style.display = "none";
  await boot();
});
