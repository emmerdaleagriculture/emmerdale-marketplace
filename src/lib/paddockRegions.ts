/**
 * Region-level notes about grazing ground, used on the per-county paddock
 * pages.
 *
 * Why region and not county: 88 county pages that differ only by a swapped
 * name are thin doorway pages, and Google treats them as such. The honest
 * differentiators we actually hold are the county's region, its neighbours and
 * its live contractor count — so the ground copy is keyed on region, where the
 * generalisations are true (a Cumbrian paddock really does behave differently
 * from a Norfolk one), rather than invented per county.
 *
 * Keep these accurate and general. Anything that claims specific local
 * knowledge we don't have belongs nowhere near here.
 */
export type RegionNote = {
  /** What the ground tends to do here. */
  ground: string;
  /** What that means for when the work is best done. */
  timing: string;
};

const DEFAULT_NOTE: RegionNote = {
  ground:
    'Grazing ground varies a good deal across the area, from free-draining land that burns off in a dry summer to heavier ground that holds wet through the winter.',
  timing:
    'Topping is usually a late-spring to late-summer job, harrowing and rolling suit the spring once the ground has dried, and hedge cutting waits until after the bird-nesting season ends in late summer.',
};

export const REGION_NOTES: Record<string, RegionNote> = {
  'South East': {
    ground:
      'Much of the South East sits on chalk — the Downs give light, free-draining paddocks that can burn off in a dry summer — while the Weald and the river valleys hold heavier clay that stays wet well into spring. Ragwort and docks take hold quickly on the thinner, lighter ground.',
    timing:
      'Light chalk ground dries early, so harrowing and rolling can start sooner here than in most of the country. Topping runs through summer, and the heavier Wealden clay is best left until it has dried out properly to avoid rutting the field.',
  },
  'South West': {
    ground:
      'A long, wet growing season and a lot of heavy ground. Grass keeps growing later here than almost anywhere in England, and the clay soils of Somerset, Dorset and Devon poach badly around gateways and rings in a wet winter. Rushes are a common sign that drainage needs attention.',
    timing:
      'The grass gets away from you quickly — paddocks often need topping more than once through the season. Wait for the ground to dry before harrowing or rolling, and be realistic about machinery access on soft clay.',
  },
  London: {
    ground:
      'Green-belt and urban-fringe paddocks: usually small, often tightly grazed, and frequently on heavier London clay that holds water through the winter. Overgrazing and poaching are the common problems rather than runaway grass.',
    timing:
      'Access is usually the limiting factor rather than the season — narrow lanes, gateways and yard entrances decide what machinery can get in. Worth mentioning access when you describe the job.',
  },
  'East of England': {
    ground:
      'The driest part of the country. Light, sandy and silty soils over much of the region, with fen peat in the low ground — grazing can go brown and stop growing in a dry summer, and thin swards let weeds in.',
    timing:
      'Ground dries early and travels well, so spring harrowing and rolling are straightforward. Topping is often a lighter job here than in the west, but weed spraying matters more on open, thin swards.',
  },
  'East Midlands': {
    ground:
      'Mostly mixed arable country with pockets of permanent grass. Heavy clay is common, with lighter land over the limestone — so paddocks in the same county can behave very differently a few miles apart.',
    timing:
      'A fairly standard season: harrow and roll in spring once the clay has dried, top through the summer, and cut hedges from late summer onwards.',
  },
  'West Midlands': {
    ground:
      'Good grass-growing country, particularly the Shropshire, Herefordshire and Worcestershire grassland. Ground ranges from free-draining sandstone soils to heavy clay that stays wet, and docks and thistles are persistent in long-established paddocks.',
    timing:
      'A long growing season means paddocks can need topping more than once. Spring work waits on the clay drying out; weed spraying is best caught while docks and thistles are growing strongly.',
  },
  'North West': {
    ground:
      'High rainfall and a lot of heavy, wet ground. Poaching around gateways, rushes in the low spots and compacted ground are the usual issues, and drainage does more good here than almost anything else.',
    timing:
      'A shorter working window than the south — the ground takes longer to dry in spring and gets wet again earlier in autumn. Getting topping and any ground work done in good conditions matters more than the exact date.',
  },
  'North East': {
    ground:
      'Colder and more exposed, with a later spring than the south. Grass starts growing several weeks behind the southern counties, and upland paddocks carry rushes and thin, acidic ground.',
    timing:
      'Everything runs a little later here. Turnout and the first topping come later in spring, and it pays to get autumn work done before the weather closes in.',
  },
  'Yorkshire and the Humber': {
    ground:
      'Genuinely varied ground: free-draining chalk on the Wolds, thin limestone in the Dales, and heavy, level clay through the Vale of York and the Humber lowlands. Neighbouring paddocks can need quite different treatment.',
    timing:
      'The lighter Wolds and Dales ground dries early and takes machinery well; the Vale clay needs more patience in spring. Topping runs through the summer either way.',
  },
  Wales: {
    ground:
      'Wet, and a lot of it upland. High rainfall, steep ground in places, and acidic soils that favour rushes and bracken over good grazing. Poaching and compaction are common on the lower, wetter fields.',
    timing:
      'The weather sets the schedule more than the calendar does. Take the dry spells when they come for topping and ground work, and expect rushes to need repeat attention rather than one pass.',
  },
  Scotland: {
    ground:
      'A shorter growing season and a later spring. Ground runs from good lowland grazing in the east to wet, acidic upland ground carrying rushes further north and west.',
    timing:
      'Later turnout and a tighter window for field work than further south — the summer months do most of the work, and autumn jobs are best not left late.',
  },
};

