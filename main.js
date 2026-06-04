mapboxgl.accessToken =
  "pk.eyJ1IjoieXV0YW9saW4iLCJhIjoiY21wNWI0MDl5MDlldTJwcTI3bmtkY3h3NiJ9.7aMzhLHSwm6BOedHTptjNA";

mapboxgl.workerCount = 4;

const views = {
  global: {
    center: [15, 8],
    zoom: 2.2,
    pitch: 25,
    bearing: 0,
    offset: [0, -95]
  },
  amazon: {
    center: [-62, -7],
    zoom: 3.9,
    pitch: 60,
    bearing: -18
  },
  sahel: {
    center: [8, 14],
    zoom: 4.2,
    pitch: 60,
    bearing: 10
  },
  china: {
    center: [110, 41],
    zoom: 4.3,
    pitch: 60,
    bearing: -15
  }
};

if (window.innerWidth <= 650) {
  views.global.zoom = 1.35;
  views.global.pitch = 15;

  views.amazon.zoom = 3.45;
  views.amazon.pitch = 45;

  views.sahel.zoom = 3.65;
  views.sahel.pitch = 45;

  views.china.zoom = 3.75;
  views.china.pitch = 45;
}

const storyText = {
  global: {
    title: "Global Vegetation Growth",
    text: "Across the world, vegetation has not changed evenly. This map uses MODIS NDVI satellite data to show where plant life appears to have expanded, declined, or remained relatively stable from 2000 to 2025. Green spikes highlight areas of vegetation growth, while orange spikes show decline. The global view gives readers a broad overview before they zoom into specific regions to explore local patterns."
  },
  amazon: {
    title: "Amazon Basin",
    text: "The Amazon Basin remains one of the greenest regions in the dataset, with average NDVI staying high across 2000, 2013, and 2025. However, the chart also shows that not all areas moved in the same direction: about 35% of changed cells show vegetation decline. These orange patches may reflect land-use pressure along deforestation frontiers, where forest has been cleared for cattle ranching, farming, roads, and settlement. In Brazil, INPE’s PRODES program monitors Amazon deforestation with satellite data, and NASA has shown that MODIS vegetation-index imagery can reveal where forest loss is most intense. The map therefore shows both the Amazon’s continued high vegetation density and the uneven signs of human-driven forest loss."
  },
  sahel: {
    title: "Sahel / West Africa",
    text: "The Sahel is a transition zone between the Sahara Desert and the wetter landscapes of West Africa, so small changes in rainfall, land use, and drought can strongly affect vegetation. In this map, average NDVI rises from about 0.391 in 2000 to 0.405 in 2025, and the chart shows more growth cells than decline cells. This fits with research showing that parts of the Sahel have experienced “re-greening” since the severe droughts of the late twentieth century, partly linked to rainfall recovery. However, the orange decline areas show that this recovery is uneven: dryland degradation, grazing pressure, farming expansion, and recurring drought still affect many places. The Great Green Wall initiative also reflects this regional challenge, aiming to restore degraded landscapes across the Sahel rather than treating the region as uniformly recovered."
  },
  china: {
    title: "Northern China / Inner Mongolia",
    text: "Northern China and Inner Mongolia show one of the clearest greening signals in this project. In the chart, average NDVI rises from about 0.296 in 2000 to 0.409 in 2025, and nearly all changed cells are classified as vegetation growth. This pattern matches research showing strong greening across parts of northern China, especially in regions affected by ecological restoration programs such as the Three-North Shelter Forest Program and Grain for Green. These projects were designed to reduce desertification, soil erosion, and dust-storm impacts by restoring vegetation in dryland and grassland areas. However, the map should not be read as a simple success story everywhere: small orange patches remain, and researchers note that climate variability, grazing pressure, water limits, and local land-use changes can still produce uneven outcomes across Inner Mongolia’s fragile drylands."
  }
};

const tourSteps = [
  {
    title: "Why this project?",
    text: "Many people might assume human activity has simply caused Earth to lose vegetation everywhere. This project starts from a more complicated question: where is the planet getting greener, where is vegetation declining, and why do these patterns differ by region?",
    mode: "present",
    view: "global"
  },
  {
    title: "Start with the global pattern",
    text: "The change view uses green spikes for vegetation growth and orange spikes for vegetation decline between 2000 and 2025. Instead of one simple global trend, the map shows a patchwork of growth and loss.",
    mode: "change",
    view: "global"
  },
  {
    title: "Zoom into regional stories",
    text: "Use the region menu to jump into places where the global pattern becomes easier to interpret. The Amazon, Sahel / West Africa, and Northern China / Inner Mongolia each tell a different vegetation-change story.",
    mode: "change",
    view: "amazon"
  },
  {
    title: "Use the chart for context",
    text: "The summary chart helps explain the selected region. It shows average NDVI for 2000, 2013, and 2025, plus the share of changed cells showing growth or decline.",
    mode: "change",
    view: "sahel",
    openChart: true
  },
  {
    title: "Compare years directly",
    text: "The Compare tab lets readers place earlier vegetation layers beside 2025. This helps separate long-term change from the latest vegetation pattern.",
    mode: "compare",
    view: "global"
  }
];

