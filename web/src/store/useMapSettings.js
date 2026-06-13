import { create } from 'zustand'

// TEMPORARY exploration store: basemap style + map render knobs, driven by the gear panel.
// Once we pick the winning combo we can hard-code it back into ClimateMap and delete this.

// Inline raster style builders (token-free). MapLibre accepts a full style object for mapStyle.
const rasterStyle = (id, tiles, attribution) => ({
  version: 8,
  sources: { [id]: { type: 'raster', tiles, tileSize: 256, attribution } },
  layers: [{ id, type: 'raster', source: id }],
})

// Token-free basemaps. CARTO vector styles + a couple of raster options.
export const MAP_STYLES = [
  { id: 'positron', label: 'Light · Positron', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  { id: 'positron-nolabels', label: 'Light · no labels', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json' },
  { id: 'voyager', label: 'Voyager (color)', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  { id: 'voyager-nolabels', label: 'Voyager · no labels', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json' },
  { id: 'darkmatter', label: 'Dark Matter', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  { id: 'dark-nolabels', label: 'Dark · no labels', kind: 'vector', value: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json' },
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

export const useMapSettings = create((set) => ({
  open: false,
  styleId: 'positron',

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

  toggleOpen: () => set((s) => ({ open: !s.open })),
  set: (patch) => set(patch),
  reset: () =>
    set({
      styleId: 'positron',
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
    }),
}))

// Resolve a styleId to the mapStyle value (URL string or inline style object).
export function styleValue(styleId) {
  return (MAP_STYLES.find((s) => s.id === styleId) || MAP_STYLES[0]).value
}
