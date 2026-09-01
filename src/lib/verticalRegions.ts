/**
 * Per-area copy for the hay and tractor-hire county pages.
 *
 * Why this exists: those pages were the vertical config with the county name
 * substituted in — 148 indexable URLs whose only difference was a proper noun.
 * That is the shape Google's guidance calls a doorway page, and it was the
 * biggest structural SEO risk on the site. The paddock county pages already
 * avoided it via `paddockRegions.ts`; this is the same idea for the verticals.
 *
 * The notes are deliberately about things that are actually true of an area —
 * what the farming there produces, what the ground and the season do to it,
 * what that means for someone buying forage or booking a tractor. No invented
 * prices, no invented supplier counts: live coverage numbers already come from
 * the database, and anything specific enough to go stale doesn't belong here.
 *
 * Resolution is region first, then a county override, matching paddockNote().
 */

export type VerticalNote = {
  /** What the area produces / what it's like — the "why here" paragraph. */
  supply: string;
  /** What that means in practice for the reader. */
  practical: string;
};

/* ── Hay, straw & haylage ─────────────────────────────────────────────── */

const HAY_DEFAULT: VerticalNote = {
  supply:
    'Forage supply changes a good deal from farm to farm — some ground makes good meadow hay in a dry year, some is only ever reliable for haylage, and straw depends on how much cereal is grown nearby.',
  practical:
    'Tell us the forage type, the bale size you can handle and whether you need it delivered or can collect, and we’ll put the enquiry in front of producers who have it.',
};

const HAY_REGIONS: Record<string, VerticalNote> = {
  'South East': {
    supply:
      'The South East makes a lot of horse hay. It has the mixed farming to produce it — chalk downland and light land that dries early enough for a clean crop — and the biggest concentration of liveries and private paddocks in the country to buy it. Barley and wheat straw come off the same arable ground from harvest onwards.',
    practical:
      'Small conventional bales are easier to find here than in most regions, which matters if you’re hand-carrying into a stable rather than tipping big bales with a loader. Demand is heavy from late summer, so buying a winter’s worth early usually beats buying it in February.',
  },
  'South West': {
    supply:
      'This is wetter, grassier country, and it shows in what’s available: haylage and silage are the reliable crops, and good dry hay is a genuinely weather-dependent harvest — plentiful after a settled June, scarce after a wet one. Straw travels in from the eastern arable counties rather than being grown at scale here.',
    practical:
      'If you’re set on dry hay, ask early and be flexible on cut and bale size. Haylage suits harder-keeping horses and is usually the better-value local option, and because straw is largely imported into the region, delivery distance is a real part of what it costs.',
  },
  'East of England': {
    supply:
      'The arable heartland. Barley and wheat straw are abundant here in a way they aren’t anywhere else in the country, and they come mostly in big square bales straight off the combine trail. Grass hay is the scarcer crop — there’s simply less permanent pasture competing with cereals for the acreage.',
    practical:
      'If you want straw, this is the easiest region in Britain to buy it, and buying at harvest is materially cheaper than buying out of a shed in spring. For hay you may be looking at meadow hay off headlands and set-aside grass, so agree the type before you commit to a load.',
  },
  'East Midlands': {
    supply:
      'Mixed country: heavy arable across the Lincolnshire and Nottinghamshire ground gives good straw supply, while the grazing land in the west and around the Wolds makes meadow hay and haylage. Both are usually available without going far.',
    practical:
      'Being mixed-farming country, most producers here can quote for hay and straw together, which is worth asking about — one delivery beats two. Big square bales dominate, so check your access and how you’ll handle them before ordering.',
  },
  'West Midlands': {
    supply:
      'Grassland farming with arable alongside it — Herefordshire, Shropshire and Worcestershire all carry a lot of stock, so hay and haylage are made properly and in quantity, with straw available from the cereal ground further east.',
    practical:
      'A good region for buying small quantities: the mix of smaller livestock farms means more producers who’ll sell a trailer-load rather than only a full lorry. Say what you can handle and we’ll match accordingly.',
  },
  'North West': {
    supply:
      'High rainfall and a lot of upland grazing make this haylage country. Cumbria and the Lancashire fell edges get a shorter, less certain hay-making window than the south, so wrapped forage is what most producers make and most buyers use.',
    practical:
      'Haylage is the sensible default here rather than a compromise — it’s made to suit the weather. If you specifically need dry hay, expect it to have travelled, and order well ahead of winter rather than into it.',
  },
  'North East': {
    supply:
      'Upland and coastal-plain farming side by side. The hill ground carries stock and makes haylage; the better arable land along the coast and down towards the Tees produces cereal straw. The season starts later and finishes earlier than it does in the south.',
    practical:
      'The narrower window means forage is worth committing to early — supply is real but it isn’t endless, and a late buyer in a wet year is competing with everyone else. Straw from the coastal ground travels inland easily.',
  },
  'Yorkshire and the Humber': {
    supply:
      'Two quite different halves. The Wolds and the Humber ground are serious arable country with straw to match, while the Dales and the Moors are stock-rearing land making hay and haylage. Most of the region is within reach of both.',
    practical:
      'Worth being specific about where you are: a yard on the Wolds and a yard in the Dales have very different local supply. Give us the postcode and the enquiry goes to producers on the right side of that divide.',
  },
  Wales: {
    supply:
      'Livestock country with the rainfall to match. Grass grows well and haylage is made in quantity; dry hay is harder to guarantee, particularly in the west and the uplands, and the best of it usually comes off the drier eastern edge and the coastal lowlands.',
    practical:
      'Haylage is the dependable local buy. If you need dry hay, ask early and don’t be surprised if it comes from over the border — and factor the run into what you pay, because in this terrain distance costs more than the mileage suggests.',
  },
  Scotland: {
    supply:
      'A later, shorter season than anywhere further south, which pushes most forage towards silage and haylage. The eastern arable belt — Aberdeenshire, Angus, the Lothians and the Borders — is where the cereal straw comes from, and there’s a good deal of it.',
    practical:
      'Cuts are later here, so don’t judge availability by a southern calendar. Straw from the east travels well across the central belt; forage for the islands and the north-west Highlands needs more notice and the haulage priced in from the start.',
  },
  London: {
    supply:
      'Nothing is grown at scale inside the M25, but the liveries and riding schools around the green belt buy a lot of forage, and it comes in from the home counties — Kent, Surrey, Essex, Hertfordshire and Buckinghamshire all supply into London.',
    practical:
      'This is a delivery question more than a growing one. Access is usually the binding constraint: say what size vehicle can actually reach your yard, and whether you need small bales rather than big ones, and we’ll match a supplier who can get to you.',
  },
};