const regionBounds = {
  global: [-180, 180, -60, 85],
  amazon: [-80, -45, -20, 10],
  sahel: [-20, 35, 5, 20],
  china: [95, 125, 35, 47]
};

const chartStatsCache = {};

let previousNdviBarWidths = {
  "2000": 0,
  "2013": 0,
  "2025": 0
};

const spikeFilesByDetail = {
  "2000": {
    low: "data/actual_ndvi_spikes_2000_low.json",
    medium: "data/actual_ndvi_spikes_2000_medium.json",
    high: "data/actual_ndvi_spikes_2000_high.json"
  },
  "2013": {
    low: "data/actual_ndvi_spikes_2013_low.json",
    medium: "data/actual_ndvi_spikes_2013_medium.json",
    high: "data/actual_ndvi_spikes_2013_high.json"
  },
  "2025": {
    low: "data/actual_ndvi_spikes_2025_low.json",
    medium: "data/actual_ndvi_spikes_2025_medium.json",
    high: "data/actual_ndvi_spikes_2025_high.json"
  }
};

const changeFilesByDetail = {
  low: "data/actual_ndvi_change_2000_2025_low.json",
  medium: "data/actual_ndvi_change_2000_2025_medium.json",
  high: "data/actual_ndvi_change_2000_2025_high.json"
};

const emptyGeoJSON = {
  type: "FeatureCollection",
  features: []
};

let currentMode = "present";
let activeView = "global";
let compareBaseYear = "2000";
let currentTourStep = 0;

let cachedData = {};
let cachedChangeData = {};
let syncing = false;
let isLoadingDetail = false;
let appReady = false;

let activeDetail = {
  present: "low",
  compare: null,
  change: null
};

const mapOptions = {
  style: "mapbox://styles/mapbox/light-v11",
  center: views.global.center,
  zoom: views.global.zoom,
  pitch: views.global.pitch,
  bearing: views.global.bearing,
  antialias: false,
  projection: "mercator",
  renderWorldCopies: true
};

const singleMap = new mapboxgl.Map({
  container: "single-map",
  ...mapOptions
});

const leftMap = new mapboxgl.Map({
  container: "left-map",
  ...mapOptions
});

const rightMap = new mapboxgl.Map({
  container: "right-map",
  ...mapOptions
});

singleMap.addControl(new mapboxgl.NavigationControl(), "top-right");
rightMap.addControl(new mapboxgl.NavigationControl(), "bottom-right");

const maps = [singleMap, leftMap, rightMap];

setupSplashScreen();

Promise.all(maps.map(waitForMapLoad)).then(initAllMaps);

function waitForMapLoad(map) {
  return new Promise(resolve => {
    map.on("load", () => resolve(map));
  });
}

async function initAllMaps() {
  removeMapLighting(singleMap);
  removeMapLighting(leftMap);
  removeMapLighting(rightMap);

  updateSplashStatus("Loading 2025 vegetation layer...");

  const data2025Low = await getGeoJSON("2025", "low");

  setupMapLayer(singleMap, data2025Low, "present");
  setupMapLayer(leftMap, emptyGeoJSON, "compare");
  setupMapLayer(rightMap, emptyGeoJSON, "compare");

  addChangeLayerToSingleMap(emptyGeoJSON);

  setupTopTabs();
  setupCompareYearSwitch();
  setupRegionJump();
  setupThemeSwitcher();
  setupMobileChartToggle();
  setupAboutModal();
  setupGuidedTour();
  setupPopup(singleMap);
  setupPopup(leftMap);
  setupPopup(rightMap);
  syncCompareMaps();
  setupDetailSwitching();

  updateStoryPanel("global");
  updateRegionCharts("global");

  document.body.classList.remove("mode-compare", "mode-change");
  document.body.classList.add("mode-present");

  currentMode = "present";
  activeView = "global";
  activeDetail.present = "low";

  jumpMapTo(singleMap, views.global);
  resizeMaps();

  preloadLikelyNextFiles();

  appReady = true;
  updateSplashStatus("Map ready. Click Start to explore.");
  enableStartButton();
}

