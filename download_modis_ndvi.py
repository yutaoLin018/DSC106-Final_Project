from pathlib import Path
from io import BytesIO
import requests
from PIL import Image

OUT_DIR = Path("gibs_modis_images")
OUT_DIR.mkdir(exist_ok=True)

WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"

LAYER = "MODIS_Terra_L3_NDVI_Monthly"

DATES = [
    "2000-07-01",
    "2013-07-01",
    "2025-07-01",
]

BBOX = (-180, -60, 180, 85)
WIDTH = 2400
HEIGHT = 1000


def download_gibs_image(date):
    year = date[:4]
    out_path = OUT_DIR / f"modis_terra_ndvi_{year}_july.png"

    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": LAYER,
        "STYLES": "",
        "FORMAT": "image/png",
        "TRANSPARENT": "false",
        "SRS": "EPSG:4326",
        "BBOX": ",".join(map(str, BBOX)),
        "WIDTH": WIDTH,
        "HEIGHT": HEIGHT,
        "TIME": date,
    }

    print(f"Downloading {date}...")

    response = requests.get(WMS_URL, params=params)
    response.raise_for_status()

    img = Image.open(BytesIO(response.content)).convert("RGB")
    img.save(out_path)

    print(f"Saved: {out_path}")


def main():
    for date in DATES:
        download_gibs_image(date)

    print("Done.")


if __name__ == "__main__":
    main()