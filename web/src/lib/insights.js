// Per-layer decision context for the right panel: plain-language cause + the single best
// first action. Grounded in the data calibration (Musi flood belt, urban heat island, lake
// degradation, canopy loss). Mirrors backend _CAUSES / _ACTIONS so chat and panel agree.

export const LAYER_META = {
  flood: {
    label: 'Flood risk',
    cause: 'Low-lying Musi-belt terrain, encroached nalas and overwhelmed storm-water drains.',
    firstAction: 'De-silt & widen primary drains and clear nala encroachments before monsoon.',
    intervention: 'drain_desilt',
  },
  heat: {
    label: 'Heat stress',
    cause: 'Dense built-up cover, low tree canopy and heat-trapping concrete surfaces.',
    firstAction: 'Cool-roof subsidy + ward tree-cover targets in the hottest wards.',
    intervention: 'cool_roof',
  },
  lake: {
    label: 'Lake / water stress',
    cause: 'Shrinking, encroached and sewage-polluted lakes under unchecked urban pressure.',
    firstAction: 'Restore & fence priority lakes and stop sewage inflow.',
    intervention: 'lake_restore',
  },
  veg: {
    label: 'Vegetation loss',
    cause: 'Tree cover and green space lost to rapid construction.',
    firstAction: 'Protect remaining canopy and mandate planting in every new approval.',
    intervention: 'tree_cover',
  },
  // fallbacks (not shown as primary tabs, but agent may set them)
  urban: {
    label: 'Urban growth',
    cause: 'Rapid expansion of impervious built-up area outpacing drainage.',
    firstAction: 'Enforce permeable-surface norms and steer growth to drainage-ready zones.',
    intervention: 'permeable_surface',
  },
  water: {
    label: 'Waterlogging',
    cause: 'Monsoon ponding where drainage capacity is exceeded.',
    firstAction: 'Build recharge pits / retention ponds and clear secondary-drain choke points.',
    intervention: 'permeable_surface',
  },
}

export function layerMeta(layer) {
  return LAYER_META[layer] || LAYER_META.flood
}