const HAY_COUNTIES: Record<string, Partial<VerticalNote>> = {
  /* ── Scotland ────────────────────────────────────────────────────────
     One region row covers 32 councils, which left a third of the vertical
     pages sharing a paragraph. Split along the lines forage supply actually
     follows: the eastern arable belt, the straths, the wet south-west, the
     central belt, and the hills and islands. */
  Aberdeenshire: {
    supply:
      'Scotland’s main cereal county and the source of a great deal of its straw — barley especially, in quantity from harvest onwards. Grass forage is made later here than in the south and mostly wrapped rather than dried.',
  },
  'Aberdeen City': {
    supply:
      'Straw and forage come in from the Aberdeenshire arable ground immediately around the city, so supply is good and the run is short — it is a delivery-access question more than a sourcing one.',
  },
  Moray: {
    supply:
      'One of the drier, sunnier corners of Scotland, which makes it one of the few northern areas where dry hay is a realistic ask rather than a gamble. Barley straw comes off the Laich in quantity.',
  },
  Angus: {
    supply:
      'Strathmore is serious arable ground — seed potatoes, cereals and soft fruit — so straw is plentiful, and the glens behind carry the stock that makes the haylage.',
  },
  'Dundee City': {
    supply:
      'Supply comes off the Angus and Carse of Gowrie ground on the doorstep: straw from the arable, haylage from the glens. Access rather than availability is the usual constraint.',
  },
  'Perth and Kinross': {
    supply:
      'The straths grow cereals and good grass; the Highland ground to the north makes wrapped forage on a shorter season. Both are usually within reach without going far.',
  },
  Fife: {
    supply:
      'Mixed arable and grazing on kind ground with a drier coastal climate — one of the more reliable places in Scotland for both straw and decent dry hay.',
  },
  Stirling: {
    supply:
      'Carse ground on the flat grows heavy crops and good grass; the Trossachs behind make wrapped forage. Straw comes across from the Forth valley arable easily enough.',
  },
  Clackmannanshire: {
    supply:
      'Small county, but sat between the Forth carse arable and the Ochil grazing — both straw and haylage are a short run away.',
  },
  'East Lothian': {
    supply:
      'The driest arable ground in Scotland. Straw is abundant and cheap at harvest, and this is about the best chance in the country of a properly dry, well-made hay crop.',
  },
  Midlothian: {
    supply:
      'Lothian arable on the coastal plain gives straw, and the Pentland and Moorfoot grazing behind it makes wrapped forage. Both are close by.',
  },
  'West Lothian': {
    supply:
      'Mixed lowland farming with arable ground to the east and grazing to the south, so straw and haylage are both available without a long haul.',
  },
  'City of Edinburgh': {
    supply:
      'Nothing is grown at scale within the city, but the East Lothian arable belt and the Pentland grazing are immediately outside it — supply is genuinely local by Scottish standards.',
    practical:
      'This is an access question. Say what size vehicle can reach the yard and whether you need small bales rather than big ones.',
  },
  'Scottish Borders': {
    supply:
      'Stock-rearing country with real arable along the Tweed — so hay and haylage off the valley and hill grazing, and cereal straw from the lower ground, often from the same farms.',
  },
  'Dumfries and Galloway': {
    supply:
      'Mild, wet dairy and stock country with a long growing season. Grass forage is made in quantity, almost all of it wrapped; straw largely travels in from the east.',
  },
  'South Ayrshire': {
    supply:
      'Dairy and grazing country with a mild, wet climate. Haylage and silage are what gets made here; dry hay is a good-summer bonus rather than a staple.',
  },
  'East Ayrshire': {
    supply:
      'Wet, heavy grazing ground rising to moorland — strong grass growth and wrapped forage in quantity, with straw brought in from the east.',
  },
  'North Ayrshire': {
    supply:
      'Mild coastal grazing with high winter rainfall. Wrapped forage is the local staple, and the islands add a haulage question to any order.',
  },
  'South Lanarkshire': {
    supply:
      'Clyde valley farmland in the north and extensive upland grazing to the south, so wrapped forage is made in quantity across the moors with better ground nearer the river.',
  },
  'North Lanarkshire': {
    supply:
      'Green-belt grazing between the towns rather than production at scale — most forage comes in from the surrounding Lanarkshire and Stirlingshire farms.',
  },
  Falkirk: {
    supply:
      'Carse of Forth ground is fertile and productive, so both straw and grass forage are available close by, with the central-belt road network making delivery straightforward.',
  },
  'Glasgow City': {
    supply:
      'No production within the city; forage comes in from Lanarkshire, Renfrewshire and Stirlingshire, all within a short run.',
    practical:
      'Access decides this one. Tell us the vehicle size that can reach you and whether you need small bales, and we’ll match a supplier who can actually deliver.',
  },
  Renfrewshire: {
    supply:
      'Wet ground rising to moorland, so wrapped forage rather than dry hay, with straw coming across the central belt from the east.',
  },
  'East Renfrewshire': {
    supply:
      'Green-belt grazing on wet, heavy ground below the Fenwick moors. Haylage is the local product; straw is brought in.',
  },
  'East Dunbartonshire': {
    supply:
      'Kelvin valley grazing with the Campsies behind — wrapped forage locally, straw from the Forth valley arable.',
  },
  'West Dunbartonshire': {
    supply:
      'A small area of lowland grazing with high rainfall. Most forage is wrapped, and quantities are usually brought in from Stirlingshire or Ayrshire.',
  },
  Inverclyde: {
    supply:
      'Very high rainfall on steep ground, so little is made locally — forage generally travels in from Renfrewshire and Ayrshire.',
  },
  'Argyll and Bute': {
    supply:
      'Wet, steep and scattered across sea-lochs and islands. Wrapped forage is what gets made; anything else, straw especially, has to travel, and often by ferry.',
    practical:
      'Say up front if the delivery is to an island. It changes the haulage entirely and needs more notice than a mainland order.',
  },
  'Na h-Eileanan Siar': {
    supply:
      'Machair grazing and croft-scale forage making. Quantities are small and locally spoken for, so most bought-in forage and all straw comes over on the boat.',
    practical:
      'Order well ahead and expect haulage to be a real part of the cost. Ferry timetables set the delivery window, not the supplier.',
  },
  'Orkney Islands': {
    supply:
      'Well-farmed and productive for its latitude — grass forage is made in quantity, though wind and a short season push it towards wrapping. Straw comes over from the mainland.',
    practical:
      'Local forage is genuinely available; straw is the thing that needs planning. Give as much notice as you can.',
  },
  'Shetland Islands': {
    supply:
      'A very short season on thin, exposed ground. What forage is made is croft-scale and usually wrapped; most bought-in forage and all straw arrives by boat.',
    practical:
      'Plan a long way ahead and price the haulage in from the start — it is the dominant cost this far north.',
  },

  Hampshire: {
    supply:
      'Chalk downland that dries early and a very large horse population in the same place — Hampshire both makes good meadow hay and consumes an enormous amount of it. Straw comes off the arable ground across the north and east of the county.',
  },
  Norfolk: {
    supply:
      'About as arable as Britain gets. Barley and wheat straw are plentiful and cheap at harvest, and much of the country’s traded straw starts here. Grass hay is the harder ask — pasture competes with cereals for every acre.',
  },
  Suffolk: {
    supply:
      'Heavy cereal ground with straw in quantity from harvest onwards, and grass hay mainly off river valley meadows and the lighter Sandlings ground rather than at scale.',
  },
  Lincolnshire: {
    supply:
      'A huge arable county — straw is abundant and usually in big square bales off the combine trail. Hay comes off the Wolds grazing and the fen-edge grassland rather than the arable heart of it.',
  },
  Cumbria: {
    supply:
      'Fell and valley grazing with high rainfall, so haylage is the staple and dry hay is a good-summer crop rather than a given. Quantity is not the problem; a settled hay-making week is.',
  },
  Devon: {
    supply:
      'Grass grows for a long season here and there’s plenty of it, but it’s wet country — haylage and silage are what most farms make. Dry hay happens, and it’s worth having, but it isn’t something to count on in a poor June.',
  },
  Cornwall: {
    supply:
      'Mild, wet and grassy, with a long growing season and a short reliable drying window. Haylage is the practical local forage; straw is largely brought in, so delivery distance is a real part of the price this far west.',
  },
  Kent: {
    supply:
      'Mixed farming with real arable acreage behind it, so both hay and straw are made in the county, and it supplies a lot of the London and north-Kent livery market as well as its own.',
  },
  'North Yorkshire': {
    supply:
      'The largest county in England and farmed very differently across it — Dales stock farms making hay and haylage at one end, Vale of York and Wolds arable producing straw at the other.',
  },
  Powys: {
    supply:
      'Upland livestock country on a large scale. Haylage is made in quantity and made well; dry hay is a drier-summer crop, and much of the straw used here comes in from the English border counties.',
  },
  Highland: {
    supply:
      'A very short season and a lot of ground between farms. Forage is made late, mostly wrapped, and haulage is a genuine part of any quote — worth ordering with more notice than you would further south.',
    practical:
      'Distances here are the main constraint, not availability. Give us the postcode early and we’ll find someone who can realistically reach you rather than someone who looks close on a map.',
  },
};

