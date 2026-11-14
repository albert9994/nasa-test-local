#!/usr/bin/env bash
# Downloads the NASA imagery used by the site (public domain, NASA GIBS WMS). Run from apps/web.
set -euo pipefail
G="https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&FORMAT=image/jpeg"
mkdir -p public/textures public/images
curl -sf -o public/textures/earth-day.jpg   "$G&LAYERS=BlueMarble_NextGeneration&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048"
curl -sf -o public/textures/earth-night.jpg "$G&LAYERS=VIIRS_Black_Marble&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&TIME=2016-01-01"
for y in 2010 2012; do  # US Corn Belt + Plains, mid-August: a normal year vs the 2012 flash drought
  curl -sf -o public/images/ndvi-midwest-$y.jpg "$G&LAYERS=MODIS_Terra_L3_NDVI_16Day&BBOX=36.5,-104,45.5,-86&WIDTH=2000&HEIGHT=1000&TIME=$y-08-12"
done