function setupThemeSwitcher() {
  const themeSelect = document.querySelector("#theme-select");

  if (!themeSelect) return;

  const savedTheme = localStorage.getItem("theme-preference") || "auto";

  document.documentElement.dataset.theme = savedTheme;
  themeSelect.value = savedTheme;

  themeSelect.addEventListener("change", () => {
    const selectedTheme = themeSelect.value;

    localStorage.setItem("theme-preference", selectedTheme);
    document.documentElement.dataset.theme = selectedTheme;
  });
}

function removeMapLighting(map) {
  if (map.setLight) {
    map.setLight({
      anchor: "viewport",
      color: "#ffffff",
      intensity: 0
    });
  }

  if (map.setFog) {
    map.setFog(null);
  }
}

function preloadLikelyNextFiles() {
  setTimeout(() => {
    getGeoJSON("2025", "medium");
    getGeoJSON("2000", "medium");
    getGeoJSON("2013", "medium");
    getChangeGeoJSON("medium");
  }, 1500);
}

function setupMapLayer(map, data, mode) {
  removeMapLighting(map);

  map.addSource("spikes", {
    type: "geojson",
    data
  });

  map.addLayer({
    id: "spikes-layer",
    type: "fill-extrusion",
    source: "spikes",
    paint: getSpikePaint(mode)
  });
}

function addChangeLayerToSingleMap(data) {
  singleMap.addSource("change-spikes", {
    type: "geojson",
    data
  });

  singleMap.addLayer({
    id: "change-spikes-layer",
    type: "fill-extrusion",
    source: "change-spikes",
    layout: {
      visibility: "none"
    },
    paint: getChangePaint()
  });
}

function getSpikePaint(mode) {
  return {
    "fill-extrusion-color": [
      "interpolate",
      ["linear"],
      ["get", "greenness"],
      0.00, "#efe7d3",
      0.10, "#dccca3",
      0.22, "#c8d18f",
      0.38, "#96c975",
      0.55, "#4fb66f",
      0.72, "#159978",
      0.88, "#006f7f",
      1.00, "#103f91"
    ],
    "fill-extrusion-height": ["get", "height"],
    "fill-extrusion-base": 0,
    "fill-extrusion-opacity": mode === "compare" ? 0.65 : 0.92,
    "fill-extrusion-vertical-gradient": false,
    "fill-extrusion-emissive-strength": 1,
    "fill-extrusion-ambient-occlusion-intensity": 0,
    "fill-extrusion-ambient-occlusion-radius": 0
  };
}

function getChangePaint() {
  return {
    "fill-extrusion-color": [
      "case",
      [">", ["get", "change"], 0],
      "#2ca25f",
      "#e76f51"
    ],
    "fill-extrusion-height": [
      "min",
      ["*", ["abs", ["get", "change"]], 320000],
      65000
    ],
    "fill-extrusion-base": 0,
    "fill-extrusion-opacity": 0.72,
    "fill-extrusion-vertical-gradient": false,
    "fill-extrusion-emissive-strength": 1,
    "fill-extrusion-ambient-occlusion-intensity": 0,
    "fill-extrusion-ambient-occlusion-radius": 0
  };
}

function detailFromZoom(zoom, viewName = activeView) {
  if (zoom >= 5.3) return "high";

  if (viewName !== "global") {
    if (zoom >= 4.8) return "high";
    return "medium";
  }

  if (zoom >= 3.2) return "medium";

  return "low";
}

function changeDetailFromZoom(zoom, viewName = activeView) {
  if (viewName === "global") {
    if (zoom >= 5.3) return "high";
    if (zoom >= 3.2) return "medium";
    return "low";
  }

  return "high";
}

async function getGeoJSON(year, detail) {
  const key = `${year}-${detail}`;

  if (!cachedData[key]) {
    cachedData[key] = await loadGeoJSON(spikeFilesByDetail[year][detail]);
  }

  return cachedData[key];
}

async function getChangeGeoJSON(detail) {
  if (!cachedChangeData[detail]) {
    cachedChangeData[detail] = await loadGeoJSON(changeFilesByDetail[detail]);
  }

  return cachedChangeData[detail];
}

async function loadGeoJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return await response.json();
}