/**
 * County-level overrides, for counties whose ground is well enough known to
 * describe accurately and differs from the regional generalisation.
 *
 * These exist because neighbouring counties in the same region would otherwise
 * read almost identically — Hampshire and Surrey sharing one South East note is
 * exactly the thin-page problem. Only `ground` is usually worth overriding;
 * timing follows the region unless it genuinely differs.
 *
 * Counties without an entry fall back to their region note, which is correct
 * but generic. Adding a county here is the single best way to strengthen its
 * page — write only what's actually true of the ground there.
 */
export const COUNTY_NOTES: Record<string, Partial<RegionNote>> = {
  Hampshire: {
    ground:
      'Three quite different sorts of ground in one county: chalk downland that drains fast and burns off in a dry summer, heavier clay and greensand across the north, and the free-draining gravels and heath of the New Forest. Light chalk paddocks tend to go thin and let ragwort in; the northern clay poaches around gateways instead.',
  },
  Surrey: {
    ground:
      'Heavy London clay across the north of the county, and dry, sandy heathland over the greensand in the south-west — two opposite problems within a few miles. The clay holds wet well into spring and poaches badly; the sandy ground burns off early and grows a thin, weed-prone sward.',
  },
  Kent: {
    ground:
      'Chalk along the North Downs, heavy Weald clay through the middle of the county, and silt on Romney Marsh. Downland paddocks dry early and take machinery well, while the Wealden clay stays wet long after and rings and gateways poach through the winter.',
  },
  'West Sussex': {
    ground:
      'South Downs chalk in the south, Weald clay to the north, and brickearth on the coastal plain. The downland is free-draining and dries early; the clay to the north of the Downs is a much slower, wetter proposition in spring.',
  },
  'East Sussex': {
    ground:
      'Mostly High Weald clay — heavy, wet through the winter and slow to dry — with chalk downland running east towards Eastbourne. Rushes and poached gateways are common on the Wealden ground, and drainage often does more good than anything else.',
  },
  Berkshire: {
    ground:
      'Chalk downland in the west, river gravels along the Thames, and heavier London clay towards the east. The downs and gravels drain freely and travel early in spring; the eastern clay needs more patience.',
  },
  Oxfordshire: {
    ground:
      'Cotswold limestone brash in the west — thin, stony and free-draining — giving way to the heavy clay vales and Thames gravels further east. The brash dries out quickly in a hot summer, while the clay vale paddocks hold wet.',
  },
  Cornwall: {
    ground:
      'High rainfall, acidic soils over slate and granite, and a lot of steep valley ground. Exposure and salt wind hold growth back near the coast, and the wetter ground favours rushes over decent grazing.',
  },
  Devon: {
    ground:
      'Red sandstone soils through the middle and east of the county, heavy culm clay in the north-west, and thin acidic ground on the moorland fringes. The culm land is notoriously wet and slow-draining, while the red ground grows grass well and keeps growing late.',
  },
  Somerset: {
    ground:
      'The Levels are peat and clay that sit wet and flood in winter, the Mendips are thin limestone that dries fast, and the Blackdown fringes are heavy clay. Few counties ask for such different treatment field to field.',
  },
  Dorset: {
    ground:
      'Chalk downland across much of the county, the heavy clay of the Blackmore Vale to the north, and free-draining heath and gravel towards Poole. Downland dries early; Blackmore Vale clay is slow and poaches badly.',
  },
  Wiltshire: {
    ground:
      'Chalk over most of the county — Salisbury Plain and the Marlborough Downs — with heavier clay vales to the north-west. Chalk paddocks drain freely and can be worked early, but go thin and hungry in a dry summer.',
  },
  Gloucestershire: {
    ground:
      'Thin, stony Cotswold brash on the hills, heavy clay through the Severn Vale, and mixed ground in the Forest of Dean. The brash dries and burns off quickly, while the vale clay stays wet into spring.',
  },
  Norfolk: {
    ground:
      'The driest county in the country, and light with it — sandy Breckland in the west, silt and peat in the marshland, and boulder clay to the south. Thin, sandy swards stop growing in a dry summer and let weeds in.',
  },
  Suffolk: {
    ground:
      'Sandy, free-draining ground along the coastal Sandlings, and heavy boulder clay inland. The coastal land dries out badly in summer; the clay inland is the opposite problem in winter.',
  },
  Essex: {
    ground:
      'Heavy London and boulder clay across most of the county, with coastal marsh on the estuaries. Clay paddocks hold wet through the winter and poach around gateways, then bake hard and crack in a dry summer.',
  },
  Cambridgeshire: {
    ground:
      'Black fen peat in the north — level, fertile and prone to sitting wet — with chalk to the south-east and clay between. Fen ground travels poorly when wet and needs care with heavy machinery.',
  },
  Lincolnshire: {
    ground:
      'Silt and peat across the fens, limestone along the Cliff, chalk on the Wolds, and heavy clay in the vales. Wolds and Cliff ground drains freely; fen and clay paddocks need the ground to dry before anything heavy goes on.',
  },
  Cumbria: {
    ground:
      'Some of the highest rainfall in England, with acidic fell ground carrying rushes and bracken, and heavy clay in the valley bottoms. Poaching, compaction and rushes are the standing problems rather than runaway grass.',
  },
  Lancashire: {
    ground:
      'Peat mosses on the plain, heavy clay through much of the county, and wet, exposed ground on the Pennine edge. Drainage and compaction do more damage here than growth does.',
  },
  Cheshire: {
    ground:
      'Heavy boulder clay across the plain — good grass-growing country that poaches badly in a wet winter — with lighter sandy pockets. Grass gets away quickly in a mild summer, so paddocks often need topping more than once.',
  },
  Shropshire: {
    ground:
      'Mixed: free-draining sandstone soils in places, heavy clay in others, and hill ground to the west. Good grassland country overall, though the clay needs the spring to dry out before it will take machinery.',
  },
  Herefordshire: {
    ground:
      'Red sandstone soils that grow grass well, with heavier ground in the river valleys and low-lying land. A long growing season means paddocks can need topping more than once through the summer.',
  },
  'North Yorkshire': {
    ground:
      'About as varied as ground gets: limestone in the Dales, acidic peat and heather on the Moors, chalk on the Wolds, and sand and clay through the Vale of York. Two paddocks ten miles apart can need entirely different treatment.',
  },
  Northumberland: {
    ground:
      'Exposed and mostly late — acidic upland ground carrying rushes inland, lighter sandy land towards the coast. Spring growth starts several weeks behind the southern counties, and the autumn window closes early.',
  },
  Leicestershire: {
    ground:
      'Heavy Midlands clay over most of the county, much of it long-established ridge-and-furrow pasture. It holds wet into spring, poaches around gateways and rings, and bakes hard in a dry summer.',
  },
};

/**
 * The ground note for a county: its own if we have one, otherwise its
 * region's.
 */
export function paddockNote(county: string, region: string): RegionNote {
  const base = REGION_NOTES[region] ?? DEFAULT_NOTE;
  return { ...base, ...COUNTY_NOTES[county] };
}

