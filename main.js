mapboxgl.accessToken = "pk.eyJ1IjoieXV0YW9saW4iLCJhIjoiY21wNWI0MDl5MDlldTJwcTI3bmtkY3h3NiJ9.7aMzhLHSwm6BOedHTptjNA";

const views = {
  global: {
    center: [10, 18],
    zoom: 1.15,
    pitch: 54,
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

let currentMode = "present";
let activeView = "global";
let compareBaseYear = "2000";
let currentDetail = "low";
let cachedData = {};
let syncing = false;

const mapOptions = {
  style: "mapbox://styles/mapbox/light-v11",
  center: views.global.center,
  zoom: views.global.zoom,
  pitch: views.global.pitch,
  bearing: views.global.bearing,
  antialias: true,
  projection: "mercator",
  renderWorldCopies: false,
  maxBounds: [
    [-180, -60],
    [180, 85]
  ]
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
  const initialDetail = "low";

  const data2000 = await getGeoJSON("2000", initialDetail);
  const data2025 = await getGeoJSON("2025", initialDetail);

  const changeData = buildChangeGeoJSON(data2000, data2025);

  setupMapLayer(singleMap, data2025, "present");
  setupMapLayer(leftMap, data2000, "compare");
  setupMapLayer(rightMap, data2025, "compare");

  singleMap.addSource("change-spikes", {
    type: "geojson",
    data: changeData
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
  setMode("present");
  resizeMaps();
}

function setupMapLayer(map, data, mode) {
  map.setLight({
    anchor: "viewport",
    color: "white",
    intensity: 0
  });

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

function detailFromZoom(zoom) {
  if (zoom >= 6.0) return "high";
  if (zoom >= 4.0) return "medium";
  return "low";
}

async function getGeoJSON(year, detail) {
  const key = `${year}-${detail}`;

  if (!cachedData[key]) {
    cachedData[key] = await loadGeoJSON(spikeFilesByDetail[year][detail]);
  }

  return cachedData[key];
}

async function loadGeoJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return await response.json();
}

function setupDetailSwitching() {
  singleMap.on("zoomend", async () => {
    if (currentMode === "present") {
      await updatePresentDetail();
    }

    if (currentMode === "change") {
      await updateChangeDetail();
    }
  });

  leftMap.on("zoomend", async () => {
    if (currentMode === "compare") {
      await updateCompareDetail(leftMap.getZoom());
    }
  });

  rightMap.on("zoomend", async () => {
    if (currentMode === "compare") {
      await updateCompareDetail(rightMap.getZoom());
    }
  });
}

async function updatePresentDetail() {
  const detail = detailFromZoom(singleMap.getZoom());

  if (detail === currentDetail) return;

  currentDetail = detail;

  const data2025 = await getGeoJSON("2025", detail);

  if (singleMap.getSource("spikes")) {
    singleMap.getSource("spikes").setData(data2025);
  }
}

async function updateCompareDetail(zoom) {
  const detail = detailFromZoom(zoom);

  if (detail === currentDetail) return;

  currentDetail = detail;

  const leftData = await getGeoJSON(compareBaseYear, detail);
  const rightData = await getGeoJSON("2025", detail);

  if (leftMap.getSource("spikes")) {
    leftMap.getSource("spikes").setData(leftData);
  }

  if (rightMap.getSource("spikes")) {
    rightMap.getSource("spikes").setData(rightData);
  }
}

async function updateChangeDetail() {
  const detail = detailFromZoom(singleMap.getZoom());

  if (detail === currentDetail) return;

  currentDetail = detail;

  const data2000 = await getGeoJSON("2000", detail);
  const data2025 = await getGeoJSON("2025", detail);
  const changeData = buildChangeGeoJSON(data2000, data2025);

  if (singleMap.getSource("change-spikes")) {
    singleMap.getSource("change-spikes").setData(changeData);
  }
}

function buildChangeGeoJSON(dataOld, dataNew) {
  const byLocation = new Map();

  dataOld.features.forEach(feature => {
    const key = cellKey(feature);
    byLocation.set(key, Number(feature.properties.ndvi ?? feature.properties.greenness));
  });

  const features = [];

  dataNew.features.forEach(feature => {
    const key = cellKey(feature);
    const oldValue = byLocation.get(key);

    if (oldValue === undefined) return;

    const newValue = Number(feature.properties.ndvi ?? feature.properties.greenness);
    const change = Number((newValue - oldValue).toFixed(4));

    // Hide tiny changes so the map is not too noisy.
    if (Math.abs(change) < 0.025) return;

    features.push({
      type: "Feature",
      geometry: shrinkPolygon(feature.geometry, 0.55),
      properties: {
        change,
        ndvi_old: oldValue,
        ndvi_new: newValue
      }
    });
  });

  return {
    type: "FeatureCollection",
    features
  };
}

function shrinkPolygon(geometry, scale = 0.55) {
  const ring = geometry.coordinates[0];

  const centerLon = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const centerLat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;

  const newRing = ring.map(([lon, lat]) => [
    centerLon + (lon - centerLon) * scale,
    centerLat + (lat - centerLat) * scale
  ]);

  return {
    type: "Polygon",
    coordinates: [newRing]
  };
}

function cellKey(feature) {
  const coords = feature.geometry.coordinates[0];

  let lonSum = 0;
  let latSum = 0;

  coords.forEach(coord => {
    lonSum += coord[0];
    latSum += coord[1];
  });

  const lon = lonSum / coords.length;
  const lat = latSum / coords.length;

  return `${lon.toFixed(3)},${lat.toFixed(3)}`;
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
        const detail = detailFromZoom(leftMap.getZoom());
        const data = await getGeoJSON(compareBaseYear, detail);

        if (leftMap.getSource("spikes")) {
          leftMap.getSource("spikes").setData(data);
        }
      }
    });
  });
}