function debounce(func, wait) {
  let timeout;

  return function(...args) {
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

function setupDetailSwitching() {
  const handleSingleZoom = debounce(async () => {
    if (currentMode === "present" || currentMode === "change") {
      await loadDetailForCurrentView(activeView, getCurrentCamera(singleMap));
    }
  }, 300);

  const handleCompareZoom = debounce(async map => {
    if (currentMode === "compare") {
      await loadDetailForCurrentView(activeView, getCurrentCamera(map));
    }
  }, 300);

  singleMap.on("zoomend", handleSingleZoom);
  leftMap.on("zoomend", () => handleCompareZoom(leftMap));
  rightMap.on("zoomend", () => handleCompareZoom(rightMap));
}

async function loadDetailForCurrentView(viewName, view) {
  if (isLoadingDetail || !view) return;

  const detail =
    currentMode === "change"
      ? changeDetailFromZoom(view.zoom, viewName)
      : detailFromZoom(view.zoom, viewName);

  if (detail === activeDetail[currentMode]) return;

  isLoadingDetail = true;

  try {
    if (currentMode === "present") {
      const data2025 = await getGeoJSON("2025", detail);

      if (singleMap.getSource("spikes")) {
        singleMap.getSource("spikes").setData(data2025);
      }

      activeDetail.present = detail;
    }

    if (currentMode === "compare") {
      const leftData = await getGeoJSON(compareBaseYear, detail);
      const rightData = await getGeoJSON("2025", detail);

      if (leftMap.getSource("spikes")) {
        leftMap.getSource("spikes").setData(leftData);
      }

      if (rightMap.getSource("spikes")) {
        rightMap.getSource("spikes").setData(rightData);
      }

      activeDetail.compare = detail;
    }

    if (currentMode === "change") {
      const changeData = await getChangeGeoJSON(detail);

      if (singleMap.getSource("change-spikes")) {
        singleMap.getSource("change-spikes").setData(changeData);
      }

      activeDetail.change = detail;
    }
  } finally {
    isLoadingDetail = false;
  }
}

function cellKey(feature) {
  const coords = feature.geometry.coordinates[0];

  let lonSum = 0;
  let latSum = 0;

  for (let i = 0; i < coords.length; i++) {
    lonSum += coords[i][0];
    latSum += coords[i][1];
  }

  const lon = lonSum / coords.length;
  const lat = latSum / coords.length;

  return `${Math.round(lon * 1000)},${Math.round(lat * 1000)}`;
}

function clearCompareMaps() {
  if (leftMap.getSource("spikes")) {
    leftMap.getSource("spikes").setData(emptyGeoJSON);
  }

  if (rightMap.getSource("spikes")) {
    rightMap.getSource("spikes").setData(emptyGeoJSON);
  }

  activeDetail.compare = null;
}

function setupTopTabs() {
  const tabs = document.querySelectorAll(".compare-tab");

  tabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      tabs.forEach(t => t.classList.remove("selected"));
      tab.classList.add("selected");

      closeMobileChart();
      await setMode(tab.dataset.mode);
    });
  });
}

function setupCompareYearSwitch() {
  const buttons = document.querySelectorAll(".compare-year-option");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      buttons.forEach(btn => btn.classList.remove("selected"));
      button.classList.add("selected");

      compareBaseYear = button.dataset.compareYear;

      if (currentMode === "compare") {
        const camera = getCurrentCamera(leftMap);
        const detail = detailFromZoom(camera.zoom, activeView);
        const data = await getGeoJSON(compareBaseYear, detail);

        if (leftMap.getSource("spikes")) {
          leftMap.getSource("spikes").setData(data);
        }

        activeDetail.compare = detail;
      }
    });
  });
}

function getVisibleCamera() {
  if (currentMode === "compare") {
    return getCurrentCamera(leftMap);
  }

  return getCurrentCamera(singleMap);
}

