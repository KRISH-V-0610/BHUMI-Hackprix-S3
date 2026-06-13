import { create } from 'zustand'

// TEMPORARY exploration store: basemap style + map render knobs, driven by the gear panel.
// Once we pick the winning combo we can hard-code it back into ClimateMap and delete this.

// Inline raster style builders (token-free). MapLibre accepts a full style object for mapStyle.
const rasterStyle = (id, tiles, attribution) => ({
  version: 8,
  sources: { [id]: { type: 'raster', tiles, tileSize: 256, attribution } },
  layers: [{ id, type: 'raster', source: id }],
})

// Optional MapTiler key — unlocks the premium "Dataviz" dashboard styles when present.
const MT_KEY = import.meta.env.VITE_MAPTILER_KEY || ''

// Token-free basemaps (no API key): OpenFreeMap (OSM vector) + CARTO + raster. MapTiler Dataviz
// is appended only when VITE_MAPTILER_KEY is set, so the app stays token-free by default.
const BASE_STYLES = [
  // OpenFreeMap — token-free OSM vector tiles; "Liberty" is our aesthetic default.
  { id: 'liberty', label: 'Liberty (color)', kind: 'vector', value: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'ofm-positron', label: 'Positron (clean)', kind: 'vector', value: 'https://tiles.openfreemap.org/styles/positron' },
  // CARTO vector (token-free)
  { id: 'voyager', label: 'Voyager (warm)', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  { id: 'darkmatter', label: 'Dark Matter', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  // Raster options
  {
    id: 'satellite',
    label: 'Satellite (Esri)',
    kind: 'raster',
    value: rasterStyle(
      'esri-sat',
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Tiles © Esri'
    ),
  },
  {
    id: 'osm',
    label: 'OSM Standard',
    kind: 'raster',
    value: rasterStyle('osm', ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], '© OpenStreetMap'),
  },
]

const MAPTILER_STYLES = MT_KEY
  ? [
      { id: 'mt-dataviz', label: 'Dataviz · Light', kind: 'vector', value: `https://api.maptiler.com/maps/dataviz/style.json?key=${MT_KEY}` },
      { id: 'mt-dataviz-dark', label: 'Dataviz · Dark', kind: 'vector', value: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MT_KEY}` },
    ]
  : []

export const MAP_STYLES = [...BASE_STYLES, ...MAPTILER_STYLES]

export const useMapSettings = create((set) => ({
  open: false,
  styleId: 'liberty',

  // camera
  pitch: 50,
  bearing: 15,

  // ward layer render knobs
  fillAlpha: 200, // 0-255 fill opacity for risk colors
  elevationMul: 40, // extrusion height per risk point
  lineWidth: 1, // ward border width (px)
  wireframe: true, // extruded wireframe edges
  borders: true, // show ward borders at all

  // experimental
  terrain: false, // 3D terrain DEM (AWS terrarium tiles)
  terrainExaggeration: 1.3,
  hillshade: false, // hillshade relief + sky (the "Innsbruck" shaded-slopes look)
  buildings3d: false, // extrude OSM buildings (OpenMapTiles `building` layer) for a city skyline

  // NASA GIBS satellite overlay — real imagery, animated by the global Time Machine year.
  satellite: false,
  satelliteIndex: 'truecolor', // 'truecolor' | 'ndvi' | 'lst'
  satelliteOpacity: 0.85,

  // Real OSM water bodies (lakes + Musi river) bordered on the map.
  waterBodies: true,

  toggleOpen: () => set((s) => ({ open: !s.open })),
  set: (patch) => set(patch),
  reset: () =>
    set({
      styleId: 'liberty',
      pitch: 50,
      bearing: 15,
      fillAlpha: 200,
      elevationMul: 40,
      lineWidth: 1,
      wireframe: true,
      borders: true,
      terrain: false,
      terrainExaggeration: 1.3,
      hillshade: false,
      buildings3d: false,
      satellite: false,
      satelliteIndex: 'truecolor',
      satelliteOpacity: 0.85,
      waterBodies: true,
    }),
}))

// NASA GIBS layer configs (token-free WMTS, EPSG:3857). Verified live over Hyderabad.
// Tile URL order is {z}/{y}/{x}; NDVI is 16-day so we use Jan-1 period starts (always valid).
export const GIBS_LAYERS = {
  truecolor: {
    label: 'True Color',
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxzoom: 9,
    dateFor: (y) => `${y}-04-15`, // daily — pre-monsoon, clearer skies
  },
  ndvi: {
    label: 'NDVI · vegetation',
    id: 'MODIS_Terra_L3_NDVI_16Day',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'png',
    maxzoom: 9,
    dateFor: (y) => `${y}-01-01`, // 16-day product — Jan 1 is always a period start
  },
  lst: {
    label: 'Land Surface Temp',
    id: 'MODIS_Terra_Land_Surface_Temp_Day',
    matrix: 'GoogleMapsCompatible_Level7',
    ext: 'png',
    maxzoom: 7,
    dateFor: (y) => `${y}-04-15`, // daily
  },
}

export function gibsTileUrl(index, year) {
  const c = GIBS_LAYERS[index] || GIBS_LAYERS.truecolor
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${c.id}/default/${c.dateFor(Number(year))}/${c.matrix}/{z}/{y}/{x}.${c.ext}`
}

// Resolve a styleId to the mapStyle value (URL string or inline style object).
export function styleValue(styleId) {
  return (MAP_STYLES.find((s) => s.id === styleId) || MAP_STYLES[0]).value
}