/* ── Tractor & operator hire ──────────────────────────────────────────── */

const TRACTOR_DEFAULT: VerticalNote = {
  supply:
    'Most areas have farms and contractors with a tractor worth turning out for an event — a tidy modern machine, a restored vintage one, or a tractor and trailer set up to carry people safely.',
  practical:
    'The details that decide whether a booking works are the date, the distance between where the tractor is kept and where it’s needed, and how much road is involved. Tell us those three and we can tell you quickly whether it’s straightforward.',
};

const TRACTOR_REGIONS: Record<string, VerticalNote> = {
  'South East': {
    supply:
      'Barn and farm weddings are common right across the South East, and a lot of working farms here have diversified into events — which means tractors that are already used to turning out smartly and operators who’ve done it before.',
    practical:
      'The constraint here is usually traffic and road distance rather than finding a machine. A tractor is slow on the road, so a venue within a few miles of where it’s kept is much easier to arrange — and cheaper — than one across a county.',
  },
  'South West': {
    supply:
      'Wedding-barn country, and vintage tractors are genuinely well represented — the region has a strong rally and restoration scene, so a period Fordson or Massey for photographs is a realistic ask rather than a long shot.',
    practical:
      'Lanes are narrow and often steep, which matters more than mileage. If the venue is down a single-track lane, say so early: it changes which machine and trailer combination will actually get there.',
  },
  'East of England': {
    supply:
      'Big arable farms mean big, well-kept modern tractors, and plenty of farms with barns converted for weddings and events. There are working vintage machines here too, kept by the same families who farm the ground.',
    practical:
      'Flat, open country and decent road links make this one of the easier regions to move a tractor and trailer around in. Longer runs are more practical here than in hill country.',
  },
  'East Midlands': {
    supply:
      'Mixed farming across the region, with both modern machinery and a strong vintage scene — the county shows and ploughing matches keep a lot of older tractors in working order.',
    practical:
      'Most of the region is within easy reach of a suitable machine. Give us the venue postcode and the date and we’ll work outwards from there.',
  },
  'West Midlands': {
    supply:
      'Herefordshire, Shropshire and Worcestershire are full of farms that host weddings and events, so tractors here are often already part of the offer rather than something that has to be brought in.',
    practical:
      'If the venue is itself a farm, it’s worth asking whether they have a machine on site before hiring one in — and if they don’t, a neighbouring farm is usually a short run away.',
  },
  'North West': {
    supply:
      'Farms across Lancashire, Cheshire and the Cumbrian valleys, plus a well-supported vintage scene around the county shows. Cheshire in particular has a lot of accessible rural venues.',
    practical:
      'Fell and valley roads make distance count for more than the mileage suggests. Keep the journey short where you can, and allow more time than a car journey would need.',
  },
  'North East': {
    supply:
      'Working farms across Northumberland and County Durham, with rural venues scattered widely rather than clustered. Vintage machines turn out for the shows and are often available for events too.',
    practical:
      'Venues are further apart here than in most regions, so the run to site is usually the main cost. Booking a machine kept near the venue makes a real difference.',
  },
  'Yorkshire and the Humber': {
    supply:
      'A lot of farm and barn venues across the Dales, the Wolds and the Vale of York, and one of the strongest vintage tractor scenes in the country behind them.',
    practical:
      'Dales lanes and gradients are the thing to flag; the Vale and the Wolds are straightforward. Tell us where the venue actually is and we’ll match a machine that suits the road to it.',
  },
  Wales: {
    supply:
      'Livestock farms throughout, many with restored tractors, and a growing number of rural wedding venues in converted farm buildings.',
    practical:
      'Terrain is the deciding factor. Narrow lanes, gradients and gateways matter more than distance on a map — describe the approach to the venue and we’ll match something that will make it comfortably.',
  },
  Scotland: {
    supply:
      'Farms, estates and country-house venues throughout, with plenty of well-kept working machinery behind them and an active vintage and rally scene keeping older tractors on the road.',
    practical:
      'Distances are longer here, particularly in the Highlands and islands, so the run to site is worth pricing in from the start. Give us as much notice as you can for anything off the main routes.',
  },
  London: {
    supply:
      'Tractors come in from the surrounding counties rather than being kept in London itself — Essex, Kent, Surrey, Hertfordshire and Buckinghamshire are all within a workable run of most London venues.',
    practical:
      'Access and road restrictions decide this one, not availability. Tell us the venue, and whether the tractor needs to travel under its own power or can come in on a low-loader, and we’ll work out what’s realistic.',
  },
};