async function setMode(mode) {
  const previousCamera = getVisibleCamera();

  currentMode = mode;

  document.body.classList.remove("mode-compare", "mode-present", "mode-change");
  document.body.classList.add(`mode-${mode}`);

  if (mode === "compare") {
    closeMobileChart();

    const detail = detailFromZoom(previousCamera.zoom, activeView);

    const leftData = await getGeoJSON(compareBaseYear, detail);
    const rightData = await getGeoJSON("2025", detail);

    if (leftMap.getSource("spikes")) {
      leftMap.getSource("spikes").setData(leftData);
      leftMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.65);
    }

    if (rightMap.getSource("spikes")) {
      rightMap.getSource("spikes").setData(rightData);
      rightMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.65);
    }

    activeDetail.compare = detail;

    jumpMapTo(leftMap, previousCamera);
    jumpMapTo(rightMap, previousCamera);
  }

  if (mode === "present") {
    clearCompareMaps();

    const detail = detailFromZoom(previousCamera.zoom, activeView);
    const data2025 = await getGeoJSON("2025", detail);

    if (singleMap.getSource("spikes")) {
      singleMap.getSource("spikes").setData(data2025);
      singleMap.setLayoutProperty("spikes-layer", "visibility", "visible");
      singleMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.92);
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty("change-spikes-layer", "visibility", "none");
    }

    activeDetail.present = detail;

    if (activeView === "global") {
      jumpMapTo(singleMap, views.global);
    } else {
      jumpMapTo(singleMap, previousCamera);
    }
  }

  if (mode === "change") {
    clearCompareMaps();

    const detail = changeDetailFromZoom(previousCamera.zoom, activeView);
    const changeData = await getChangeGeoJSON(detail);

    if (singleMap.getSource("change-spikes")) {
      singleMap.getSource("change-spikes").setData(changeData);
    }

    if (singleMap.getLayer("spikes-layer")) {
      singleMap.setLayoutProperty("spikes-layer", "visibility", "none");
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty("change-spikes-layer", "visibility", "visible");
    }

    activeDetail.change = detail;

    if (activeView === "global") {
      jumpMapTo(singleMap, views.global);
    } else {
      jumpMapTo(singleMap, previousCamera);
    }
  }

  resizeMaps();
}

function setupRegionJump() {
  const select = document.querySelector("#region-select");

  if (!select) return;

  select.addEventListener("change", async () => {
    const viewName = select.value;

    activeView = viewName;
    updateStoryPanel(viewName);

    await updateRegionCharts(viewName);

    closeMobileChart();

    await flyAllTo(viewName);
  });
}

function updateStoryPanel(viewName) {
  const story = storyText[viewName];

  if (!story) return;

  document.querySelector("#story-title").textContent = story.title;
  document.querySelector("#story-text").textContent = story.text;
}

async function flyAllTo(viewName) {
  const view = views[viewName];

  if (!view) return;

  const primaryMap = currentMode === "compare" ? leftMap : singleMap;

  primaryMap.once("moveend", async () => {
    await loadDetailForCurrentView(viewName, getCurrentCamera(primaryMap));
  });

  if (currentMode === "compare") {
    mapFlyTo(leftMap, view);
    mapFlyTo(rightMap, view);
  } else {
    mapFlyTo(singleMap, view);
  }
}

function mapFlyTo(map, view) {
  map.flyTo({
    center: view.center,
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    offset: view.offset || [0, 0],
    duration: 3500,
    speed: 0.35,
    curve: 1.6,
    essential: true
  });
}

function jumpMapTo(map, view) {
  map.jumpTo({
    center: view.center,
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    offset: view.offset || [0, 0]
  });
}

function getCurrentCamera(map) {
  if (!map) return null;

  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing()
  };
}

function syncCompareMaps() {
  let activeMovingMap = null;

  function createSyncHandler(sourceMap, targetMap) {
    return () => {
      if (currentMode !== "compare" || syncing) return;

      if (activeMovingMap && activeMovingMap !== sourceMap) return;

      syncing = true;
      activeMovingMap = sourceMap;

      targetMap.jumpTo({
        center: sourceMap.getCenter(),
        zoom: sourceMap.getZoom(),
        bearing: sourceMap.getBearing(),
        pitch: sourceMap.getPitch()
      });

      requestAnimationFrame(() => {
        syncing = false;
      });
    };
  }

  const onLeftMove = createSyncHandler(leftMap, rightMap);
  const onRightMove = createSyncHandler(rightMap, leftMap);

  leftMap.on("move", onLeftMove);
  rightMap.on("move", onRightMove);

  const clearActiveMap = () => {
    activeMovingMap = null;
  };

  maps.forEach(map => {
    map.on("moveend", clearActiveMap);
    map.on("mouseup", clearActiveMap);
    map.on("touchend", clearActiveMap);
  });
}

