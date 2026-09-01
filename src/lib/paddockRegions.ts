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
  /* ── Scotland ────────────────────────────────────────────────────────
     Scotland is one region row covering 32 councils, so the region note alone
     left a third of the site's county pages sharing a single paragraph. These
     split it along the lines the ground actually follows: the north-east
     arable belt, the hills and islands, the southern grazing counties, and the
     urban central belt. Councils that genuinely share a landscape share a
     note — that is honest, where inventing 32 distinct ones would not be. */
  Aberdeenshire: {
    ground:
      'Scotland’s main arable county, with good, workable ground along the coast and up the Don and Deveron, rising to thin, exposed hill grazing inland. Ground is kind by Scottish standards but the season is short.',
    timing:
      'Everything runs later here than in England — spring work waits for the ground to warm, and autumn overseeding needs to be in by early September to establish before the cold.',
  },
  Moray: {
    ground:
      'One of the drier, sunnier corners of Scotland. Light, free-draining land along the coastal plain and the Laich of Moray, with heavier and thinner ground climbing towards the Cairngorm foothills.',
    timing:
      'The relatively dry climate gives a better hay-making and ground-working window than most of Scotland, but the season is still short at both ends.',
  },
  Angus: {
    ground:
      'Rich, workable Strathmore ground running between the Sidlaw Hills and the Angus glens — some of the best land in Scotland — with genuinely upland grazing at the head of the glens.',
  },
  'Perth and Kinross': {
    ground:
      'A county of two halves: the fertile Strathearn and Strathmore straths carry good grass, while the Highland ground to the north and west is thin, wet and exposed.',
    timing:
      'The straths work much like lowland England, a few weeks later. The hill ground has a markedly shorter window, so plan autumn work early.',
  },
  Fife: {
    ground:
      'Mixed arable and grazing on generally kind, workable ground, with a mild coastal climate and less rainfall than the west. Among the easier counties in Scotland to get machinery onto.',
  },
  Stirling: {
    ground:
      'Carse of Stirling clay on the flat — heavy, fertile and slow to dry — with the Trossachs and the Campsies rising sharply behind into thin, wet hill grazing.',
  },
  'Scottish Borders': {
    ground:
      'Classic stock-rearing country. Sheltered valley grazing along the Tweed and its tributaries, with extensive hill ground above. Good grass where the valleys run, thin and acid on the tops.',
    timing:
      'A reliable but short season. Topping through the summer and hedge or ground work in early autumn, before the hills turn wet.',
  },
  'Dumfries and Galloway': {
    ground:
      'Mild, wet and very grassy — a long growing season by Scottish standards and a lot of heavy ground that poaches badly in winter. Rushes are the usual sign that drainage has been let go.',
    timing:
      'Grass grows for longer here than almost anywhere else in Scotland, so paddocks often want more than one cut. Wait for the ground to carry before harrowing or rolling.',
  },
  'South Ayrshire': {
    ground:
      'Mild coastal dairy and grazing country on generally heavy ground, with a long growing season and high winter rainfall.',
  },
  'East Ayrshire': {
    ground:
      'Wet, heavy ground rising to moorland in the east. Strong grass growth and persistent winter poaching, with rush encroachment common on neglected grazing.',
  },
  'North Ayrshire': {
    ground:
      'Coastal lowland grazing with a mild, wet climate, backed by moorland. Grass grows well; the ground stays soft for much of the winter.',
  },
  Highland: {
    ground:
      'Vast, thin, acid and wet — genuinely upland and coastal ground with very high rainfall in the west and a short growing season everywhere. Bracken and rush encroachment are the common problems on ground that has been left.',
    timing:
      'The tightest season on the network at both ends, and long distances between holdings. Book early, and expect a contractor to want to group work into one visit.',
  },
  'Argyll and Bute': {
    ground:
      'Sea-lochs, islands and steep ground with very high rainfall. Grazing is thin and largely rough, and access — including ferry crossings — often decides what is practical before ground conditions do.',
    timing:
      'Say up front if the land is on an island. It changes the whole shape of a job, and the contractors who can take it on.',
  },
  'Na h-Eileanan Siar': {
    ground:
      'Machair and peat: light, shell-sand grazing along the Atlantic coast and deep, wet blanket peat inland. Exposure and salt wind matter as much as soil type.',
    timing:
      'Island logistics dominate. Give as much notice as you can — machinery availability, not the season, is usually the limiting factor.',
  },
  'Orkney Islands': {
    ground:
      'Fertile, well-farmed ground by northern standards, but relentlessly exposed — wind, not cold, sets the limits on what grows and when.',
    timing:
      'A short, wind-shaped season and a small pool of local machinery. Book well ahead.',
  },
  'Shetland Islands': {
    ground:
      'Thin, peaty, acid ground with severe exposure and a very short growing season. Grazing is mostly rough hill and scattald rather than improved pasture.',
    timing:
      'The tightest window anywhere on the network, and everything depends on local machinery. Plan a long way ahead.',
  },
  'East Lothian': {
    ground:
      'The driest, sunniest arable ground in Scotland — light, free-draining coastal land that works early and burns off in a dry summer.',
    timing:
      'Ground works earlier here than anywhere else in Scotland. Spring harrowing and rolling can start well before the rest of the country.',
  },
  Midlothian: {
    ground:
      'Good lowland ground on the coastal plain giving way to the Pentlands and Moorfoots — kind where it is low, thin and wet where it climbs.',
  },
  'West Lothian': {
    ground:
      'Mixed lowland farming and green-belt grazing between the towns, on generally heavy ground with a good deal of former industrial land in the mix.',
  },
  'South Lanarkshire': {
    ground:
      'Clyde valley farmland in the north giving way to extensive, wet upland grazing across the southern moors — one of the bigger contrasts of any Scottish council.',
  },
  'North Lanarkshire': {
    ground:
      'Urban-fringe and green-belt grazing on heavy, often wet ground, in small parcels between the towns.',
    timing:
      'Access and field size are usually the deciding factors here rather than ground conditions — describe the gateway and the route in.',
  },
  Falkirk: {
    ground:
      'Carse clay along the Forth — heavy, fertile and slow to dry — with urban-fringe paddocks between the towns.',
  },
  Clackmannanshire: {
    ground:
      'A small county pinned between the Forth carse and the Ochil Hills: heavy flat ground below, steep thin grazing above.',
  },
  Renfrewshire: {
    ground:
      'Wet, heavy ground rising quickly to moorland, with high rainfall and a lot of small green-belt paddocks close to the towns.',
  },
  'East Renfrewshire': {
    ground:
      'Green-belt grazing on heavy, wet ground climbing towards the Fenwick moors — small fields, high rainfall, and a lot of horses for the acreage.',
  },
  'East Dunbartonshire': {
    ground:
      'Green-belt paddocks on heavy Kelvin valley ground with the Campsie Fells behind — wet in winter, small parcels, tight access.',
  },
  'West Dunbartonshire': {
    ground:
      'Lowland ground along the Clyde and Leven rising sharply to the Kilpatrick Hills, with high rainfall and small field parcels.',
  },
  Inverclyde: {
    ground:
      'Steep, wet ground above the Clyde with some of the highest rainfall in lowland Scotland. Grazing is mostly small, sloping and rough.',
  },
  'Glasgow City': {
    ground:
      'Urban-fringe and green-belt grazing on the edges of the city — heavy, wet ground in small parcels, generally carrying a lot of horses for the acreage.',
    timing:
      'Overgrazing, poaching and access are the usual problems rather than anything seasonal. Describe the route in and the gateway width when you send the job through.',
  },
  'City of Edinburgh': {
    ground:
      'Green-belt paddocks around the city edge and out towards the Pentlands — mostly kind lowland ground, in small parcels with restricted access.',
    timing:
      'Field size and access decide which machinery can come. Say what the approach looks like and the contractor will tell you what fits.',
  },
  'Dundee City': {
    ground:
      'A small urban authority with green-belt grazing on the Sidlaw slopes above the city — sloping, mostly kind ground in small parcels.',
  },
  'Aberdeen City': {
    ground:
      'Green-belt and urban-fringe grazing on the edge of the city, on the same workable north-east ground as the county around it, in much smaller parcels.',
  },

  /* ── South East ──────────────────────────────────────────────────── */
  Buckinghamshire: {
    ground:
      'Chalk on the Chilterns in the south, heavier clay across the Vale of Aylesbury to the north. The two behave quite differently in a wet winter — the chalk paddocks drain away, the Vale ground sits wet and poaches around gateways.',
  },
  'Isle of Wight': {
    ground:
      'A chalk spine running east to west with heavier greensand and clay either side, and a mild, exposed maritime climate that keeps the grass moving later into the autumn than the mainland.',
    timing:
      'The long, mild season means paddocks often want a later cut than they would inland. Contractors and machinery are island-based, so booking ahead matters more here than almost anywhere.',
  },
  /* ── South West ──────────────────────────────────────────────────── */
  Bristol: {
    ground:
      'Urban-fringe grazing on the edges of the city and out towards the Avon valley — small paddocks, heavy ground, and a lot of horses in a small area. Access for machinery is usually the limiting factor rather than the work itself.',
    timing:
      'Small, tight paddocks suit compact machinery. Say what the gateway and the approach look like when you describe the job — that decides who can get in more often than the acreage does.',
  },
  /* ── East of England ─────────────────────────────────────────────── */
  Bedfordshire: {
    ground:
      'Heavy Oxford clay across much of the county with lighter greensand running through the middle. The clay holds wet and poaches, the greensand burns off fast in a dry summer — often on the same holding.',
  },
  Hertfordshire: {
    ground:
      'Chalk under boulder clay, so paddocks drain unevenly — free-draining in places, sitting wet in others. A great deal of small-paddock horse keeping close to the London fringe.',
    timing:
      'Small paddocks and restricted access are the norm here rather than the exception, so machinery size matters. Harrowing and rolling suit the spring once the clay caps have broken down.',
  },
  /* ── East Midlands ───────────────────────────────────────────────── */
  Derbyshire: {
    ground:
      'Two counties in one: limestone and gritstone grazing in the Peak, where the ground is thin, stony and exposed, and heavier lowland clay in the south towards the Trent. Rushes and poaching are common on the upland fringes.',
    timing:
      'Upland paddocks run a shorter season — later to start in spring, earlier to stop in autumn — so the window for topping and reseeding is tighter than in the south of the county.',
  },
  Nottinghamshire: {
    ground:
      'Light Sherwood sandstone across the north and west, heavier clay towards the Trent and the east. The sandy ground is easy to work but drops fertility quickly and burns off in a dry summer.',
  },
  Northamptonshire: {
    ground:
      'Heavy ironstone and clay across most of the county — good grass-growing ground that holds wet, poaches around gateways and rewards attention to drainage.',
  },
  Rutland: {
    ground:
      'Limestone and clay in a small, well-farmed county with a lot of horse keeping for its size. Ground is generally kind, though the clay areas hold wet through the winter like the rest of the east Midlands.',
  },
  /* ── West Midlands ───────────────────────────────────────────────── */
  Staffordshire: {
    ground:
      'Sandy, free-draining ground across the Cannock and Trent valley areas, heavier clay in the north and towards the Moorlands, with genuinely upland grazing on the Peak fringe.',
  },
  Warwickshire: {
    ground:
      'Predominantly heavy Midlands clay — strong grass-growing ground that sits wet through the winter and poaches badly around gateways and field shelters.',
  },
  Worcestershire: {
    ground:
      'Fertile red marl and river-valley ground along the Severn and the Avon, with lighter land towards the Malverns. Good growing country, which means paddocks get away from you quickly if they aren’t topped.',
  },
  'West Midlands': {
    ground:
      'Urban-fringe grazing between the towns — green-belt paddocks, small acreages and a lot of horses. Ground is mostly heavy Midlands clay and much of it has seen hard use.',
    timing:
      'Access is usually the constraint here rather than ground conditions. Describe the gateway and the route in, and the contractor will tell you what will fit.',
  },
  /* ── North West ──────────────────────────────────────────────────── */
  'Greater Manchester': {
    ground:
      'Green-belt and moorland-fringe grazing around the conurbation — heavy, wet ground with a high water table in the mosslands and thinner peaty ground as you climb towards the Pennines.',
    timing:
      'Wet ground and a short dry window mean timing matters more than elsewhere. Get harrowing and rolling done when the ground carries, not by the calendar.',
  },
  Merseyside: {
    ground:
      'Flat, sandy coastal ground in the north and heavier mossland inland — free-draining where the sand runs, wet and peaty where it doesn’t, sometimes within the same field.',
  },
  /* ── North East ──────────────────────────────────────────────────── */
  'County Durham': {
    ground:
      'Pennine dale grazing in the west, better lowland ground towards the coastal plain in the east. The upland end is thin, wet and exposed; the lowland end grows a proper crop of grass.',
    timing:
      'A shorter season than the south — spring work starts later and autumn overseeding needs to be in earlier to establish before the cold.',
  },
  'Tyne and Wear': {
    ground:
      'Urban-fringe and river-valley grazing, mostly heavy ground that holds wet, in small parcels between the towns.',
    timing:
      'Small fields and tight access make machinery size the first question. Describe the approach and gateway when you send the job through.',
  },
  /* ── Yorkshire and the Humber ────────────────────────────────────── */
  'East Riding of Yorkshire': {
    ground:
      'Chalk Wolds that drain freely and burn off in a dry summer, and low-lying Holderness and Vale of York clay that holds wet all winter. Two very different jobs depending on which side of the county you’re on.',
  },
  'South Yorkshire': {
    ground:
      'Coal-measure clays and urban-fringe grazing across most of the county, with lighter magnesian limestone ground running north to south through the middle. A lot of small, hard-used paddocks.',
  },
  'West Yorkshire': {
    ground:
      'Pennine-fringe grazing — thin, acid, often wet ground on the higher land, heavier valley clay below. Rushes are a common sign that drainage wants attention.',
    timing:
      'Higher ground runs a noticeably shorter season. Topping and overseeding windows are tighter than in the Vale, so booking early matters.',
  },
  /* ── London ──────────────────────────────────────────────────────── */
  'Greater London': {
    ground:
      'Green-belt and urban-fringe paddocks around the edges of the city — London clay for the most part, heavy and slow to dry, in small parcels carrying a lot of horses.',
    timing:
      'Overgrazing and poaching are the usual problems rather than anything the weather does. Access decides which machinery can come, so describe the route in and the gateway width.',
  },
  /* ── Wales ───────────────────────────────────────────────────────── */
  Clwyd: {
    ground:
      'Coastal lowland and the Vale of Clwyd grow good grass on decent ground; the Berwyn and Clwydian hills behind are thin, acid and wet. Rushes are common wherever drainage has been let go.',
  },
  Dyfed: {
    ground:
      'High rainfall on largely heavy ground — strong grass growth and a long season, with poaching around gateways and rings a near-constant winter problem. Rush infestation is the classic sign of failed drainage here.',
    timing:
      'Grass gets away quickly, so more than one topping a season is normal. Wait for the ground to carry before harrowing or rolling — soft ground and machinery is how ruts start.',
  },
  Gwent: {
    ground:
      'Good lowland grazing along the Usk and Wye valleys and across the Gwent Levels, rising to thinner, wetter valley-head ground in the north and west.',
  },
  Gwynedd: {
    ground:
      'Genuinely upland country — thin, acid, stony ground with very high rainfall, and a short growing season. Access for machinery is often the deciding factor rather than the state of the grass.',
    timing:
      'A tight season at both ends. Get autumn work in early, and expect the ground to be carrying machinery for fewer weeks of the year than it would further east.',
  },
  Powys: {
    ground:
      'Wales’s largest county and mostly upland — thin acid soils, high rainfall and long distances between holdings. Rush and bracken encroachment on neglected grazing is the common problem.',
    timing:
      'Distances matter here as much as conditions: contractors travel further, so grouping work into one visit is usually worth doing.',
  },
  'Mid Glamorgan': {
    ground:
      'Valley grazing on thin, wet, acid ground with a lot of former common land, plus better lowland paddocks towards the coastal plain.',
  },
  'South Glamorgan': {
    ground:
      'The Vale of Glamorgan is some of the best grazing ground in Wales — kinder soils, lower rainfall and a longer season than the valleys immediately north of it.',
  },
  'West Glamorgan': {
    ground:
      'Very high rainfall on largely heavy ground, with Gower’s lighter coastal grazing as the exception. Poaching and rushes are the usual winter problems.',
  },

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

