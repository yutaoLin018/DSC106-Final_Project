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

# Level of detail files:
# low    = used for global view
# medium = used for regional view
# high   = used only when zoomed in
DETAIL_LEVELS = {
    "low": 80,
    "medium": 40,
    "high": 35,
}

# Smaller = more space between cells
CELL_FILL_BY_DETAIL = {
    "low": 0.60,
    "medium": 0.40,
    "high": 0.35,
}

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

    # Remove invalid NDVI values.
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


def ndvi_to_display_value(ndvi, p05, p95):
    """
    Convert actual NDVI into a 0–1 display value using percentile stretching.
    This improves visual contrast compared with raw NDVI.
    """
    norm = (ndvi - p05) / (p95 - p05 + 1e-9)
    return clamp(norm, 0, 1)


def ndvi_to_height(ndvi, p05, p95):
    """
    Stronger visual contrast:
    - very low NDVI stays almost flat
    - moderate NDVI becomes medium height
    - high NDVI becomes clearly tall
    """
    norm = ndvi_to_display_value(ndvi, p05, p95)

    if norm < 0.15:
        return 300

    if norm < 0.35:
        return 1200 + ((norm - 0.15) / 0.20) * 8000

    return 9000 + (norm ** 2.1) * 650000


def convert_one_year_detail(year, tif_path, detail_name, block_size):
    if not tif_path.exists():
        raise FileNotFoundError(f"Missing file: {tif_path}")

    print(f"Reading {year} / {detail_name}: {tif_path}")
    arr, transform = read_ndvi_tif(tif_path)

    valid = arr[np.isfinite(arr)]
    valid = valid[(valid >= -0.05) & (valid <= 1.0)]

    if valid.size == 0:
        raise ValueError(f"No valid NDVI values found for {year}")

    p05 = np.percentile(valid, 5)
    p95 = np.percentile(valid, 95)

    print(f"{year} {detail_name} NDVI stretch: p05={p05:.3f}, p95={p95:.3f}")

    nrows, ncols = arr.shape

    cell_fill = CELL_FILL_BY_DETAIL[detail_name]

    lon_size = abs(transform.a) * block_size * cell_fill
    lat_size = abs(transform.e) * block_size * cell_fill

    features = []

    for row in range(0, nrows, block_size):
        for col in range(0, ncols, block_size):
            ndvi = block_mean(arr, row, col, block_size)

            if not np.isfinite(ndvi):
                continue

            # Skip mostly water / invalid negative values.
            # Keep barren land near zero because it is meaningful.
            if ndvi < -0.05:
                continue

            lon, lat = xy(
                transform,
                row + block_size / 2,
                col + block_size / 2,
                offset="center"
            )

            lon = float(lon)
            lat = float(lat)

            # Keep only valid Mapbox coordinates.
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                continue

            # Match the map extent used in the website.
            if lat < -60 or lat > 85:
                continue

            greenness = ndvi_to_display_value(ndvi, p05, p95)
            height = ndvi_to_height(ndvi, p05, p95)

            features.append({
                "type": "Feature",
                "properties": {
                    "year": int(year),
                    "detail": detail_name,
                    "block_size": int(block_size),
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

    out_path = OUT_DIR / f"actual_ndvi_spikes_{year}_{detail_name}.geojson"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f)

    print(f"Saved {len(features):,} spikes to {out_path}")


def main():
    for year, path in FILES.items():
        for detail_name, block_size in DETAIL_LEVELS.items():
            convert_one_year_detail(year, path, detail_name, block_size)


if __name__ == "__main__":
    main()