function setupPopup(map) {
  if (map.__popupReady) return;
  map.__popupReady = true;

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  let lastHoveredId = null;

  map.on("mousemove", "spikes-layer", event => {
    if (!event.features.length) return;

    const feature = event.features[0];
    const currentId = cellKey(feature);

    if (currentId === lastHoveredId) return;
    lastHoveredId = currentId;

    const props = feature.properties;

    map.getCanvas().style.cursor = "pointer";

    const ndviText =
      props.ndvi !== undefined
        ? `Actual NDVI: ${Number(props.ndvi).toFixed(3)}`
        : `Greenness: ${Number(props.greenness).toFixed(3)}`;

    popup
      .setLngLat(event.lngLat)
      .setHTML(`
        <strong>Vegetation intensity</strong><br/>
        ${ndviText}<br/>
        Height: ${Math.round(Number(props.height))}
      `)
      .addTo(map);
  });

  map.on("mouseleave", "spikes-layer", () => {
    lastHoveredId = null;
    map.getCanvas().style.cursor = "";
    popup.remove();
  });

  if (map === singleMap) {
    map.on("mousemove", "change-spikes-layer", event => {
      if (!event.features.length) return;

      const feature = event.features[0];
      const currentId = cellKey(feature);

      if (currentId === lastHoveredId) return;
      lastHoveredId = currentId;

      const props = feature.properties;
      const change = Number(props.change);

      map.getCanvas().style.cursor = "pointer";

      popup
        .setLngLat(event.lngLat)
        .setHTML(`
          <strong>NDVI Change, 2000–2025</strong><br/>
          ${change > 0 ? "Growth" : "Decline"}: ${change.toFixed(3)}
        `)
        .addTo(map);
    });

    map.on("mouseleave", "change-spikes-layer", () => {
      lastHoveredId = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  }
}

function resizeMaps() {
  requestAnimationFrame(() => {
    singleMap.resize();
    leftMap.resize();
    rightMap.resize();
  });

  setTimeout(() => {
    singleMap.resize();
    leftMap.resize();
    rightMap.resize();
  }, 250);
}

function featureCenter(feature) {
  const coords = feature.geometry.coordinates[0];

  let lonSum = 0;
  let latSum = 0;

  for (let i = 0; i < coords.length; i++) {
    lonSum += coords[i][0];
    latSum += coords[i][1];
  }

  return {
    lon: lonSum / coords.length,
    lat: latSum / coords.length
  };
}

function pointInBounds(lon, lat, bounds) {
  const [lonMin, lonMax, latMin, latMax] = bounds;
  return lon >= lonMin && lon <= lonMax && lat >= latMin && lat <= latMax;
}

function polygonAreaKm2(coords) {
  const earthRadiusKm = 6371;
  let area = 0;

  if (!coords || coords.length < 4) return 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const lon1 = coords[i][0] * Math.PI / 180;
    const lat1 = coords[i][1] * Math.PI / 180;
    const lon2 = coords[i + 1][0] * Math.PI / 180;
    const lat2 = coords[i + 1][1] * Math.PI / 180;

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs(area * earthRadiusKm * earthRadiusKm / 2);
}

function featureAreaKm2(feature) {
  if (!feature.geometry || feature.geometry.type !== "Polygon") return 0;

  const outerRing = feature.geometry.coordinates[0];
  return polygonAreaKm2(outerRing);
}

function formatArea(value) {
  if (!Number.isFinite(value)) return "N/A";

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M km²`;
  }

  if (value >= 1000) {
    return `${Math.round(value).toLocaleString()} km²`;
  }

  return `${value.toFixed(1)} km²`;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function computeRegionChartStats(viewName) {
  const cacheKey = `${viewName}-medium`;

  if (chartStatsCache[cacheKey]) {
    return chartStatsCache[cacheKey];
  }

  const bounds = regionBounds[viewName] || regionBounds.global;

  const data2000 = await getGeoJSON("2000", "medium");
  const data2013 = await getGeoJSON("2013", "medium");
  const data2025 = await getGeoJSON("2025", "medium");
  const changeData = await getChangeGeoJSON("medium");

  function collectMeanNDVI(data) {
    const values = [];

    data.features.forEach(feature => {
      const center = featureCenter(feature);

      if (!pointInBounds(center.lon, center.lat, bounds)) return;

      const ndvi = Number(feature.properties.ndvi);

      if (Number.isFinite(ndvi)) {
        values.push(ndvi);
      }
    });

    return mean(values);
  }

  let growthCount = 0;
  let declineCount = 0;

  let addedAreaKm2 = 0;
  let lostAreaKm2 = 0;

  changeData.features.forEach(feature => {
    const center = featureCenter(feature);

    if (!pointInBounds(center.lon, center.lat, bounds)) return;

    const change = Number(feature.properties.change);
    const areaKm2 = featureAreaKm2(feature);

    if (change > 0) {
      growthCount += 1;
      addedAreaKm2 += areaKm2;
    }

    if (change < 0) {
      declineCount += 1;
      lostAreaKm2 += areaKm2;
    }
  });

  const totalChange = growthCount + declineCount;

  const stats = {
    ndvi: {
      2000: collectMeanNDVI(data2000),
      2013: collectMeanNDVI(data2013),
      2025: collectMeanNDVI(data2025)
    },
    change: {
      growthPct: totalChange ? growthCount / totalChange : 0,
      declinePct: totalChange ? declineCount / totalChange : 0,
      addedAreaKm2,
      lostAreaKm2
    }
  };

  chartStatsCache[cacheKey] = stats;
  return stats;
}

function renderRegionCharts(viewName, stats) {
  const chartTitle = document.querySelector("#chart-title");
  const ndviChart = document.querySelector("#ndvi-bar-chart");
  const changeChart = document.querySelector("#change-summary-chart");
  const areaChart = document.querySelector("#area-summary-chart");
  const caption = document.querySelector("#chart-caption");

  if (!chartTitle || !ndviChart || !changeChart || !areaChart || !caption) {
    return;
  }

  const title = storyText[viewName]?.title || "Global Overview";
  chartTitle.textContent = `${title} Summary`;

  const years = ["2000", "2013", "2025"];

  ndviChart.innerHTML = years
    .map(year => {
      const value = stats.ndvi[year];
      const safeValue = value === null ? 0 : value;

      const targetWidth = Math.max(3, Math.min(100, safeValue * 100));
      const startWidth = previousNdviBarWidths[year] ?? 0;

      return `
        <div class="bar-row">
          <span>${year}</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              data-year="${year}"
              data-target-width="${targetWidth}"
              style="width: ${startWidth}%;"
            ></div>
          </div>
          <span>${value === null ? "N/A" : value.toFixed(3)}</span>
        </div>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    const bars = ndviChart.querySelectorAll(".bar-fill");

    bars.forEach(bar => {
      const year = bar.dataset.year;
      const targetWidth = Number(bar.dataset.targetWidth);

      bar.style.width = `${targetWidth}%`;
      previousNdviBarWidths[year] = targetWidth;
    });
  });

  const growthPct = Math.round(stats.change.growthPct * 100);
  const declinePct = Math.round(stats.change.declinePct * 100);

  changeChart.innerHTML = `
    <div class="change-box growth">
      <strong>${growthPct}%</strong>
      <span>growth cells</span>
    </div>
    <div class="change-box decline">
      <strong>${declinePct}%</strong>
      <span>decline cells</span>
    </div>
  `;

  areaChart.innerHTML = `
    <div class="area-box added">
      <strong>${formatArea(stats.change.addedAreaKm2)}</strong>
      <span>estimated added green-space area</span>
    </div>

    <div class="area-box lost">
      <strong>${formatArea(stats.change.lostAreaKm2)}</strong>
      <span>estimated lost green-space area</span>
    </div>
  `;

  caption.textContent =
    "Area values are approximate and are calculated from changed MODIS NDVI grid cells in the selected region.";
}

