// Cesium ion access token - cesium.com/ion adresinden ücretsiz alıp buraya yapıştır.
export const CESIUM_ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6InN2bFJqd2p4cWlFYVBvenIiLCJqdGkiOiI4NDcyMzg4MS0yOTk1LTQ0ODctOWM4NC0yZWQwYjBkNDQ0N2IiLCJpZCI6NDc4MjQ3LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODgyODcyODB9.MpB5xYKuEVk2sGc1LIxarE8y71KbcLvoe6jFCPff9X8";

// Google Photorealistic 3D Tiles - Cesium ion asset ID (hesabında "Google Photorealistic
// 3D Tiles" varlığını eklemen gerekir: ion.cesium.com/assets -> Add -> Google Photorealistic 3D Tiles)
export const GOOGLE_3D_TILES_ASSET_ID = 2275207;

// Gerçek DJI drone modellerinin resmi teknik özellikleri (dji.com/specs sayfalarından, Eylül 2026).
// N/S/C(=Cine) veya N/S/M(=Manuel) — her drone kendi gerçek hız/tırmanma/iniş/sensör verisiyle modellendi.
export const DRONE_MODELS = [
  {
    id: "mini4pro",
    name: "DJI Mini 4 Pro",
    tag: "249g · Hafif sınıf · Omnidirectional sensör",
    weightG: 249,
    flightTimeMin: 34,
    sensorsOmni: true,
    cameraZoomMax: 4,
    cameraRes: "4K/60fps HDR",
    thirdMode: "C",
    thirdModeName: "Cine",
    modes: {
      N: { maxSpeed: 12, maxVerticalSpeed: 5, maxYawRate: 90, accel: 6, avoidance: true },
      S: { maxSpeed: 16, maxVerticalSpeed: 5, maxYawRate: 180, accel: 9, avoidance: false },
      C: { maxSpeed: 3, maxVerticalSpeed: 3, maxYawRate: 30, accel: 2, avoidance: true },
    },
  },
  {
    id: "air3",
    name: "DJI Air 3",
    tag: "720g · Çift kamera (geniş + 3x orta-tele)",
    weightG: 720,
    flightTimeMin: 46,
    sensorsOmni: true,
    cameraZoomMax: 3,
    cameraRes: "4K/100fps HDR",
    thirdMode: "C",
    thirdModeName: "Cine",
    modes: {
      N: { maxSpeed: 10, maxVerticalSpeed: 6, maxYawRate: 100, accel: 6, avoidance: true },
      S: { maxSpeed: 21, maxVerticalSpeed: 10, maxYawRate: 200, accel: 11, avoidance: false },
      C: { maxSpeed: 4, maxVerticalSpeed: 2, maxYawRate: 35, accel: 2.2, avoidance: true },
    },
  },
  {
    id: "mavic3pro",
    name: "DJI Mavic 3 Pro",
    tag: "958g · Üçlü kamera · Tele lens 28x'e kadar",
    weightG: 958,
    flightTimeMin: 43,
    sensorsOmni: true,
    cameraZoomMax: 28,
    cameraRes: "5.1K/50fps (Hasselblad)",
    thirdMode: "C",
    thirdModeName: "Cine",
    modes: {
      N: { maxSpeed: 10, maxVerticalSpeed: 6, maxYawRate: 100, accel: 6, avoidance: true },
      S: { maxSpeed: 21, maxVerticalSpeed: 8, maxYawRate: 200, accel: 11, avoidance: false },
      C: { maxSpeed: 4, maxVerticalSpeed: 2, maxYawRate: 35, accel: 2.2, avoidance: true },
    },
  },
  {
    id: "inspire3",
    name: "DJI Inspire 3",
    tag: "3995g · Sinema sınıfı 8K ProRes RAW",
    weightG: 3995,
    flightTimeMin: 28,
    sensorsOmni: true,
    cameraZoomMax: 1,
    cameraRes: "8K ProRes RAW",
    thirdMode: "C",
    thirdModeName: "Cine",
    modes: {
      N: { maxSpeed: 12, maxVerticalSpeed: 8, maxYawRate: 90, accel: 6, avoidance: true },
      S: { maxSpeed: 26, maxVerticalSpeed: 8, maxYawRate: 180, accel: 11, avoidance: false },
      C: { maxSpeed: 5, maxVerticalSpeed: 3, maxYawRate: 30, accel: 2.5, avoidance: true },
    },
  },
  {
    id: "fpv",
    name: "DJI FPV",
    tag: "795g · Yarış/Manuel · Sadece ön sensör · 0-100km/s 2sn",
    weightG: 795,
    flightTimeMin: 20,
    sensorsOmni: false,
    cameraZoomMax: 1,
    cameraRes: "4K/60fps (150° geniş FOV)",
    thirdMode: "M",
    thirdModeName: "Manuel/Acro",
    modes: {
      N: { maxSpeed: 15, maxVerticalSpeed: 8, maxYawRate: 150, accel: 8, avoidance: true },
      S: { maxSpeed: 27, maxVerticalSpeed: 15, maxYawRate: 250, accel: 16, avoidance: false },
      C: { maxSpeed: 39, maxVerticalSpeed: 20, maxYawRate: 400, accel: 28, avoidance: false }, // Manuel/Acro - sınırsız
    },
  },
  {
    id: "avata2",
    name: "DJI Avata 2",
    tag: "377g · Cinewhoop FPV · Pervane korumalı",
    weightG: 377,
    flightTimeMin: 23,
    sensorsOmni: false,
    cameraZoomMax: 1,
    cameraRes: "4K/60fps",
    thirdMode: "M",
    thirdModeName: "Manuel",
    modes: {
      N: { maxSpeed: 8, maxVerticalSpeed: 6, maxYawRate: 100, accel: 6, avoidance: true },
      S: { maxSpeed: 16, maxVerticalSpeed: 9, maxYawRate: 240, accel: 12, avoidance: false },
      C: { maxSpeed: 27, maxVerticalSpeed: 14, maxYawRate: 360, accel: 20, avoidance: false }, // Manuel - sınırsız
    },
  },
];