async function setMode(mode) {
  currentMode = mode;

  document.body.classList.remove("mode-compare", "mode-present", "mode-change");
  document.body.classList.add(`mode-${mode}`);

  if (mode === "compare") {
    const view = getCurrentCamera(singleMap) || views[activeView];
    const detail = detailFromZoom(view.zoom);

    currentDetail = detail;

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

    jumpMapTo(leftMap, view);
    jumpMapTo(rightMap, view);
  }

  if (mode === "present") {
    const detail = detailFromZoom(singleMap.getZoom());
    currentDetail = detail;

    const data2025 = await getGeoJSON("2025", detail);

    if (singleMap.getSource("spikes")) {
      singleMap.getSource("spikes").setData(data2025);
      singleMap.setLayoutProperty("spikes-layer", "visibility", "visible");
      singleMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.92);
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty("change-spikes-layer", "visibility", "none");
    }

    mapFlyTo(singleMap, views[activeView]);
  }

  if (mode === "change") {
    const detail = detailFromZoom(singleMap.getZoom());
    currentDetail = detail;

    const data2000 = await getGeoJSON("2000", detail);
    const data2025 = await getGeoJSON("2025", detail);
    const changeData = buildChangeGeoJSON(data2000, data2025);

    if (singleMap.getSource("change-spikes")) {
      singleMap.getSource("change-spikes").setData(changeData);
    }

    if (singleMap.getLayer("spikes-layer")) {
      singleMap.setLayoutProperty("spikes-layer", "visibility", "none");
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty("change-spikes-layer", "visibility", "visible");
    }

    mapFlyTo(singleMap, views[activeView]);
  }

  resizeMaps();
}

function setupRegionJump() {
  const select = document.querySelector("#region-select");

  if (!select) return;

  select.addEventListener("change", () => {
    const viewName = select.value;

    activeView = viewName;
    updateStoryPanel(viewName);
    flyAllTo(viewName);
  });
}

function updateStoryPanel(viewName) {
  const story = storyText[viewName];

  if (!story) return;

  document.querySelector("#story-title").textContent = story.title;
  document.querySelector("#story-text").textContent = story.text;
}

function flyAllTo(viewName) {
  const view = views[viewName];

  if (!view) return;

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
    duration: 1300,
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
  function sync(sourceMap, targetMap) {
    if (syncing) return;

    syncing = true;

    targetMap.jumpTo({
      center: sourceMap.getCenter(),
      zoom: sourceMap.getZoom(),
      bearing: sourceMap.getBearing(),
      pitch: sourceMap.getPitch()
    });

    requestAnimationFrame(() => {
      syncing = false;
    });
  }

  leftMap.on("move", () => {
    if (currentMode === "compare") {
      sync(leftMap, rightMap);
    }
  });

  rightMap.on("move", () => {
    if (currentMode === "compare") {
      sync(rightMap, leftMap);
    }
  });
}

function setupPopup(map) {
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  map.on("mousemove", "spikes-layer", event => {
    if (!event.features.length) return;

    const props = event.features[0].properties;

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
        Detail: ${props.detail ?? "unknown"}<br/>
        Height: ${Math.round(Number(props.height))}
      `)
      .addTo(map);
  });

  map.on("mouseleave", "spikes-layer", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });

  if (map === singleMap) {
    map.on("mousemove", "change-spikes-layer", event => {
      if (!event.features.length) return;

      const props = event.features[0].properties;
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