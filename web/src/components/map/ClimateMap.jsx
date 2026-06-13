import { useCallback, useEffect, useMemo, useRef } from 'react'
import Map, { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer, TextLayer, PathLayer } from '@deck.gl/layers'
import { SimpleMeshLayer } from '@deck.gl/mesh-layers'
import { ConeGeometry } from '@luma.gl/engine'
import { useDashboard } from '../../store/useDashboard.js'
import { useWorkspace } from '../../store/useWorkspace.js'
import { useFloodScenario } from '../../store/useFloodScenario.js'
import { useMapSettings, styleValue, gibsTileUrl } from '../../store/useMapSettings.js'
import { heatRGB, divergingRGB, getElevation, wardScore } from '../../lib/risk.js'
import Legend from './Legend.jsx'
import ViewToggle from './ViewToggle.jsx'
import MapSettings from './MapSettings.jsx'
import { FloodScenarioButton, FloodScenarioHud } from './FloodScenario.jsx'

// Token-free terrain DEM (AWS terrarium tiles) used by the temporary 3D-terrain toggle.
const TERRAIN_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'

const LAYER_LABELS = {
  heat: 'Heat stress', flood: 'Flood risk', veg: 'Vegetation', lake: 'Lake health',
  urban: 'Urban growth', water: 'Waterlogging',
}

// 3D "risk spikes": a 4-sided cone = a square pyramid. The cone's height runs along its Y axis,
// centred on the origin, so we shift every vertex +0.5 in Y to seat the base at y=0 (apex at y=1).
// With getOrientation [0,0,90] the pyramid then stands upright, rooted on the ground.
const PYRAMID = new ConeGeometry({ radius: 1, height: 1, nradial: 4, cap: true })
{
  const pos = PYRAMID.attributes.POSITION.value
  for (let i = 1; i < pos.length; i += 3) pos[i] += 0.5
}

const INITIAL_VIEW = {
  longitude: 78.456,
  latitude: 17.42,
  zoom: 10.4,
  pitch: 50,
  bearing: 15,
}

// deck.gl overlay mounted as a MapLibre control (interleaved so 3D respects map camera).
function DeckOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: true, ...props }))
  overlay.setProps(props)
  return null
}

