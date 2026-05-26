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
    title: "Global Overview",
    text: "Placeholder text: introduce the overall story and the main question here."
  },
  amazon: {
    title: "Amazon Basin",
    text: "Placeholder text: describe why this region matters and what users should notice."
  },
  sahel: {
    title: "Sahel / West Africa",
    text: "Placeholder text: describe why this region matters and what users should notice."
  },
  china: {
    title: "Northern China / Inner Mongolia",
    text: "Placeholder text: describe why this region matters and what users should notice."
  }
};

const spikeFiles = {
  "2000": "data/actual_ndvi_spikes_2000.geojson",
  "2013": "data/actual_ndvi_spikes_2013.geojson",
  "2025": "data/actual_ndvi_spikes_2025.geojson"
};

let currentMode = "present";
let activeView = "global";

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
  const data2000 = await loadGeoJSON(spikeFiles["2000"]);
  const data2025 = await loadGeoJSON(spikeFiles["2025"]);
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
        "#249971",
        "#d95f3d"
      ],
      "fill-extrusion-height": [
        "*",
        ["abs", ["get", "change"]],
        850000
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.9,
      "fill-extrusion-vertical-gradient": false,
      "fill-extrusion-emissive-strength": 1,
      "fill-extrusion-ambient-occlusion-intensity": 0,
      "fill-extrusion-ambient-occlusion-radius": 0
    }
  });

  setupTopTabs();
  setupRegionJump();
  setupPopup(singleMap);
  setupPopup(leftMap);
  setupPopup(rightMap);
  syncCompareMaps();

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

async function loadGeoJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return await response.json();
}

function buildChangeGeoJSON(data2000, data2025) {
  const byLocation = new Map();

  data2000.features.forEach(feature => {
    const key = cellKey(feature);
    byLocation.set(key, Number(feature.properties.greenness));
  });

  const features = [];

  data2025.features.forEach(feature => {
    const key = cellKey(feature);
    const oldValue = byLocation.get(key);

    if (oldValue === undefined) return;

    const newValue = Number(feature.properties.greenness);
    const change = Number((newValue - oldValue).toFixed(4));

    features.push({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        change,
        greenness_2000: oldValue,
        greenness_2025: newValue
      }
    });
  });

  return {
    type: "FeatureCollection",
    features
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
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("selected"));
      tab.classList.add("selected");

      setMode(tab.dataset.mode);
    });
  });
}

function setMode(mode) {
  currentMode = mode;

  document.body.classList.remove("mode-compare", "mode-present", "mode-change");
  document.body.classList.add(`mode-${mode}`);

  if (mode === "compare") {
    const view = getCurrentCamera(singleMap) || views[activeView];

    jumpMapTo(leftMap, view);
    jumpMapTo(rightMap, view);

    if (leftMap.getLayer("spikes-layer")) {
      leftMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.65);
    }

    if (rightMap.getLayer("spikes-layer")) {
      rightMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.65);
    }
  }

  if (mode === "present") {
    if (singleMap.getLayer("spikes-layer")) {
      singleMap.setLayoutProperty("spikes-layer", "visibility", "visible");
      singleMap.setPaintProperty("spikes-layer", "fill-extrusion-opacity", 0.92);
    }

    if (singleMap.getLayer("change-spikes-layer")) {
      singleMap.setLayoutProperty("change-spikes-layer", "visibility", "none");
    }

    mapFlyTo(singleMap, views[activeView]);
  }

  if (mode === "change") {
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
  let syncing = false;

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

    popup
      .setLngLat(event.lngLat)
      .setHTML(`
        <strong>Vegetation intensity</strong><br/>
        Actual NDVI: ${Number(props.ndvi).toFixed(3)}<br/>
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