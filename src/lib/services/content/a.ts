import type { ServiceContent } from '../types';

export const PART_A: ServiceContent[] = [
  // 1. Paddock topping
  {
    card: 'topping',
    path: 'paddock-topping',
    canonical: ['Paddock topping'],
    metaTitle: 'Paddock Topping by Local Contractors',
    metaDescription:
      'Paddock topping by local contractors. Cut rank grass and weeds before they seed and keep grazing fresh. Describe your field and get prices.',
    h1: 'Paddock topping',
    intro:
      'Topping cuts the long, stemmy grass and weeds that horses and livestock leave behind, so the paddock regrows evenly with fresh, leafy grass. It’s for horse owners, smallholders and anyone whose field has gone patchy, tufty or tall.',
    involves: [
      'A tractor pulls a topper — a rotary or flail mower built for rough grass — across the field, cutting everything to an even height. The cut material is left lying where it falls to dry and break down.',
      'Grazing animals are picky. Horses in particular create short, overgrazed “lawns” and long, rank “roughs” around their droppings. Topping evens those out and stops grasses and weeds such as docks and thistles going to seed.',
      'The usual cutting height is somewhere around 7–10 cm (3–4 inches). Going lower scalps the grass, weakens it and lets weeds and bare patches in — a paddock is not a lawn.',
    ],
    when: [
      'Most topping happens from late spring through summer, roughly May to September, once grasses and weeds start throwing up seed heads. One cut in early summer and another later on is common; heavily grazed horse paddocks may need more.',
      'Pick a dry spell. Cutting wet grass leaves clumps that smother the sward underneath, and a tractor on soft ground leaves ruts. Topping just before seed heads ripen does the most good for weed control.',
    ],
    priceFactors: [
      'Acreage, and whether it’s one open field or several small paddocks with gates between them',
      'How long and dense the growth is — a first cut of neglected grass is slower than routine topping',
      'Access: gateway width, tracks and whether a full-size tractor can get in',
      'Slopes, ditches, stones and obstacles such as jumps, troughs or trees',
      'Travel distance to your field',
      'Whether other jobs, such as harrowing or rolling, are done on the same visit',
    ],
    goodToKnow: [
      'Topping ragwort does not kill it; it usually regrows. Cut ragwort also becomes more palatable to horses as it wilts while staying just as poisonous, so it should be pulled and removed, not left lying in a grazed field.',
      'Take horses out and move jumps, electric fencing and loose objects before the tractor arrives.',
      'If the grass is very long, the cut material can lie thickly. Harrowing a few days later spreads it and helps it rot down.',
    ],
    faqs: [
      {
        q: 'When should you top a paddock?',
        a: 'From late spring through summer, when grasses and weeds are starting to set seed — typically May to September. Choose a dry day on firm ground. Topping before seed heads ripen stops weeds spreading and encourages leafy regrowth.',
      },
      {
        q: 'How short should you top a paddock?',
        a: 'Around 7–10 cm (3–4 inches) is a sensible height for most grazing. Cutting lower scalps the grass, slows regrowth and lets weeds into the bare patches.',
      },
      {
        q: 'Is it better to top or graze a field?',
        a: 'They work together. Grazing uses the grass, but animals leave uneven patches and ungrazed weeds; topping tidies those up so the whole field regrows evenly.',
      },
      {
        q: 'Should I top ragwort?',
        a: 'Topping alone won’t get rid of ragwort, and wilted ragwort left in a grazed field is a risk to horses. It is better pulled out by the root and taken away. Topping can stop it seeding if it can’t be dealt with straight away, but the cut plants should be cleared up.',
      },
    ],
    related: ['harrowing', 'weed-control', 'muck-sweeping', 'flail-collecting'],
  },

  // 2. Finish mowing
  {
    card: 'mowing',
    path: 'finish-mowing',
    canonical: ['Finish mowing'],
    metaTitle: 'Finish Mowing for Paddocks, Lawns and Estates',
    metaDescription:
      'Finish mowing for large lawns, paddocks, orchards and event fields. A neat, even cut from a tractor-mounted mower. Describe the area and get prices.',
    h1: 'Finish mowing for large lawns and grass areas',
    intro:
      'Finish mowing gives a tidy, lawn-like cut over areas too big for a ride-on mower — large gardens, paddocks near the house, orchards, parkland and fields used for events. It’s for when the grass needs to look good, not just be cut down.',
    involves: [
      'A finishing mower is a tractor-mounted rotary mower with several blades and a roller or wheels that hold it at a set height. It cuts cleanly and spreads the clippings finely, so the result looks close to a lawn rather than a rough field.',
      'It is a different machine from a topper. A topper is built to chew through tall, rough growth; a finishing mower is built for a neat cut on grass that is already kept reasonably short.',
      'Cutting height can be set lower than when topping — often 5 cm or so — and regular visits through the growing season keep the finish consistent.',
    ],
    when: [
      'Through the growing season, from around April to October, with visits every two to four weeks depending on how fast the grass grows and how tidy you want it. Before an event, a cut a few days ahead lets the grass recover and the clippings settle.',
      'Dry grass on firm ground gives the cleanest result. Wet grass clogs the deck and leaves clumps, and a heavy tractor on soft lawns can mark the surface.',
    ],
    priceFactors: [
      'The area to be cut and how many separate sections there are',
      'How often you want it done — one-off or regular through the season',
      'Obstacles: trees, beds, posts, play equipment and edges that need care',
      'How long the grass is now; very overgrown areas may need topping first',
      'Access for a tractor, and whether any strimming or edging is wanted as well',
      'Travel distance',
    ],
    goodToKnow: [
      'If the grass has got away from you, a finishing mower struggles. It is often quicker to top it first and then finish mow once it is back under control.',
      'Tell the contractor about hidden hazards — drain covers, sprinkler heads, stumps, tent-peg holes — before they start.',
      'A tractor is heavier than a garden mower. On soft lawns or after rain, it may be better to wait a few days than to leave wheel marks.',
    ],
    faqs: [
      {
        q: 'What is the difference between a topper and a finishing mower?',
        a: 'A topper is built to cut tall, rough grass and weeds in fields, and leaves a coarse finish. A finishing mower has several blades and a roller or wheels that give a neat, even, lawn-like cut on grass that is already kept fairly short.',
      },
      {
        q: 'How often should a large lawn or paddock be mown?',
        a: 'In peak growth, from late spring into early summer, every one to two weeks keeps it tidy. Later in the season, every two to four weeks is usually enough. It depends on the weather and how neat you want it.',
      },
      {
        q: 'Can a finishing mower cut long grass?',
        a: 'Only up to a point. In long or wet grass it clogs and leaves clumps of clippings. Very overgrown areas are best topped first, then brought back with a finishing mower.',
      },
    ],
    related: ['topping', 'rolling', 'hedge-cutting', 'scarifying'],
  },

  // 3. Harrowing
  {
    card: 'harrowing',
    path: 'paddock-harrowing',
    canonical: ['Harrowing'],
    metaTitle: 'Paddock Harrowing: Chain and Grass Harrows',
    metaDescription:
      'Paddock harrowing to spread droppings, level molehills and pull out dead grass. Local contractors with chain and grass harrows. Get prices.',
    h1: 'Paddock and field harrowing',
    intro:
      'Harrowing drags a set of chain or tined harrows across grassland to level it, pull out dead material and spread droppings and molehills. It’s one of the simplest ways to freshen a paddock after winter or between grazings.',
    involves: [
      'Chain harrows are a mat of linked iron that is pulled behind a tractor or quad. They flatten molehills and poached ground, break up and spread droppings and drag out dead grass, which lets air and light reach the base of the sward.',
      'Tined grass harrows have spring tines that dig in harder. They pull out more moss and thatch and scratch the surface, which also makes a seedbed if you plan to overseed.',
      'Most fields are harrowed in two directions or in overlapping passes so nothing is missed. It looks rough straight afterwards, but the grass usually greens up within a couple of weeks of growing weather.',
    ],
    when: [
      'The main harrowing is in early spring, roughly February to April, once the ground is dry enough to carry a tractor without cutting up and before the grass is growing strongly. It levels winter damage and molehills and gets the field ready for the season.',
      'Summer harrowing, after a paddock has been grazed, spreads droppings. Do it in hot, dry weather, when sun and drying help kill worm eggs and larvae. In warm, wet weather, spreading droppings can spread parasites across the whole field, so rest it from grazing afterwards.',
    ],
    priceFactors: [
      'Field size and the number of separate paddocks',
      'How much work the surface needs — heavy poaching or lots of molehills take more passes',
      'Chain harrows or heavier tined harrows',
      'Ground conditions and slopes',
      'Access and gateway width',
      'Travel, and whether rolling or topping is done on the same visit',
    ],
    goodToKnow: [
      'Harrowing and rolling often go together: harrow first to level and open the sward, then roll to firm it down.',
      'If the ground is too wet, harrows smear mud and pull out grass rather than dead material. Wait until the surface is dry enough to walk on without sinking.',
      'Keep horses off a field harrowed in summer to spread droppings until the weather has had time to dry it out — a few weeks is common.',
    ],
    faqs: [
      {
        q: 'When is the best time to harrow a paddock?',
        a: 'Early spring, when the ground has dried enough to take a tractor but before the grass is growing strongly. A second harrow in dry summer weather, after grazing, helps spread and dry out droppings.',
      },
      {
        q: 'How often should you harrow a field?',
        a: 'Once or twice a year suits most paddocks: a thorough spring harrow, plus one after grazing in summer if droppings are building up. Harrowing too often, especially on wet ground, can do more harm than good.',
      },
      {
        q: 'Does harrowing spread worms in horse paddocks?',
        a: 'It can. Spreading droppings in warm, wet weather spreads worm larvae across the field. Harrowing in hot, dry weather and resting the paddock afterwards reduces the risk; picking up droppings is the more reliable way to control worms.',
      },
      {
        q: 'Should you harrow or roll a field first?',
        a: 'Harrow first, then roll. Harrowing levels molehills and pulls out dead material; rolling then firms the surface and presses stones and hoof prints back down.',
      },
    ],
    related: ['rolling', 'overseeding', 'muck-sweeping', 'scarifying'],
  },

  // 4. Rolling
  {
    card: 'rolling',
    path: 'paddock-rolling',
    canonical: ['Rolling'],
    metaTitle: 'Paddock Rolling After Winter Poaching',
    metaDescription:
      'Paddock rolling to flatten hoof prints and poached ground and firm the surface in spring. Local contractors with flat and ring rollers. Get prices.',
    h1: 'Paddock and field rolling',
    intro:
      'Rolling presses a heavy roller over grassland to smooth out hoof prints, ruts and frost-lifted ground. It gives a firmer, level surface that is safer to ride and graze on and easier to mow.',
    involves: [
      'A tractor tows a heavy roller across the field. A flat roller gives a smooth finish; a ring roller (often called a Cambridge roll) has ridged rings that firm the soil while leaving a slightly textured surface, which is often used after seeding.',
      'Rolling pushes stones down out of the way of mowers, flattens poaching and pockmarks left by hooves over winter, and firms soil that frost has lifted, so grass roots are back in contact with the soil.',
      'It is not a fix for badly compacted or waterlogged fields. Rolling adds weight at the surface; if the problem is compaction deeper down, rolling can make it worse.',
    ],
    when: [
      'Spring is the time, usually March to April, when the soil is moist enough to be pressed flat but firm enough that the roller doesn’t sink or smear. The grass should be starting to grow so it recovers quickly.',
      'Timing is the whole job. Too wet and you compact and smear the surface, squeezing the air out of the soil; too dry and hard, and the roller rides over the bumps without shifting them. If a boot heel leaves a clean print without water pooling, conditions are about right.',
    ],
    priceFactors: [
      'Field size and number of paddocks',
      'How rough the surface is — deep poaching may need harrowing first',
      'The type and weight of roller wanted',
      'Slopes; steep ground limits where a heavy roller can safely go',
      'Access and gateway width',
      'Travel, and whether it is combined with harrowing on the same visit',
    ],
    goodToKnow: [
      'Harrow first, then roll. Harrowing levels molehills and drags out dead grass; rolling then firms everything down.',
      'Don’t roll frosty or waterlogged ground. It damages the grass and compacts the soil.',
      'Fields that stay wet and poached every winter may have a drainage or compaction problem that rolling won’t solve — sub-soiling or mole ploughing may be worth looking at.',
    ],
    faqs: [
      {
        q: 'When should you roll a paddock?',
        a: 'In spring, usually March or April, when the ground is moist but not wet and the grass is starting to grow. Rolling too early on wet ground compacts it; too late and the ground is hard and the bumps won’t flatten.',
      },
      {
        q: 'Does rolling a field help the grass?',
        a: 'It can. Rolling firms soil that frost has lifted so roots are back in contact with it, and it encourages grass to tiller and thicken. The main benefit, though, is a level surface that is safer for horses and easier to mow.',
      },
      {
        q: 'Can rolling cause compaction?',
        a: 'Yes, if it’s done on wet ground or too often. The roller squeezes air out of the soil, which harms grass roots and drainage. Roll only when the ground is at the right moisture and only when there’s a surface problem to fix.',
      },
    ],
    related: ['harrowing', 'overseeding', 'sub-soiling', 'topping'],
  },

  // 5. Muck sweeping
  {
    card: 'muck-sweeping',
    path: 'paddock-muck-sweeping',
    canonical: ['Manure sweeping'],
    metaTitle: 'Paddock Muck Sweeping and Poo Picking',
    metaDescription:
      'Paddock muck sweeping: a towed sweeper or vacuum picks up horse droppings to cut worm burden and roughs. Find local contractors and get prices.',
    h1: 'Paddock muck sweeping',
    intro:
      'Muck sweeping uses a towed paddock sweeper or vacuum to pick up droppings across a whole field in a fraction of the time it takes by hand. It’s for horse owners who can’t keep on top of poo picking, or who want a field cleared before resting or reseeding it.',
    involves: [
      'A sweeper is towed behind a quad or compact tractor. Rotating brushes flick droppings into a collection hopper; a paddock vacuum sucks them up instead. The hopper is emptied at your muck heap or wherever you choose.',
      'Picking up droppings is the most effective way to cut the worm burden on a paddock, because worm eggs pass out in the droppings and the larvae move onto the surrounding grass. It also reduces the sour, ungrazed “roughs” horses leave, so more of the field gets grazed.',
      'Sweepers also pick up leaves, twigs and fallen seeds. That makes them useful in autumn for reducing acorns and sycamore seeds in a paddock, though they won’t clear every last one.',
    ],
    when: [
      'All year, as often as needed. Droppings are ideally cleared at least once or twice a week in a grazed paddock; a contractor visit suits people who can’t manage that or who have let it build up.',
      'Sweepers work best when droppings and grass are fairly dry. In very wet weather, droppings smear rather than lift, and the machine can mark soft ground. Frozen droppings can also be hard to shift.',
    ],
    priceFactors: [
      'Paddock size and how many paddocks there are',
      'How much has built up — a field left for months takes longer and fills the hopper more often',
      'How far it is to the muck heap for emptying, or whether the muck has to be taken away',
      'Ground conditions, slopes and access for the machine',
      'One-off clear-up or regular visits',
      'Travel distance',
    ],
    goodToKnow: [
      'Sort out where the muck is going before the visit. Most sweepers tip on site; taking muck away is a separate job and needs arranging.',
      'A sweeper can pick up small stones and debris along with droppings, so it isn’t a substitute for checking the field for hazards.',
      'Clearing droppings works best alongside a worming plan agreed with your vet, such as worm egg counts.',
    ],
    faqs: [
      {
        q: 'How often should you poo pick a horse paddock?',
        a: 'Ideally at least twice a week, and more often in small or heavily stocked paddocks. The sooner droppings are removed, the fewer worm larvae reach the grass.',
      },
      {
        q: 'Do paddock sweepers work on wet ground?',
        a: 'Not well. Wet droppings smear instead of lifting, and the machine can mark soft ground. They work best in dry or fairly dry conditions.',
      },
      {
        q: 'Is it better to harrow or pick up droppings?',
        a: 'Picking up is better for worm control, because it removes eggs and larvae from the field. Harrowing spreads droppings and can spread parasites unless done in hot, dry weather with the field rested afterwards.',
      },
      {
        q: 'Can a paddock sweeper pick up acorns and sycamore seeds?',
        a: 'Sweepers and vacuums pick up a good proportion of fallen acorns and sycamore seeds along with leaves, which helps in autumn. They won’t get every one, so fencing off trees is still worth doing where possible.',
      },
    ],
    related: ['harrowing', 'topping', 'overseeding', 'trailer-work'],
  },

  // 6. Overseeding
  {
    card: 'overseeding',
    path: 'overseeding',
    canonical: ['Overseeding'],
    metaTitle: 'Overseeding Paddocks and Grassland',
    metaDescription:
      'Overseeding paddocks and grassland: thicken thin, patchy grass without ploughing. Local contractors with harrow seeders and drills. Get prices.',
    h1: 'Overseeding paddocks and grassland',
    intro:
      'Overseeding sows new grass seed into an existing field to thicken up thin, bare or weedy areas without ploughing and starting again. It’s for paddocks worn out by winter grazing, poaching or years of heavy use.',
    involves: [
      'The existing grass is opened up first — usually with tined harrows or a scarifier — so the seed can reach the soil. The seed is then sown with a harrow seeder that scratches and broadcasts in one pass, or with a slot drill that cuts seed into the ground.',
      'Rolling after sowing presses the seed into firm contact with the soil, which is what makes it germinate. Seed that sits on top of a thatch of dead grass mostly fails.',
      'The seed mix matters. Mixes sold for horse paddocks usually contain hard-wearing grasses and less ryegrass than mixes for dairy cattle; your contractor may supply seed or sow seed you have bought.',
    ],
    when: [
      'Late summer to early autumn, around mid-August to September, is often the best window: the soil is still warm and there’s usually more moisture, and weeds are growing less vigorously. Spring, around April to May, also works if the ground isn’t too dry afterwards.',
      'New seedlings need moisture for several weeks. Sowing into dry soil before a dry spell is the most common reason overseeding fails, so the timing is often decided by the weather forecast as much as the calendar.',
    ],
    priceFactors: [
      'Area to be sown',
      'Whether the seed is supplied by the contractor or by you, and the mix chosen',
      'How much preparation is needed — harrowing, scarifying or rolling passes',
      'The state of the existing sward: thin patches or a whole field',
      'Access, slopes and ground conditions',
      'Travel distance',
    ],
    goodToKnow: [
      'Keep animals off until the new grass is well rooted — often six to eight weeks or more. A simple test is to tug a handful of new grass: if it pulls out roots and all, it isn’t ready.',
      'Check with whoever does your weed control before spraying. Many grassland weedkillers can harm young grass seedlings, so there are usually intervals to observe before and after sowing.',
      'Overseeding won’t fix the reason the grass thinned. If the pH is low, the ground is compacted or the field is overstocked, deal with that too or the new grass will go the same way.',
    ],
    faqs: [
      {
        q: 'When is the best time to overseed a paddock?',
        a: 'Late summer to early autumn, roughly mid-August to September, when the soil is warm and moist. Spring works as well, as long as there’s enough rain afterwards for the seedlings to establish.',
      },
      {
        q: 'How long do you keep horses off after overseeding?',
        a: 'Usually six to eight weeks, sometimes longer, until the new grass is firmly rooted. If a tug on a handful of new grass pulls it out of the ground, give it more time.',
      },
      {
        q: 'Can you overseed without ploughing?',
        a: 'Yes, that’s the point of overseeding. The existing sward is opened up with harrows or a scarifier, seed is sown into it and the field is rolled, so there’s no need to plough and reseed from scratch.',
      },
      {
        q: 'Should you harrow before overseeding?',
        a: 'Yes. Harrowing or scarifying first pulls out dead grass and scratches the surface so the seed reaches the soil. Rolling afterwards presses the seed in.',
      },
    ],
    related: ['harrowing', 'scarifying', 'rolling', 'lime-spreading'],
  },

  // 7. Scarifying
  {
    card: 'scarifying',
    path: 'scarifying',
    canonical: ['Scarifying'],
    metaTitle: 'Scarifying Grassland, Paddocks and Lawns',
    metaDescription:
      'Scarifying grassland and paddocks to rip out moss and thatch so grass can thicken. Local contractors with tractor scarifiers. Describe the job, get prices.',
    h1: 'Scarifying grassland and paddocks',
    intro:
      'Scarifying rips out the moss and matted dead grass (thatch) that smother a sward, so air, water and light reach the soil again. It’s for mossy, spongy paddocks, lawns and amenity grass where the grass has gone thin underneath.',
    involves: [
      'A tractor-mounted scarifier has rows of rigid or spring tines, or rotating blades, that cut into the surface and drag out moss and thatch. It works much harder than a chain harrow, which only lifts the loosest material.',
      'It leaves a lot of debris. On lawns and amenity areas that material is usually raked or collected; on paddocks it may be left to dry and harrowed in, or gathered up if there is a lot of it.',
      'The field will look scruffy, even brown, for a few weeks afterwards. That is normal. Scarifying is very often followed straight away by overseeding, because the opened surface makes an ideal seedbed.',
    ],
    when: [
      'Early autumn, around September, is the classic time: the grass is still growing strongly enough to recover and there’s moisture in the ground. Spring, once growth has started, is the second choice, and is lighter-touch.',
      'Avoid scarifying in hot, dry weather or when the grass isn’t growing — it won’t recover, and weeds will fill the gaps. Very wet ground tears rather than scratches.',
    ],
    priceFactors: [
      'Area to be scarified',
      'How thick the moss and thatch are, and how many passes it takes',
      'Whether debris needs collecting and removing, or can be left',
      'Whether overseeding and rolling are done at the same time',
      'Access, slopes and obstacles',
      'Travel distance',
    ],
    goodToKnow: [
      'Moss is a symptom. Low soil pH, compaction, poor drainage and shade all favour it; if nothing changes, it comes back. A soil test is a sensible first step.',
      'Keep horses and stock off until the grass has recovered, and for longer if the field has been overseeded.',
      'Scarifying and harrowing are not the same job: harrowing is a light annual freshen-up, scarifying is a heavier treatment for a real moss or thatch problem.',
    ],
    faqs: [
      {
        q: 'When should you scarify grass?',
        a: 'Early autumn is best, when the grass is still growing and the soil is moist, so it recovers before winter. Spring also works once the grass is growing well. Avoid hot, dry spells.',
      },
      {
        q: 'What is the difference between scarifying and harrowing?',
        a: 'Harrowing drags chains or light tines over the surface to level it and lift loose dead material. Scarifying cuts into the sward to rip out moss and thatch, and is far more aggressive.',
      },
      {
        q: 'Should you overseed after scarifying?',
        a: 'Usually, yes. Scarifying opens up the surface and leaves thin patches, which is the ideal time to sow new seed. Without it, weeds can take over the gaps.',
      },
      {
        q: 'Why does moss keep coming back in my field?',
        a: 'Moss thrives where grass struggles: acidic soil, compaction, poor drainage and shade. Scarifying removes it, but correcting the underlying cause — often with lime or better drainage — is what keeps it away.',
      },
    ],
    related: ['overseeding', 'harrowing', 'lime-spreading', 'mowing'],
  },

  // 8. Fertiliser spreading
  {
    card: 'fertiliser',
    path: 'fertiliser-spreading',
    canonical: ['Fertiliser application'],
    metaTitle: 'Fertiliser Spreading for Paddocks and Fields',
    metaDescription:
      'Fertiliser spreading for paddocks, grazing and hay fields, with an even spread from a tractor spinner. Find local contractors and get prices.',
    h1: 'Fertiliser spreading for paddocks and grassland',
    intro:
      'Fertiliser spreading puts an even dressing of granular fertiliser across grassland to boost growth where the soil is short of nutrients. It’s for grazing and hay fields that have been cropped hard, and for paddocks where a soil test shows something is lacking.',
    involves: [
      'A tractor-mounted spinner spreader throws granules across a set width, and the tractor drives at matched spacings so the whole field gets the same rate. An even spread matters: overlaps scorch and gaps leave pale stripes.',
      'Grassland fertiliser usually supplies nitrogen for growth, often with phosphate, potash or sulphur. Horse paddocks generally need much less nitrogen than dairy or silage fields — lush, sugary grass can be a problem for horses and ponies prone to laminitis.',
      'The right product and rate depend on the field. A soil test for pH, phosphate and potash is the sensible starting point, and on grazing fields a low-nitrogen or no-nitrogen dressing is often all that’s needed.',
    ],
    when: [
      'Spring is the main time, once the grass has started to grow and the soil is warming — typically March to April. Hay and silage fields may have a further dressing after cutting. Spreading when the grass can’t use it just wastes fertiliser and risks it washing into watercourses.',
      'Don’t spread on waterlogged, flooded, frozen or snow-covered ground, or when heavy rain is forecast. In Nitrate Vulnerable Zones there are closed periods, running through autumn and winter, when nitrogen fertiliser can’t be spread on grassland — check the current dates on GOV.UK if your land is in an NVZ.',
    ],
    priceFactors: [
      'Acreage and the number of separate fields',
      'Whether the contractor supplies the fertiliser or spreads yours',
      'The product and rate — heavier dressings mean more loads',
      'Access for a tractor and spreader, and field shape',
      'Watercourses, hedges and boundaries that need careful edge spreading',
      'Travel distance',
    ],
    goodToKnow: [
      'Keep horses and livestock off until the granules have been washed in by rain; check the product label for any grazing interval.',
      'Keep fertiliser well clear of ditches, streams and ponds. Spreaders can be set to throw to one side only along a boundary.',
      'Don’t spread nitrogen fertiliser at the same time as lime — leave a gap of a few weeks between them.',
      'If you have laminitis-prone horses or ponies, tell the contractor. A dressing for a dairy field is not the right one for a pony paddock.',
    ],
    faqs: [
      {
        q: 'When should I fertilise my paddock?',
        a: 'In spring, once the grass has started growing and the soil is warming, usually March to April. Avoid wet, frozen or waterlogged ground. A soil test first tells you what the field actually needs.',
      },
      {
        q: 'How long should horses stay off a field after fertilising?',
        a: 'Until the granules have dissolved and been washed into the soil by rain, and not before any interval on the product label. If there’s no rain, it takes longer.',
      },
      {
        q: 'Do horse paddocks need fertiliser?',
        a: 'Often only a little, and sometimes not at all. Horses do best on grass that isn’t too rich, so paddocks usually need far less nitrogen than dairy or silage fields. A soil test shows whether phosphate, potash or lime is the real shortfall.',
      },
      {
        q: 'When can’t you spread fertiliser?',
        a: 'Not on waterlogged, flooded, frozen or snow-covered ground, and not before heavy rain. If your land is in a Nitrate Vulnerable Zone, there are also closed periods through autumn and winter when nitrogen can’t be spread on grassland; GOV.UK has the current dates.',
      },
    ],
    related: ['lime-spreading', 'overseeding', 'weed-control', 'harrowing'],
  },

  // 9. Lime spreading
  {
    card: 'lime-spreading',
    path: 'lime-spreading',
    canonical: ['Lime spreading'],
    metaTitle: 'Lime Spreading for Paddocks and Grassland',
    metaDescription:
      'Lime spreading for acidic paddocks and grassland. Raise soil pH so grass and fertiliser work properly. Find local contractors and get prices.',
    h1: 'Lime spreading for paddocks and grassland',
    intro:
      'Lime spreading corrects acidic soil, which is one of the most common reasons grass is thin, mossy and weedy. It’s for paddocks and fields where a soil test shows the pH has dropped too low.',
    involves: [
      'Most grassland is limed with ground limestone, spread from a tractor-drawn spinner or a lorry-mounted spreader, usually at a rate of tonnes per acre. Granulated lime, which spreads like fertiliser, is often used on small paddocks or where access is tight.',
      'Lime raises the soil pH. Grass on most mineral soils grows best at a pH of around 6 to 6.5; below that, nutrients become less available, fertiliser is partly wasted, and moss and acid-loving weeds take hold.',
      'Magnesian lime also supplies magnesium, which can matter on some soils. A soil test tells you both the pH and how much lime is needed, so you don’t spread more than the field needs.',
    ],
    when: [
      'Lime can go on at most times of year, as long as the ground is firm enough to carry the spreader without rutting. Many people lime in late summer, autumn or late winter, when fields are less busy.',
      'Lime works slowly, taking months to shift the pH fully, so it needs doing well before any reseeding or overseeding. Most grassland needs liming only every few years, and a soil test every three to five years shows when it’s due.',
    ],
    priceFactors: [
      'Acreage and how much lime per acre the soil test calls for',
      'The type of lime: ground limestone, magnesian or granulated',
      'Access for a lorry or tractor and spreader — narrow lanes and gateways matter',
      'Whether the lime is supplied and delivered, or already on site',
      'Ground conditions and slopes',
      'Travel and delivery distance',
    ],
    goodToKnow: [
      'Get a soil test first. Liming a field that doesn’t need it is wasted, and pushing the pH too high can cause its own problems.',
      'Keep horses and livestock off until the lime has been washed into the soil by rain.',
      'Leave a few weeks between liming and spreading nitrogen fertiliser, especially urea-based products, so the nitrogen isn’t lost.',
      'Ground limestone is dusty. Pick a still day, and let neighbours know if their houses or washing are nearby.',
    ],
    faqs: [
      {
        q: 'How do I know if my field needs lime?',
        a: 'A soil test is the only reliable way; it gives the pH and a lime requirement. Signs such as moss, thin grass, sorrel and poor response to fertiliser suggest acidic soil, but they aren’t proof.',
      },
      {
        q: 'When is the best time to lime a field?',
        a: 'Any time the ground is firm enough to take the spreader, which often means late summer, autumn or a dry spell in late winter. Because lime works slowly, apply it well before reseeding.',
      },
      {
        q: 'How long after liming can horses graze?',
        a: 'Wait until rain has washed the lime off the grass and into the soil. Check with the lime supplier or contractor for the product used.',
      },
      {
        q: 'How often should grassland be limed?',
        a: 'Usually every few years, depending on the soil and rainfall. Testing the soil every three to five years shows when the pH has dropped enough to need it.',
      },
    ],
    related: ['fertiliser', 'scarifying', 'overseeding', 'harrowing'],
  },
];
