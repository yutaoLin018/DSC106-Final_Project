from pathlib import Path
import json
import numpy as np
import rasterio
from rasterio.transform import xy

# -----------------------------
# CONFIG
# -----------------------------
RAW_DIR = Path("actual_modis_ndvi_raw")
OUT_DIR = Path("data")
OUT_DIR.mkdir(exist_ok=True)

FILES = {
    "2000": RAW_DIR / "MOD13A3_NDVI_2000.tif",
    "2013": RAW_DIR / "MOD13A3_NDVI_2013.tif",
    "2025": RAW_DIR / "MOD13A3_NDVI_2025.tif",
}

# Bigger number = fewer spikes, faster webpage
# Try 6 first. If too slow, use 8 or 10.
BLOCK_SIZE = 120

# Smaller number = thinner spike footprints
CELL_FILL = 0.75

# Height scale for actual NDVI values
HEIGHT_SCALE = 750000

# Makes high vegetation stand out more
HEIGHT_POWER = 2.2

# Keep barren areas visible but short
MIN_VISIBLE_HEIGHT = 1500

# Valid MODIS NDVI range after scale factor
NDVI_MIN = -0.2
NDVI_MAX = 1.0


def clamp(value, low, high):
    return max(low, min(high, value))


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
            [lon_center - half_lon, lat_center - half_lat],
        ]]
    }


def read_ndvi_tif(path):
    with rasterio.open(path) as src:
        arr = src.read(1).astype("float32")
        transform = src.transform
        nodata = src.nodata

    if nodata is not None:
        arr[arr == nodata] = np.nan

    # MOD13A3 NDVI is usually stored as scaled integer.
    # Scale factor is 0.0001.
    finite = arr[np.isfinite(arr)]
    if finite.size > 0 and np.nanmax(np.abs(finite)) > 2:
        arr = arr * 0.0001

    arr[(arr < NDVI_MIN) | (arr > NDVI_MAX)] = np.nan

    return arr, transform


def block_mean(arr, row, col, block_size):
    block = arr[row:row + block_size, col:col + block_size]

    if block.size == 0:
        return np.nan

    finite = block[np.isfinite(block)]

    if finite.size == 0:
        return np.nan

    return float(np.nanmean(finite))


def ndvi_to_height(ndvi):
    """
    Convert actual NDVI to spike height.

    Low NDVI stays short but visible.
    High NDVI gets exaggerated so green areas stand out.
    """
    # Normalize NDVI from roughly -0.1 to 0.9 into 0-1
    normalized = (ndvi - 0.0) / 0.85
    normalized = clamp(normalized, 0, 1)

    if normalized < 0.12:
        return MIN_VISIBLE_HEIGHT + normalized * 10000

    return MIN_VISIBLE_HEIGHT + (normalized ** HEIGHT_POWER) * HEIGHT_SCALE


def ndvi_to_display_value(ndvi):
    """
    This value is used for Mapbox color interpolation.
    """
    normalized = (ndvi - 0.0) / 0.85
    return clamp(normalized, 0, 1)


def convert_one_year(year, tif_path):
    if not tif_path.exists():
        raise FileNotFoundError(f"Missing file: {tif_path}")

    print(f"Reading {year}: {tif_path}")
    arr, transform = read_ndvi_tif(tif_path)

    nrows, ncols = arr.shape

    # Estimate cell size in lon/lat from transform.
    lon_size = abs(transform.a) * BLOCK_SIZE * CELL_FILL
    lat_size = abs(transform.e) * BLOCK_SIZE * CELL_FILL

    features = []

    for row in range(0, nrows, BLOCK_SIZE):
        for col in range(0, ncols, BLOCK_SIZE):
            ndvi = block_mean(arr, row, col, BLOCK_SIZE)

            if not np.isfinite(ndvi):
                continue

            # Skip mostly water / invalid negative values.
            # Keep deserts and barren land because NDVI near 0 is meaningful.
            if ndvi < -0.05:
                continue

            lon, lat = xy(
                transform,
                row + BLOCK_SIZE / 2,
                col + BLOCK_SIZE / 2,
                offset="center"
            )

            lon = float(lon)
            lat = float(lat)

            height = ndvi_to_height(ndvi)
            greenness = ndvi_to_display_value(ndvi)

            features.append({
                "type": "Feature",
                "properties": {
                    "year": int(year),
                    "ndvi": round(float(ndvi), 5),
                    "greenness": round(float(greenness), 5),
                    "height": round(float(height), 2)
                },
                "geometry": make_cell_polygon(
                    lon,
                    lat,
                    lon_size,
                    lat_size
                )
            })

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    out_path = OUT_DIR / f"actual_ndvi_spikes_{year}.geojson"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f)

    print(f"Saved {len(features):,} spikes to {out_path}")


def main():
    for year, path in FILES.items():
        convert_one_year(year, path)


if __name__ == "__main__":
    main()