export const FAMOUS_LOCATIONS = [
  // Türkiye
  { name: "Kapadokya", country: "Türkiye", lat: 38.6431, lon: 34.8289, height: 1200, heading: 20, homeAlt: 1100 },
  { name: "İstanbul Boğazı", country: "Türkiye", lat: 41.0431, lon: 29.0089, height: 150, heading: 30, homeAlt: 30 },
  { name: "Pamukkale", country: "Türkiye", lat: 37.9142, lon: 29.1189, height: 500, heading: 0, homeAlt: 380 },
  { name: "Nemrut Dağı", country: "Türkiye", lat: 37.9819, lon: 38.7414, height: 2400, heading: 0, homeAlt: 2200 },
  { name: "Efes Antik Kenti", country: "Türkiye", lat: 37.9395, lon: 27.3417, height: 200, heading: 0, homeAlt: 80 },
  { name: "Ayasofya - Sultanahmet", country: "Türkiye", lat: 41.0086, lon: 28.9802, height: 150, heading: 0, homeAlt: 40 },
  { name: "Antalya Konyaaltı", country: "Türkiye", lat: 36.8628, lon: 30.6506, height: 200, heading: 90, homeAlt: 10 },
  // Dünya
  { name: "Eyfel Kulesi, Paris", country: "Fransa", lat: 48.8584, lon: 2.2945, height: 400, heading: 0, homeAlt: 35 },
  { name: "Büyük Kanyon", country: "ABD", lat: 36.1069, lon: -112.1129, height: 2500, heading: 0, homeAlt: 2100 },
  { name: "Özgürlük Anıtı, New York", country: "ABD", lat: 40.6892, lon: -74.0445, height: 250, heading: 0, homeAlt: 5 },
  { name: "Dubai - Burj Khalifa", country: "BAE", lat: 25.1972, lon: 55.2744, height: 900, heading: 0, homeAlt: 10 },
  { name: "Machu Picchu", country: "Peru", lat: -13.1631, lon: -72.5450, height: 2800, heading: 0, homeAlt: 2430 },
  { name: "Büyük Set Resifi", country: "Avustralya", lat: -18.2871, lon: 147.6992, height: 300, heading: 0, homeAlt: 5 },
  { name: "Matterhorn, İsviçre Alpleri", country: "İsviçre", lat: 45.9763, lon: 7.6586, height: 5000, heading: 0, homeAlt: 4478 },
  { name: "Piramitler, Giza", country: "Mısır", lat: 29.9792, lon: 31.1342, height: 350, heading: 0, homeAlt: 60 },
  { name: "Santorini", country: "Yunanistan", lat: 36.3932, lon: 25.4615, height: 300, heading: 0, homeAlt: 100 },
  { name: "Uluru", country: "Avustralya", lat: -25.3444, lon: 131.0369, height: 900, heading: 0, homeAlt: 550 },
  { name: "Fuji Dağı, Japonya", country: "Japonya", lat: 35.3606, lon: 138.7274, height: 4200, heading: 0, homeAlt: 3776 },
];