const TRACTOR_COUNTIES: Record<string, Partial<VerticalNote>> = {
  /* ── Scotland: sub-areas ─────────────────────────────────────────── */
  Aberdeenshire: {
    supply:
      'Big arable farms with big, well-kept machinery, plus one of the strongest vintage tractor scenes in Scotland behind the north-east shows and rallies.',
  },
  'Aberdeen City': {
    supply:
      'Machines come in from the Aberdeenshire farms immediately around the city — a short run to most venues.',
  },
  Moray: {
    supply:
      'Farms and distillery estates across the Laich, with a well-supported local show and rally circuit keeping vintage machines on the road.',
  },
  Angus: {
    supply:
      'Strathmore farms with modern kit and a strong vintage following, and castle and country-house venues through the glens to take it to.',
  },
  'Dundee City': {
    supply:
      'Tractors come from the Carse of Gowrie and the Angus farms just outside the city, both within an easy run.',
  },
  'Perth and Kinross': {
    supply:
      'Estates, castles and country-house venues in quantity, with farms throughout the straths keeping the machinery that serves them.',
  },
  Fife: {
    supply:
      'Farm and barn venues across the Howe of Fife and the East Neuk, with plenty of working machinery and an active vintage scene.',
  },
  Stirling: {
    supply:
      'Castle and country-house venues with working farms on the carse below them — good availability and short runs to most sites.',
  },
  Clackmannanshire: {
    supply:
      'Small county with farms on the carse and the Ochils behind; machines from neighbouring Stirlingshire and Fife are only a short run away.',
  },
  'East Lothian': {
    supply:
      'Big arable farms, country-house and castle venues, and easy road links — one of the more straightforward places in Scotland to arrange a tractor.',
  },
  Midlothian: {
    supply:
      'Farms on the coastal plain and estates towards the Pentlands, all within a short run of Edinburgh’s venue circuit.',
  },
  'West Lothian': {
    supply:
      'Mixed farming between the towns with good motorway links, so machines can reach venues across the central belt without a long road run.',
  },
  'City of Edinburgh': {
    supply:
      'Machines travel in from East and Midlothian rather than the city itself, both of which are close.',
    practical:
      'City-centre venues are the hard part, not availability — road restrictions and access decide it. Tell us the venue and whether the tractor can come in on a low-loader.',
  },
  'Scottish Borders': {
    supply:
      'Farms and estates throughout, a great many rural venues, and one of Scotland’s strongest vintage and rally scenes.',
  },
  'Dumfries and Galloway': {
    supply:
      'Dairy and stock farms across a wide, sparsely populated county, with country-house venues among them and plenty of working machinery.',
    practical:
      'It is a big county — a machine kept near the venue is worth a lot more than a cheaper one at the other end of it.',
  },
  'South Ayrshire': {
    supply:
      'Castle and country-house venues on the coast with farms immediately behind them — generally short, easy runs.',
  },
  'East Ayrshire': {
    supply:
      'Farms throughout, with rural venues scattered across the county and an active local show circuit.',
  },
  'North Ayrshire': {
    supply:
      'Coastal farms and estates, plus the islands — which change the question entirely if that is where the venue is.',
    practical:
      'Flag an island venue at the outset: the ferry, not the tractor, is what needs booking first.',
  },
  'South Lanarkshire': {
    supply:
      'Clyde valley farms and upland estates, with country-house venues among them and good road access from the central belt.',
  },
  'North Lanarkshire': {
    supply:
      'Green-belt farms between the towns, with machines able to reach most central-belt venues quickly on the motorway network.',
  },
  Falkirk: {
    supply:
      'Carse farms with excellent road links in every direction — a practical base for reaching venues across the central belt.',
  },
  'Glasgow City': {
    supply:
      'Machines come in from Lanarkshire, Renfrewshire and Stirlingshire; nothing is kept in the city itself.',
    practical:
      'Access and road restrictions decide this, not availability. Tell us the venue and whether the tractor needs to travel under its own power.',
  },
  Renfrewshire: {
    supply:
      'Farms on the moor edge above the Clyde, with country-house venues nearby and easy access to Glasgow’s.',
  },
  'East Renfrewshire': {
    supply:
      'Green-belt farms below the Fenwick moors, close enough to reach venues across the south side of Glasgow easily.',
  },
  'East Dunbartonshire': {
    supply:
      'Kelvin valley farms with the Campsies behind — rural venues within a short run, and Glasgow’s within reach.',
  },
  'West Dunbartonshire': {
    supply:
      'Farms along the Clyde and the Vale of Leven, with Loch Lomond’s venue circuit immediately to the north.',
  },
  Inverclyde: {
    supply:
      'Steep ground and a small farming base, so machines usually travel in from Renfrewshire — a short run, but worth arranging early.',
  },

  Cornwall: {
    practical:
      'Long county, narrow lanes, and a lot of venues near the coast. A machine kept locally is worth a great deal more than a cheaper one two hours up the A30 — the road time is the cost here.',
  },
  Devon: {
    practical:
      'Steep, high-banked lanes are the thing to mention when you enquire. They rule some trailer combinations out entirely, and knowing that up front saves everyone a wasted conversation.',
  },
  Highland: {
    supply:
      'Estates and hill farms rather than a dense wedding-venue circuit, and a long way between them. There are good machines here, but the pool near any one venue is small.',
    practical:
      'Distances here are unlike anywhere else on the network. Give us as much notice as you can, and expect the travel to and from site to be a significant part of the quote.',
  },
  'Argyll and Bute': {
    supply:
      'Farms and estates scattered along the sea-lochs and across the islands, with castle and country-house venues among them. What is available depends heavily on which side of the water you are on.',
    practical:
      'Say up front if the venue is on an island — a ferry crossing changes which machines can realistically get there, and needs booking well ahead.',
  },
  'Na h-Eileanan Siar': {
    supply:
      'Island crofting country. Working tractors are everywhere, but everything has to already be on the island — bringing one over is rarely practical.',
    practical:
      'Book local and book early. Ferry timetables, not availability, are usually what decides whether a date works.',
  },
  'Orkney Islands': {
    supply:
      'Well-farmed islands with plenty of working machinery and a strong agricultural show tradition behind it — a good place to find a tidy tractor for an event.',
    practical:
      'Everything is island-based, so the pool is finite. Give as much notice as you can, particularly for summer dates.',
  },
  'Shetland Islands': {
    supply:
      'A small, entirely island-based pool of machinery. Crofting tractors rather than a wedding-hire circuit, but people here are used to turning out for local events.',
    practical:
      'Book a long way ahead. Bringing a machine up from the mainland is not a realistic fallback.',
  },
  'Isle of Wight': {
    supply:
      'Everything has to already be on the island — bringing a tractor over on the ferry is possible but rarely worth it. The good news is that the island has plenty of working farms and a keen vintage scene of its own.',
    practical:
      'Book island-based machines and book early, particularly for summer dates. Ferry logistics make a late replacement much harder than it would be on the mainland.',
  },
};

/* ── Resolution ───────────────────────────────────────────────────────── */

const TABLES = {
  'hay-bales': { regions: HAY_REGIONS, counties: HAY_COUNTIES, fallback: HAY_DEFAULT },
  'tractor-hire': {
    regions: TRACTOR_REGIONS,
    counties: TRACTOR_COUNTIES,
    fallback: TRACTOR_DEFAULT,
  },
} as const;

/**
 * Region note overlaid with any county-specific override, so a county only has
 * to say the part that differs from its region.
 */
export function verticalNote(
  vertical: keyof typeof TABLES,
  county: string,
  region: string,
): VerticalNote {
  const table = TABLES[vertical];
  const base = table.regions[region] ?? table.fallback;
  return { ...base, ...table.counties[county] };
}

/** Section heading for the note block, per vertical. */
export function verticalNoteHeading(vertical: keyof typeof TABLES, county: string) {
  return vertical === 'hay-bales'
    ? { kicker: 'Forage here', title: `What ${county} makes`, titleEm: 'and what that means for you.' }
    : { kicker: 'On the ground', title: `Tractor hire in ${county},`, titleEm: 'practically speaking.' };
}
