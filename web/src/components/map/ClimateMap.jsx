import { useCallback, useEffect, useMemo, useRef } from 'react'
import Map, { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer, TextLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers'
import { SimpleMeshLayer } from '@deck.gl/mesh-layers'
import { ConeGeometry } from '@luma.gl/engine'
import { useDashboard } from '../../store/useDashboard.js'
import { useWorkspace } from '../../store/useWorkspace.js'
import { useFloodScenario } from '../../store/useFloodScenario.js'
import { useMapSettings, styleValue, gibsTileUrl } from '../../store/useMapSettings.js'
import { heatRGB, divergingRGB, getElevation, wardScore } from '../../lib/risk.js'
import { cityMaskPolygon, cityHull } from '../../lib/cityMask.js'
import Legend from './Legend.jsx'

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
  const layersData = useDashboard((s) => s.layers)

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
  const geeLayer = useMapSettings((s) => s.geeLayer)
  const geeOpacity = useMapSettings((s) => s.geeOpacity)
  const cropCity = useMapSettings((s) => s.cropCity)

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
        map,
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
          getColor: (d) => {
            const c = heatRGB(d.score)
            if (highlightSet.size === 0) return [...c, 225]
            return highlightSet.has(d.name) ? [...c, 255] : [...c, 70]
          },
          pickable: true,
          material: { ambient: 0.55, diffuse: 0.7, shininess: 24, specularColor: [255, 255, 255] },
          updateTriggers: {
            getScale: [year, activeLayer, elevationMul, highlightWards],
            getColor: [year, activeLayer, highlightWards],
          },
        }),
      ]
    }

    // 2.5D extruded ward zones (irregular GHMC polygons). When an AOI is highlighted, everything
    // else dims and recedes so the focus wards read like the glowing area-of-interest.
    const hasFocus = highlightSet.size > 0
    const dim = (rgb) => [
      Math.round(rgb[0] * 0.34 + 150 * 0.66),
      Math.round(rgb[1] * 0.34 + 150 * 0.66),
      Math.round(rgb[2] * 0.34 + 140 * 0.66),
    ]
    return [
      new GeoJsonLayer({
        id: 'wards-25d',
        data: wards,
        extruded: view === '2.5d',
        wireframe,
        getElevation: (f) => {
          const e = getElevation(wardScore(f.properties, year, activeLayer), elevMul)
          if (!hasFocus) return e
          return highlightSet.has(f.properties.name) ? e * 1.6 : e * 0.85
        },
        getFillColor: (f) => {
          let rgb
          if (changeMode) {
            rgb = divergingRGB(
              wardScore(f.properties, year, activeLayer) -
                wardScore(f.properties, compareYear, activeLayer)
            )
          } else {
            rgb = heatRGB(wardScore(f.properties, year, activeLayer))
          }
          if (!hasFocus) return [...rgb, fillAlpha]
          return highlightSet.has(f.properties.name)
            ? [...rgb, 255] // focus wards: full, vivid
            : [...dim(rgb), Math.round(fillAlpha * 0.4)] // others: muted + translucent
        },
        getLineColor: (f) =>
          highlightSet.has(f.properties.name)
            ? [20, 67, 46, 255] // deep-green focus border
            : hasFocus
              ? [90, 110, 100, 40]
              : [90, 110, 100, 90],
        getLineWidth: (f) =>
          highlightSet.has(f.properties.name) ? Math.max(2.5, lineWidth + 2.5) : borders ? lineWidth : 0,
        lineWidthUnits: 'pixels',
        stroked: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [20, 94, 63, 90],
        updateTriggers: {
          getElevation: [year, activeLayer, view, elevationMul, highlightWards],
          getFillColor: [year, activeLayer, legend, fillAlpha, changeMode, compareYear, highlightWards],
          getLineColor: [highlightWards],
          getLineWidth: [highlightWards, borders, lineWidth],
        },
        transitions: { getElevation: 600, getFillColor: 400 },
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

  // "Island" mask — a dark curtain over everything outside the Hyderabad ward boundary, so the
  // city reads as a floating landmass (concept-art look). Drawn first, under the wards + water.
  const maskLayer = useMemo(() => {
    if (!cropCity || !wards) return null
    const polygon = cityMaskPolygon(wards)
    if (!polygon) return null
    return new SolidPolygonLayer({
      id: 'city-mask',
      data: [{ polygon }],
      getPolygon: (d) => d.polygon,
      getFillColor: [9, 16, 20, 255],
      filled: true,
      stroked: false,
      extruded: false,
      pickable: false,
      parameters: { depthTest: false },
    })
  }, [cropCity, wards])

  // Glowing island border — a soft wide underglow + a crisp neon edge tracing the city outline,
  // so the cropped landmass reads as a deliberate, lit "island" (concept-art look).
  const islandEdge = useMemo(() => {
    if (!cropCity || !wards) return []
    const ring = cityHull(wards, 0.13)
    if (!ring.length) return []
    return [
      new GeoJsonLayer({
        id: 'island-underglow',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ring } },
        stroked: true, filled: false, getLineColor: [57, 255, 136, 70],
        getLineWidth: 16, lineWidthUnits: 'pixels', lineWidthMinPixels: 8,
        parameters: { depthTest: false },
      }),
      new GeoJsonLayer({
        id: 'island-edge',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ring } },
        stroked: true, filled: false, getLineColor: [120, 255, 180, 230],
        getLineWidth: 2.5, lineWidthUnits: 'pixels', lineWidthMinPixels: 1.5,
        parameters: { depthTest: false },
      }),
    ]
  }, [cropCity, wards])

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

  // Soft neon glow ring around the focus wards — the "area of interest" halo from the concept art.
  const glowLayer = useMemo(() => {
    if (!wards || !highlightWards.length) return null
    const focusFC = {
      type: 'FeatureCollection',
      features: (wards.features || []).filter((f) => highlightSet.has(f.properties.name)),
    }
    return new GeoJsonLayer({
      id: 'aoi-glow',
      data: focusFC,
      stroked: true,
      filled: false,
      getLineColor: [57, 255, 136, 120],
      getLineWidth: 9,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 5,
      parameters: { depthTest: false },
      updateTriggers: { getLineColor: [highlightWards] },
    })
  }, [wards, highlightWards, highlightSet])

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

  // Flood scenario layers: river trace + glowing pulse + DEPTH-coloured flooded wards (severe
  // ones edged red) + PULSING forecast high-risk zones (filled, ringed, labelled "2028").
  const scenarioLayers = useMemo(() => {
    if (!scnActive || !scnData) return []
    const river = scnData.river
    const n = river.length
    const prog = scnTime / scnData.duration // 0..1
    const head = Math.min(n - 1, Math.floor(prog * (n - 1)))
    const pulse = river.slice(Math.max(0, head - 16), head + 1)
    const pulse01 = 0.5 + 0.5 * Math.sin(scnTime * 0.5) // 0..1 breathing
    const showFuture = prog >= 0.5 // forecast zones surface once the live flood is mapped
    // Flood "depth" ramp: shallow light-blue -> deep navy by flood score.
    const depthBlue = (s) => {
      const t = Math.max(0, Math.min(1, s / 100))
      return [Math.round(150 - 138 * t), Math.round(202 - 128 * t), Math.round(236 - 66 * t)]
    }
    const futScore = (name) => scnData.future.find((w) => w.name === name)?.fut ?? 65
    return [
      new PathLayer({ id: 'musi-dim', data: [{ path: river }], getPath: (d) => d.path, getColor: [70, 150, 215, 150], getWidth: 3, widthUnits: 'pixels', widthMinPixels: 2, capRounded: true, jointRounded: true }),
      // flooded bank wards — water-depth fill, severe ones edged red
      new GeoJsonLayer({
        id: 'flood-banks', data: scnFeatures.flooded, filled: true, stroked: true,
        getFillColor: (f) => [...depthBlue(wardScore(f.properties, year, 'flood')), 175],
        getLineColor: (f) => (wardScore(f.properties, year, 'flood') >= 80 ? [224, 56, 59, 235] : [12, 74, 170, 210]),
        getLineWidth: (f) => (wardScore(f.properties, year, 'flood') >= 80 ? 2.5 : 1.2),
        lineWidthUnits: 'pixels', lineWidthMinPixels: 1,
        updateTriggers: { getFillColor: [year], getLineColor: [year], getLineWidth: [year] },
      }),
      // advancing flood FRONT — a wide glow + a bright violet core so the trace is unmistakable
      pulse.length > 1 &&
        new PathLayer({ id: 'musi-pulse-glow', data: [{ path: pulse }], getPath: (d) => d.path, getColor: [168, 60, 255, 130], getWidth: 22, widthUnits: 'pixels', widthMinPixels: 11, capRounded: true, jointRounded: true, parameters: { depthTest: false } }),
      pulse.length > 1 &&
        new PathLayer({ id: 'musi-pulse', data: [{ path: pulse }], getPath: (d) => d.path, getColor: [221, 150, 255, 255], getWidth: 9, widthUnits: 'pixels', widthMinPixels: 5, capRounded: true, jointRounded: true, parameters: { depthTest: false } }),
      // FORECAST high-risk zones — pulsing amber→red fill graded by the 2028 flood score
      showFuture &&
        new GeoJsonLayer({
          id: 'flood-future-fill', data: scnFeatures.future, filled: true, stroked: true,
          getFillColor: (f) => [...heatRGB(Math.max(60, futScore(f.properties.name))), Math.round(35 + 80 * pulse01)],
          getLineColor: [244, 160, 40, 235], getLineWidth: 2, lineWidthUnits: 'pixels', lineWidthMinPixels: 1.5,
          updateTriggers: { getFillColor: [scnTime] },
        }),
      // pulsing forecast ring markers at each future ward
      showFuture &&
        new ScatterplotLayer({
          id: 'flood-future-rings', data: scnData.future, getPosition: (d) => d.centroid,
          getRadius: 320 + 520 * pulse01, radiusUnits: 'meters', radiusMinPixels: 7, radiusMaxPixels: 46,
          filled: false, stroked: true, getLineColor: [244, 160, 40, Math.round(110 + 130 * pulse01)], lineWidthMinPixels: 2,
          updateTriggers: { getRadius: [scnTime], getLineColor: [scnTime] },
        }),
      // forecast labels
      showFuture &&
        new TextLayer({
          id: 'flood-future-labels', data: scnData.future, getPosition: (d) => d.centroid,
          getText: (d) => `⚠ ${d.name} · 2028`, getSize: 11, getColor: [150, 70, 12, 255], getPixelOffset: [0, 15],
          background: true, getBackgroundColor: [255, 244, 214, 235], backgroundPadding: [5, 2], fontWeight: 700,
          billboard: true, characterSet: 'auto',
        }),
    ].filter(Boolean)
  }, [scnActive, scnData, scnTime, scnFeatures, year])

  const allLayers = useMemo(() => {
    const arr = []
    if (maskLayer) arr.push(maskLayer) // dark curtain first, so wards/water draw on top
    arr.push(...layers)
    if (waterBodies) arr.push(waterLayer)
    arr.push(...scenarioLayers)
    arr.push(...islandEdge) // glowing city border, over the basemap edge
    if (glowLayer) arr.push(glowLayer)
    if (badgeLayer) arr.push(badgeLayer)
    return arr
  }, [maskLayer, layers, waterBodies, waterLayer, scenarioLayers, islandEdge, glowLayer, badgeLayer])

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

  // LIVE Google Earth Engine overlay — the REAL Sentinel-2/MODIS tiles computed for the active
  // layer + year (getMapId). Years snap to the two observed years (2016/2026) that have tiles.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const SRC = 'gee-src'
    const LYR = 'bhumi-gee'
    const apply = () => {
      try {
        const snapY = Number(year) < 2021 ? 2016 : 2026
        const entry = (layersData || []).find(
          (l) => l.id === activeLayer && Number(l.year) === snapY
        )
        const url = entry?.tileUrl
        if (!geeLayer || !url) {
          if (map.getLayer(LYR)) map.removeLayer(LYR)
          if (map.getSource(SRC)) map.removeSource(SRC)
          return
        }
        if (!map.getSource(SRC)) {
          map.addSource(SRC, { type: 'raster', tiles: [url], tileSize: 256, attribution: '© Google Earth Engine' })
        } else {
          map.getSource(SRC).setTiles([url])
        }
        if (!map.getLayer(LYR)) {
          const beforeId = (map.getStyle().layers || []).find((l) => l.type === 'symbol')?.id
          map.addLayer({ id: LYR, type: 'raster', source: SRC, paint: { 'raster-opacity': geeOpacity } }, beforeId)
        } else {
          map.setPaintProperty(LYR, 'raster-opacity', geeOpacity)
        }
      } catch {
        /* style mid-reload; the styledata listener retries */
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
    map.on('styledata', apply)
    return () => map.off('styledata', apply)
  }, [geeLayer, geeOpacity, activeLayer, year, layersData, styleId])

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

      <Legend />
    </div>
  )
}