async function updateRegionCharts(viewName) {
  const chartTitle = document.querySelector("#chart-title");
  const ndviChart = document.querySelector("#ndvi-bar-chart");
  const caption = document.querySelector("#chart-caption");

  if (chartTitle) {
    const title = storyText[viewName]?.title || "Global Overview";
    chartTitle.textContent = `${title} Summary`;
  }

  if (ndviChart && !ndviChart.querySelector(".bar-row")) {
    ndviChart.innerHTML = `<div class="chart-loading">Loading regional data...</div>`;
  }

  if (caption) {
    caption.textContent = "Calculating summary for the selected region...";
  }

  const stats = await computeRegionChartStats(viewName);
  renderRegionCharts(viewName, stats);
}

function setupMobileChartToggle() {
  const toggleButton = document.querySelector("#mobile-chart-toggle");
  const closeButton = document.querySelector("#chart-close-button");
  const chartPanel = document.querySelector(".chart-panel");

  if (!toggleButton || !chartPanel) return;

  toggleButton.addEventListener("click", () => {
    if (currentMode === "compare") return;

    const isOpen = document.body.classList.toggle("mobile-chart-open");
    toggleButton.textContent = isOpen ? "Hide Summary" : "Summary";
  });

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      closeMobileChart();
    });
  }
}

function closeMobileChart() {
  const button = document.querySelector("#mobile-chart-toggle");

  document.body.classList.remove("mobile-chart-open");

  if (button) {
    button.textContent = "Summary";
  }
}

function setupAboutModal() {
  const openButton = document.querySelector("#about-button");
  const closeButton = document.querySelector("#about-close-button");
  const modal = document.querySelector("#about-modal");

  if (!openButton || !closeButton || !modal) return;

  openButton.addEventListener("click", () => {
    document.body.classList.add("about-open");
    modal.setAttribute("aria-hidden", "false");
  });

  closeButton.addEventListener("click", () => {
    document.body.classList.remove("about-open");
    modal.setAttribute("aria-hidden", "true");
  });

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      document.body.classList.remove("about-open");
      modal.setAttribute("aria-hidden", "true");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      document.body.classList.remove("about-open");
      modal.setAttribute("aria-hidden", "true");
    }
  });
}

