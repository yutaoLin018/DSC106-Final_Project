from pathlib import Path
import json
import numpy as np
from PIL import Image

# -----------------------------
# CONFIG
# -----------------------------
IMAGE_PATH = Path("gibs_modis_images/modis_terra_ndvi_2025_july.png")
OUTPUT_PATH = Path("data/modis_spikes_2025.geojson")

LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = -180, -60, 180, 85

BLOCK_SIZE = 4
CELL_FILL = 0.35

# Larger for stronger spikes
HEIGHT_SCALE = 500000

# Controls how dramatically high-greenness areas stand out
HEIGHT_POWER = 2.6

# Used for excluding oceans / black background
DARK_THRESHOLD = 18

# Very low cells are still kept if they are land
MIN_VISIBLE_HEIGHT = 1200


def clamp(val, low, high):
    return max(low, min(high, val))

def pixel_to_lon(x, width):
    return LON_MIN + (x / width) * (LON_MAX - LON_MIN)

def pixel_to_lat(y, height):
    return LAT_MAX - (y / height) * (LAT_MAX - LAT_MIN)

def make_cell_polygon(lon_center, lat_center, lon_size, lat_size):
    half_lon = lon_size / 2
    half_lat = lat_size / 2
    return {
        "type": "Polygon",
        "coordinates": [[
            [lon_center - half_lon, lat_center - half_lat],
            [lon_center + half_lon, lat_center - half_lat],
            [lon_center + half_lon, lat_center + half_lat],
            [lon_center - half_lon, lat_center + half_lat],
            [lon_center - half_lon, lat_center - half_lat]
        ]]
    }

def rgb_to_greenness(r, g, b):
    """
    Better proxy for vegetation from rendered imagery.
    """
    exg = 2 * g - r - b
    brightness = (r + g + b) / 3

    # Normalize excess green
    exg_norm = clamp((exg + 255) / 510, 0, 1)

    # Reduce score a bit for very bright / pale pixels
    # to help keep deserts and bright non-vegetated areas from looking too green
    brightness_penalty = clamp((brightness - 180) / 100, 0, 1)

    greenness = exg_norm * (1 - 0.35 * brightness_penalty)
    return clamp(greenness, 0, 1)

def is_ocean_or_background(r, g, b):
    # Very dark pixels are likely ocean / background in your processed imagery
    return r < DARK_THRESHOLD and g < DARK_THRESHOLD and b < DARK_THRESHOLD


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    img = Image.open(IMAGE_PATH).convert("RGB")
    arr = np.array(img)
    height, width, _ = arr.shape

    lon_size = (LON_MAX - LON_MIN) / width * BLOCK_SIZE
    lat_size = (LAT_MAX - LAT_MIN) / height * BLOCK_SIZE

    # First pass: compute greenness for all candidate land cells
    candidates = []

    for y in range(0, height, BLOCK_SIZE):
        for x in range(0, width, BLOCK_SIZE):
            block = arr[y:y + BLOCK_SIZE, x:x + BLOCK_SIZE]
            if block.size == 0:
                continue

            mean_rgb = block.reshape(-1, 3).mean(axis=0)
            r, g, b = mean_rgb

            if is_ocean_or_background(r, g, b):
                continue

            greenness = rgb_to_greenness(r, g, b)

            candidates.append({
                "x": x,
                "y": y,
                "r": float(r),
                "g": float(g),
                "b": float(b),
                "greenness_raw": float(greenness)
            })

    # Compute robust percentile stretch using all land cells
    greenness_values = np.array([c["greenness_raw"] for c in candidates])

    p05 = np.percentile(greenness_values, 5)
    p50 = np.percentile(greenness_values, 50)
    p95 = np.percentile(greenness_values, 95)

    print(f"Greenness percentiles -> p05={p05:.3f}, p50={p50:.3f}, p95={p95:.3f}")

    features = []

    for c in candidates:
        greenness_raw = c["greenness_raw"]

        # Percentile-based normalization
        greenness_norm = (greenness_raw - p05) / (p95 - p05)
        greenness_norm = clamp(greenness_norm, 0, 1)

        # Piecewise height mapping
        # barren land still visible, greener places pop much more
        if greenness_norm < 0.15:
            height_value = MIN_VISIBLE_HEIGHT + greenness_norm * 12000
        elif greenness_norm < 0.40:
            height_value = 12000 + ((greenness_norm - 0.15) / 0.25) ** 1.4 * 50000
        else:
            height_value = 62000 + ((greenness_norm - 0.40) / 0.60) ** HEIGHT_POWER * HEIGHT_SCALE

        x = c["x"]
        y = c["y"]

        lon_center = pixel_to_lon(x + BLOCK_SIZE / 2, width)
        lat_center = pixel_to_lat(y + BLOCK_SIZE / 2, height)

        feature = {
            "type": "Feature",
            "properties": {
                "greenness_raw": round(greenness_raw, 4),
                "greenness": round(greenness_norm, 4),
                "height": round(float(height_value), 2),
                "r": round(c["r"], 1),
                "g": round(c["g"], 1),
                "b": round(c["b"], 1)
            },
            "geometry": make_cell_polygon(
                lon_center,
                lat_center,
                lon_size * CELL_FILL,
                lat_size * CELL_FILL
            )
        }

        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f)

    print(f"Saved {len(features)} spikes to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()