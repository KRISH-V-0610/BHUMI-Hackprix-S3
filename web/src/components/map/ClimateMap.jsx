import { useCallback, useMemo } from 'react'
import Map, { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer, ColumnLayer } from '@deck.gl/layers'
import { useDashboard } from '../../store/useDashboard.js'
import { riskToRGB, getElevation, wardScore } from '../../lib/risk.js'
import Legend from './Legend.jsx'
import ViewToggle from './ViewToggle.jsx'

// Free, token-less LIGHT vector basemap (CARTO positron) to match the ADT.png concept.
// Swap-friendly if you add Mapbox later.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

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

  const highlightSet = useMemo(() => new Set(highlightWards), [highlightWards])

  // Register a flyTo on map load so the Ask choreography can glide the camera.
  const onMapLoad = useCallback(
    (e) => {
      const map = e.target
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
    const elevationMul = view === '2d' ? 0 : 40

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
          getElevation: (d) => getElevation(d.score),
          getFillColor: (d) => riskToRGB(d.score, legend, 220),
          getLineColor: (d) => (highlightSet.has(d.name) ? [22, 150, 65, 255] : [90, 110, 130, 120]),
          radius: 600,
          diskResolution: 24,
          extruded: true,
          pickable: true,
          elevationScale: 1,
          stroked: true,
          lineWidthMinPixels: 2,
          updateTriggers: {
            getElevation: [year, activeLayer],
            getFillColor: [year, activeLayer, legend],
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
        wireframe: true,
        getElevation: (f) => getElevation(wardScore(f.properties, year, activeLayer), elevationMul),
        getFillColor: (f) => riskToRGB(wardScore(f.properties, year, activeLayer), legend, 200),
        getLineColor: (f) =>
          highlightSet.has(f.properties.name) ? [22, 150, 65, 255] : [90, 110, 130, 90],
        getLineWidth: (f) => (highlightSet.has(f.properties.name) ? 3 : 1),
        lineWidthUnits: 'pixels',
        pickable: true,
        autoHighlight: true,
        highlightColor: [22, 163, 74, 90],
        updateTriggers: {
          getElevation: [year, activeLayer, view],
          getFillColor: [year, activeLayer, legend],
          getLineColor: [highlightWards],
          getLineWidth: [highlightWards],
        },
        transitions: { getElevation: 600, getFillColor: 600 },
      }),
    ]
  }, [wards, view, year, activeLayer, legend, highlightSet, highlightWards])

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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <Map
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLE}
        onLoad={onMapLoad}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <DeckOverlay layers={layers} getTooltip={getTooltip} onClick={onClick} />
      </Map>

      {/* overlaid controls */}
      <ViewToggle />
      <Legend />
    </div>
  )
}
