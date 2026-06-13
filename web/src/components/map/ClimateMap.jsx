import { useCallback, useEffect, useMemo, useRef } from 'react'
import Map, { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer, ColumnLayer } from '@deck.gl/layers'
import { useDashboard } from '../../store/useDashboard.js'
import { useMapSettings, styleValue } from '../../store/useMapSettings.js'
import { riskToRGB, getElevation, wardScore } from '../../lib/risk.js'
import Legend from './Legend.jsx'
import ViewToggle from './ViewToggle.jsx'
import MapSettings from './MapSettings.jsx'

// Token-free terrain DEM (AWS terrarium tiles) used by the temporary 3D-terrain toggle.
const TERRAIN_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'

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
      // 3D bars at ward centroids.
      const points = (wards.features ?? []).map((f) => ({
        name: f.properties.name,
        position: f.properties.centroid,
        score: wardScore(f.properties, year, activeLayer),
        props: f.properties,
      }))
      return [
        new ColumnLayer({
          id: 'wards-3d',
          data: points,
          getPosition: (d) => d.position,
          getElevation: (d) => getElevation(d.score, elevationMul),
          getFillColor: (d) => riskToRGB(d.score, legend, fillAlpha),
          getLineColor: (d) => (highlightSet.has(d.name) ? [22, 150, 65, 255] : [90, 110, 130, 120]),
          radius: 600,
          diskResolution: 24,
          extruded: true,
          pickable: true,
          elevationScale: 1,
          stroked: borders,
          lineWidthMinPixels: Math.max(1, lineWidth),
          updateTriggers: {
            getElevation: [year, activeLayer, elevationMul],
            getFillColor: [year, activeLayer, legend, fillAlpha],
            getLineColor: [highlightWards],
          },
          transitions: { getElevation: 600, getFillColor: 600 },
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
        getFillColor: (f) => riskToRGB(wardScore(f.properties, year, activeLayer), legend, fillAlpha),
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
          getFillColor: [year, activeLayer, legend, fillAlpha],
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
  ])

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
      const props = object?.props || object?.properties
      if (props?.name) setSelectedWard(props.name)
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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <Map
        initialViewState={INITIAL_VIEW}
        mapStyle={styleValue(styleId)}
        onLoad={onMapLoad}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <DeckOverlay layers={layers} getTooltip={getTooltip} onClick={onClick} />
      </Map>

      {/* overlaid controls */}
      <ViewToggle />
      <MapSettings />
      <Legend />
    </div>
  )
}
