mapboxgl.accessToken = "pk.eyJ1IjoieXV0YW9saW4iLCJhIjoiY21wNWI0MDl5MDlldTJwcTI3bmtkY3h3NiJ9.7aMzhLHSwm6BOedHTptjNA";

// More workers for parsing large GeoJSON files.
// Set this before creating any maps.
mapboxgl.workerCount = 4;

const views = {
  global: {
    center: [15, 8],
    zoom: 1.5,
    pitch: 25,
    bearing: 0
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

const storyText = {
  global: {
    title: "Global Vegetation Change",
    text: "This map uses MODIS NDVI data to show how vegetation has changed across the world. Green spikes represent areas where vegetation increased between 2000 and 2025, while orange spikes represent areas where vegetation declined. Taller spikes indicate larger changes."
  },
  amazon: {
    title: "Amazon Basin",
    text: "The Amazon region is one of the most important areas to examine because it contains large tropical forests and zones of land-use change. The change layer helps highlight where vegetation appears to have declined or shifted over time."
  },
  sahel: {
    title: "Sahel / West Africa",
    text: "The Sahel sits between the Sahara Desert and the greener regions of West Africa. This area is useful for studying vegetation recovery, drought stress, and changing dryland conditions across time."
  },
  china: {
    title: "Northern China / Inner Mongolia",
    text: "Northern China and Inner Mongolia are included because this region has experienced major land restoration and anti-desertification efforts. The map can help show where vegetation has expanded or declined near dryland and grassland areas."
  }
};

const spikeFilesByDetail = {
  "2000": {
    low: "data/actual_ndvi_spikes_2000_low.geojson",
    medium: "data/actual_ndvi_spikes_2000_medium.geojson",
    high: "data/actual_ndvi_spikes_2000_high.geojson"
  },
  "2013": {
    low: "data/actual_ndvi_spikes_2013_low.geojson",
    medium: "data/actual_ndvi_spikes_2013_medium.geojson",
    high: "data/actual_ndvi_spikes_2013_high.geojson"
  },
  "2025": {
    low: "data/actual_ndvi_spikes_2025_low.geojson",
    medium: "data/actual_ndvi_spikes_2025_medium.geojson",
    high: "data/actual_ndvi_spikes_2025_high.geojson"
  }
};

const changeFilesByDetail = {
  low: "data/actual_ndvi_change_2000_2025_low.geojson",
  medium: "data/actual_ndvi_change_2000_2025_medium.geojson",
  high: "data/actual_ndvi_change_2000_2025_high.geojson"
};

const emptyGeoJSON = {
  type: "FeatureCollection",
  features: []
};

let currentMode = "present";
let activeView = "global";
let compareBaseYear = "2000";

let cachedData = {};
let cachedChangeData = {};
let syncing = false;
let isLoadingDetail = false;

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

  // Keep seamless horizontal panning.
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

  const data2025Low = await getGeoJSON("2025", "low");

  setupMapLayer(singleMap, data2025Low, "present");
  setupMapLayer(leftMap, emptyGeoJSON, "compare");
  setupMapLayer(rightMap, emptyGeoJSON, "compare");

  singleMap.addSource("change-spikes", {
    type: "geojson",
    data: emptyGeoJSON
  });

  singleMap.addLayer({
    id: "change-spikes-layer",
    type: "fill-extrusion",
    source: "change-spikes",
    layout: {
      visibility: "none"
    },
    paint: {
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
    }
  });

  setupTopTabs();
  setupCompareYearSwitch();
  setupRegionJump();
  setupPopup(singleMap);
  setupPopup(leftMap);
  setupPopup(rightMap);
  syncCompareMaps();
  setupDetailSwitching();

  updateStoryPanel("global");

  document.body.classList.remove("mode-compare", "mode-change");
  document.body.classList.add("mode-present");

  currentMode = "present";
  activeView = "global";
  activeDetail.present = "low";

  jumpMapTo(singleMap, views.global);
  resizeMaps();

  preloadLikelyNextFiles();
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

    // Preload medium change file because regional change mode often uses it.
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

  // Regional change mode can use high because the precomputed change file
  // filters small changes and has fewer visible spikes.
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

    jumpMapTo(singleMap, previousCamera);
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

    jumpMapTo(singleMap, previousCamera);
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
    bearing: view.bearing
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