function setupGuidedTour() {
  const overlay = document.querySelector("#tour-overlay");
  const title = document.querySelector("#tour-title");
  const text = document.querySelector("#tour-text");
  const count = document.querySelector("#tour-step-count");
  const nextButton = document.querySelector("#tour-next-button");
  const skipButton = document.querySelector("#tour-skip-button");

  if (!overlay || !title || !text || !count || !nextButton || !skipButton) {
    return;
  }

  nextButton.addEventListener("click", async () => {
    if (currentTourStep >= tourSteps.length - 1) {
      await closeGuidedTour();
      return;
    }

    currentTourStep += 1;
    await showTourStep(currentTourStep);
  });

  skipButton.addEventListener("click", async () => {
    await closeGuidedTour();
  });
}

async function openGuidedTour() {
  currentTourStep = 0;
  document.body.classList.add("tour-open");
  document.querySelector("#tour-overlay")?.setAttribute("aria-hidden", "false");
  await showTourStep(currentTourStep);
}

async function closeGuidedTour() {
  document.body.classList.remove("tour-open", "mobile-chart-open");
  document.querySelector("#tour-overlay")?.setAttribute("aria-hidden", "true");

  const button = document.querySelector("#mobile-chart-toggle");

  if (button) {
    button.textContent = "Summary";
  }

  activeView = "global";

  const regionSelect = document.querySelector("#region-select");

  if (regionSelect) {
    regionSelect.value = "global";
  }

  updateStoryPanel("global");
  await updateRegionCharts("global");

  document.querySelectorAll(".compare-tab").forEach(tab => {
    tab.classList.remove("selected");
  });

  const presentTab = document.querySelector('.compare-tab[data-mode="present"]');

  if (presentTab) {
    presentTab.classList.add("selected");
  }

  await setMode("present");

  jumpMapTo(singleMap, views.global);

  await loadDetailForCurrentView("global", getCurrentCamera(singleMap));

  resizeMaps();
}

async function showTourStep(index) {
  const step = tourSteps[index];

  const title = document.querySelector("#tour-title");
  const text = document.querySelector("#tour-text");
  const count = document.querySelector("#tour-step-count");
  const nextButton = document.querySelector("#tour-next-button");
  const regionSelect = document.querySelector("#region-select");

  if (!step || !title || !text || !count || !nextButton) return;

  const previousView = activeView;

  title.textContent = step.title;
  text.textContent = step.text;
  count.textContent = `Step ${index + 1} of ${tourSteps.length}`;
  nextButton.textContent = index === tourSteps.length - 1 ? "Finish" : "Next";

  if (step.view) {
    activeView = step.view;
    updateStoryPanel(step.view);
    await updateRegionCharts(step.view);

    if (regionSelect) {
      regionSelect.value = step.view;
    }
  }

  if (step.mode && currentMode !== step.mode) {
    const tab = document.querySelector(`.compare-tab[data-mode="${step.mode}"]`);

    document.querySelectorAll(".compare-tab").forEach(t => {
      t.classList.remove("selected");
    });

    if (tab) {
      tab.classList.add("selected");
    }

    await setMode(step.mode);
  }

  if (step.openChart) {
    document.body.classList.add("mobile-chart-open");

    const button = document.querySelector("#mobile-chart-toggle");

    if (button) {
      button.textContent = "Hide Summary";
    }
  } else {
    closeMobileChart();
  }

  if (step.view && index !== 0 && step.view !== previousView) {
    await flyAllTo(step.view);
  }
}

function updateSplashStatus(message) {
  const status = document.querySelector("#loading-status");

  if (status) {
    status.textContent = message;
  }
}

function enableStartButton() {
  const button = document.querySelector("#start-button");

  if (!button) return;

  button.disabled = false;
  button.textContent = "Start Exploring";
}

function setupSplashScreen() {
  const splash = document.querySelector("#splash-screen");
  const button = document.querySelector("#start-button");

  if (!splash || !button) return;

  button.disabled = true;
  button.textContent = "Loading Map...";

  button.addEventListener("click", () => {
    if (!appReady) return;

    splash.classList.add("hidden");

    setTimeout(() => {
      splash.remove();
      resizeMaps();
      openGuidedTour();
    }, 600);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => console.log("Offline data cache active."))
      .catch(err => console.error("Service worker registration failed:", err));
  });
}