export default function ClimateMap() {
  const wards = useDashboard((s) => s.wards)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const year = useDashboard((s) => s.year)
  const view = useDashboard((s) => s.view)
  const highlightWards = useDashboard((s) => s.highlightWards)
  const setSelectedWard = useDashboard((s) => s.setSelectedWard)
  const setData = useDashboard((s) => s.setData)
  const legend = useDashboard((s) => s.activeLegend())

  // Temporary "map lab" settings.
  const styleId = useMapSettings((s) => s.styleId)
  const pitch = useMapSettings((s) => s.pitch)
  const bearing = useMapSettings((s) => s.bearing)
  const fillAlpha = useMapSettings((s) => s.fillAlpha)
  const elevationMul = useMapSettings((s) => s.elevationMul)
  const lineWidth = useMapSettings((s) => s.lineWidth)
  const wireframe = useMapSettings((s) => s.wireframe)
  const borders = useMapSettings((s) => s.borders)
  const terrain = useMapSettings((s) => s.terrain)
  const terrainExaggeration = useMapSettings((s) => s.terrainExaggeration)
  const hillshade = useMapSettings((s) => s.hillshade)
  const buildings3d = useMapSettings((s) => s.buildings3d)
  const waterBodies = useMapSettings((s) => s.waterBodies)
  const satellite = useMapSettings((s) => s.satellite)
  const satelliteIndex = useMapSettings((s) => s.satelliteIndex)
  const satelliteOpacity = useMapSettings((s) => s.satelliteOpacity)

  // Workspace mode — Change mode recolors wards by their delta (improved↔worsened).
  const mode = useWorkspace((s) => s.mode)
  const compareYear = useWorkspace((s) => s.compareYear)
  const changeMode = mode === 'change'

  // Musi-river monsoon flood scenario.
  const scnActive = useFloodScenario((s) => s.active)
  const scnTime = useFloodScenario((s) => s.time)
  const scnData = useFloodScenario((s) => s.data)

  const mapRef = useRef(null)
  const highlightSet = useMemo(() => new Set(highlightWards), [highlightWards])

  // Register a flyTo on map load so the Ask choreography can glide the camera.
  const onMapLoad = useCallback(
    (e) => {
      const map = e.target
      mapRef.current = map
      setData({
        flyTo: (focus) => {
          if (!focus?.center) return
          map.easeTo({
            center: focus.center,
            zoom: focus.zoom ?? map.getZoom(),
            pitch: focus.pitch ?? map.getPitch(),
            bearing: focus.bearing ?? map.getBearing(),
            duration: 1500,
          })
        },
      })
    },
    [setData]
  )

  const layers = useMemo(() => {
    if (!wards) return []
    const elevMul = view === '2d' ? 0 : elevationMul

    if (view === '3d') {
      // 3D risk-spike pyramids at ward centroids: height = risk, color = heat ramp.
      const points = (wards.features ?? []).map((f) => ({
        name: f.properties.name,
        position: f.properties.centroid,
        score: wardScore(f.properties, year, activeLayer),
        props: f.properties,
      }))
      return [
        new SimpleMeshLayer({
          id: 'wards-spikes',
          data: points,
          mesh: PYRAMID,
          getPosition: (d) => d.position,
          // base radius (m) and height (m): hot wards spike tall, highlighted ones flare wider.
          getScale: (d) => {
            const h = Math.max(120, getElevation(d.score, elevationMul) * 1.6)
            const r = highlightSet.has(d.name) ? 700 : 520
            return [r, h, r]
          },
          getOrientation: () => [0, 0, 90], // stand the cone upright (apex up)
          getColor: (d) => [...heatRGB(d.score), highlightSet.has(d.name) ? 255 : 225],
          pickable: true,
          material: { ambient: 0.55, diffuse: 0.7, shininess: 24, specularColor: [255, 255, 255] },
          updateTriggers: {
            getScale: [year, activeLayer, elevationMul, highlightWards],
            getColor: [year, activeLayer, highlightWards],
          },
        }),
      ]
    }

    // 2D choropleth / 2.5D extrusion.
    return [
      new GeoJsonLayer({
        id: 'wards-25d',
        data: wards,
        extruded: view === '2.5d',
        wireframe,
        getElevation: (f) => getElevation(wardScore(f.properties, year, activeLayer), elevMul),
        getFillColor: (f) => {
          if (changeMode) {
            const d =
              wardScore(f.properties, year, activeLayer) -
              wardScore(f.properties, compareYear, activeLayer)
            return [...divergingRGB(d), fillAlpha]
          }
          return [...heatRGB(wardScore(f.properties, year, activeLayer)), fillAlpha]
        },
        getLineColor: (f) =>
          highlightSet.has(f.properties.name) ? [22, 150, 65, 255] : [90, 110, 130, 90],
        getLineWidth: (f) =>
          !borders ? 0 : highlightSet.has(f.properties.name) ? Math.max(2, lineWidth + 2) : lineWidth,
        lineWidthUnits: 'pixels',
        stroked: borders,
        pickable: true,
        autoHighlight: true,
        highlightColor: [22, 163, 74, 90],
        updateTriggers: {
          getElevation: [year, activeLayer, view, elevationMul],
          getFillColor: [year, activeLayer, legend, fillAlpha, changeMode, compareYear],
          getLineColor: [highlightWards],
          getLineWidth: [highlightWards, borders, lineWidth],
        },
        transitions: { getElevation: 600, getFillColor: 600 },
      }),
    ]
  }, [
    wards,
    view,
    year,
    activeLayer,
    legend,
    highlightSet,
    highlightWards,
    elevationMul,
    fillAlpha,
    lineWidth,
    wireframe,
    borders,
    changeMode,
    compareYear,
  ])

  // Real OSM water bodies (lakes + Musi river) — static border layer, drawn over the choropleth.
  const waterLayer = useMemo(
    () =>
      new GeoJsonLayer({
        id: 'water-bodies',
        data: '/data/water_bodies.geojson',
        stroked: true,
        filled: true,
        getFillColor: [56, 170, 220, 55],
        getLineColor: [14, 120, 170, 215],
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 1,
        pickable: false,
      }),
    []
  )

  // Value badges for highlighted wards — labels the wards an answer / plan refers to, so the
  // chat→map projection is unmistakable. Clicking a badge opens that ward's drill-down.
  const badgeLayer = useMemo(() => {
    if (!wards || !highlightWards.length) return null
    const items = (wards.features || [])
      .filter((f) => highlightSet.has(f.properties.name))
      .map((f) => ({
        name: f.properties.name,
        position: f.properties.centroid,
        text: `${f.properties.name}  ${wardScore(f.properties, year, activeLayer)}`,
      }))
    return new TextLayer({
      id: 'ward-badges',
      data: items,
      pickable: true,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getSize: 12,
      getColor: [26, 38, 30, 255],
      getPixelOffset: [0, -16],
      background: true,
      getBackgroundColor: [255, 255, 255, 235],
      backgroundPadding: [6, 3],
      fontWeight: 700,
      billboard: true,
      characterSet: 'auto',
      updateTriggers: { getText: [year, activeLayer, highlightWards] },
    })
  }, [wards, highlightWards, highlightSet, year, activeLayer])

  // Flood-scenario ward sets — recomputed only when a new ward floods (not every frame).
  const scnProgress = scnActive && scnData ? (scnTime / scnData.duration) * 100 : 0
  const scnFloodedCount = scnActive && scnData ? scnData.floodWards.filter((w) => w.t <= scnProgress).length : 0
  const scnFeatures = useMemo(() => {
    const empty = { type: 'FeatureCollection', features: [] }
    if (!scnActive || !scnData || !wards) return { flooded: empty, future: empty }
    const floodedNames = new Set(scnData.floodWards.slice(0, scnFloodedCount).map((w) => w.name))
    const futureSet = new Set(scnData.future)
    return {
      flooded: { type: 'FeatureCollection', features: (wards.features || []).filter((f) => floodedNames.has(f.properties.name)) },
      future: { type: 'FeatureCollection', features: (wards.features || []).filter((f) => futureSet.has(f.properties.name)) },
    }
  }, [scnActive, scnData, scnFloodedCount, wards])

  // Flood scenario layers: dim river + a glowing pulse flowing downstream + flooded banks + future outlines.
  const scenarioLayers = useMemo(() => {
    if (!scnActive || !scnData) return []
    const river = scnData.river
    const n = river.length
    const head = Math.min(n - 1, Math.floor((scnTime / scnData.duration) * (n - 1)))
    const pulse = river.slice(Math.max(0, head - 16), head + 1)
    return [
      new PathLayer({ id: 'musi-dim', data: [{ path: river }], getPath: (d) => d.path, getColor: [56, 150, 200, 120], getWidth: 3, widthUnits: 'pixels', widthMinPixels: 2, capRounded: true, jointRounded: true }),
      new GeoJsonLayer({ id: 'flood-banks', data: scnFeatures.flooded, filled: true, stroked: true, getFillColor: [40, 130, 200, 120], getLineColor: [12, 74, 170, 220], lineWidthUnits: 'pixels', lineWidthMinPixels: 1 }),
      new GeoJsonLayer({ id: 'flood-future', data: scnFeatures.future, filled: false, stroked: true, getLineColor: [244, 160, 40, 235], getLineWidth: 2.5, lineWidthUnits: 'pixels', lineWidthMinPixels: 2 }),
      pulse.length > 1 &&
        new PathLayer({ id: 'musi-pulse', data: [{ path: pulse }], getPath: (d) => d.path, getColor: [140, 225, 255, 255], getWidth: 7, widthUnits: 'pixels', widthMinPixels: 4, capRounded: true, jointRounded: true }),
    ].filter(Boolean)
  }, [scnActive, scnData, scnTime, scnFeatures])

  const allLayers = useMemo(() => {
    const arr = [...layers]
    if (waterBodies) arr.push(waterLayer)
    arr.push(...scenarioLayers)
    if (badgeLayer) arr.push(badgeLayer)
    return arr
  }, [layers, waterBodies, waterLayer, scenarioLayers, badgeLayer])

  const getTooltip = useCallback(
    ({ object }) => {
      if (!object) return null
      const props = object.props || object.properties
      if (!props) return null
      const s = props.scores?.[year] || {}
      const rows = ['flood', 'heat', 'veg', 'lake', 'urban', 'water']
        .map((k) => `${k}: ${s[k] ?? '–'}`)
        .join('  ·  ')
      return {
        html: `<div style="font-weight:600;margin-bottom:2px">${props.name}</div><div style="opacity:.8;font-size:11px">${rows}</div>`,
        style: {
          background: 'rgba(255,255,255,0.96)',
          color: '#1e2f3a',
          border: '1px solid rgba(15,23,42,0.12)',
          borderRadius: '10px',
          padding: '8px 10px',
          fontSize: '12px',
          boxShadow: '0 6px 20px rgba(15,23,42,0.12)',
        },
      }
    },
    [year]
  )

  const onClick = useCallback(
    ({ object }) => {
      const name = object?.props?.name || object?.properties?.name || object?.name
      if (name) setSelectedWard(name)
    },
    [setSelectedWard]
  )

  // Push pitch/bearing from the lab sliders onto the camera.
  useEffect(() => {
    const map = mapRef.current
    if (map) map.easeTo({ pitch, bearing, duration: 500 })
  }, [pitch, bearing])

  // Apply / remove the 3D terrain DEM + hillshade relief. Both read the same raster-dem source.
  // Re-applies after a style swap (sources/layers reset on setStyle).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const HILLSHADE_ID = 'bhumi-hillshade'
    const apply = () => {
      try {
        // The DEM source is shared by terrain (mesh) and hillshade (lighting).
        if ((terrain || hillshade) && !map.getSource('terrain-dem')) {
          map.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: [TERRAIN_TILES],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 14,
          })
        }

        // 3D mesh.
        map.setTerrain(terrain ? { source: 'terrain-dem', exaggeration: terrainExaggeration } : null)

        // Hillshade relief layer — inserted under the basemap's labels so roads/text stay legible.
        if (hillshade) {
          if (!map.getLayer(HILLSHADE_ID)) {
            const beforeId = (map.getStyle().layers || []).find((l) => l.type === 'symbol')?.id
            map.addLayer(
              {
                id: HILLSHADE_ID,
                type: 'hillshade',
                source: 'terrain-dem',
                paint: {
                  'hillshade-exaggeration': 0.6,
                  'hillshade-shadow-color': '#33402f',
                  'hillshade-highlight-color': '#f4f7ee',
                  'hillshade-accent-color': '#5a7350',
                },
              },
              beforeId
            )
          }
          // A soft sky so the horizon reads as atmosphere at high pitch.
          map.setSky?.({
            'sky-color': '#bcd4c6',
            'sky-horizon-blend': 0.5,
            'horizon-color': '#e6efe8',
            'horizon-fog-blend': 0.6,
          })
        } else if (map.getLayer(HILLSHADE_ID)) {
          map.removeLayer(HILLSHADE_ID)
        }
      } catch {
        /* style mid-reload; the styledata listener below will retry */
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
    map.on('styledata', apply)
    return () => map.off('styledata', apply)
  }, [terrain, terrainExaggeration, hillshade, styleId])

  // Optional 3D buildings (city skyline). Reads the active vector style's `building` source-layer
  // (OpenMapTiles / CARTO schema). No-op for styles that don't expose buildings (e.g. raster).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const LYR = 'bhumi-3d-buildings'
    const apply = () => {
      try {
        if (!buildings3d) {
          if (map.getLayer(LYR)) map.removeLayer(LYR)
          return
        }
        if (map.getLayer(LYR)) return
        const style = map.getStyle()
        const bldg = (style.layers || []).find((l) => l['source-layer'] === 'building')
        if (!bldg) return // style has no buildings → toggle is a no-op
        const beforeId = (style.layers || []).find((l) => l.type === 'symbol')?.id
        map.addLayer(
          {
            id: LYR,
            type: 'fill-extrusion',
            source: bldg.source,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#cdd6c9',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.85,
            },
          },
          beforeId
        )
      } catch {
        /* style mid-reload; styledata listener retries */
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
    map.on('styledata', apply)
    return () => map.off('styledata', apply)
  }, [buildings3d, styleId])

  // NASA GIBS satellite overlay. The tile date follows the global Time Machine year, so pressing
  // ▶ Play animates real satellite imagery (true-color / NDVI / land-surface-temp) over Hyderabad.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const SRC = 'gibs-src'
    const LYR = 'bhumi-satellite'
    const apply = () => {
      try {
        if (!satellite) {
          if (map.getLayer(LYR)) map.removeLayer(LYR)
          if (map.getSource(SRC)) map.removeSource(SRC)
          return
        }
        const url = gibsTileUrl(satelliteIndex, year)
        const maxzoom = satelliteIndex === 'lst' ? 7 : 9
        if (!map.getSource(SRC)) {
          map.addSource(SRC, { type: 'raster', tiles: [url], tileSize: 256, maxzoom, attribution: '© NASA EOSDIS GIBS' })
        } else {
          map.getSource(SRC).setTiles([url])
        }
        if (!map.getLayer(LYR)) {
          const beforeId = (map.getStyle().layers || []).find((l) => l.type === 'symbol')?.id
          map.addLayer({ id: LYR, type: 'raster', source: SRC, paint: { 'raster-opacity': satelliteOpacity } }, beforeId)
        } else {
          map.setPaintProperty(LYR, 'raster-opacity', satelliteOpacity)
        }
      } catch {
        /* style mid-reload; the styledata listener retries */
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
    map.on('styledata', apply)
    return () => map.off('styledata', apply)
  }, [satellite, satelliteIndex, satelliteOpacity, year, styleId])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <Map
        initialViewState={INITIAL_VIEW}
        mapStyle={styleValue(styleId)}
        onLoad={onMapLoad}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <DeckOverlay layers={allLayers} getTooltip={getTooltip} onClick={onClick} />
      </Map>

      {/* "Bhumi is showing …" banner — makes the chat/plan → map projection explicit. */}
      {highlightWards.length > 0 && (
        <div className="glass absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] shadow-sm">
          <span className="font-semibold text-neon-deep">Bhumi is showing</span>
          <span className="capitalize text-ink">{LAYER_LABELS[activeLayer] || activeLayer}</span>
          <span className="text-ink-dim">· {year} ·</span>
          <span className="font-semibold text-ink">{highlightWards.length} wards</span>
        </div>
      )}

      {/* bottom-centre control dock: view modes + flood scenario + map lab (clears the side panels) */}
      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-end gap-2">
        <ViewToggle />
        <FloodScenarioButton />
        <MapSettings />
      </div>
      <FloodScenarioHud />
      <Legend />
    </div>
  )
}
