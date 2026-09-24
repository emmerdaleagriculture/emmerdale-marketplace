import type { ServiceContent } from '../types';

export const PART_C: ServiceContent[] = [
  {
    card: 'tree-felling',
    path: 'tree-felling-and-chipping',
    canonical: ['Tree felling & chipping'],
    metaTitle: 'Tree Felling & Chipping Contractors',
    metaDescription:
      'Tree felling and chipping for farms, paddocks and estates. Describe the trees and access, and local contractors send you a price for the whole job.',
    h1: 'Tree felling and chipping',
    intro:
      'For landowners with a dead ash on a field boundary, a windblown tree across a ride, or a line of overgrown conifers that has taken over a paddock. A contractor fells the trees, deals with the timber and chips the brash, so you are not left with a heap of branches to burn.',
    involves: [
      'Each tree is looked at for lean, decay and what it could hit, then felled in one piece where there is room or taken down in sections where there isn’t. Trees near buildings, power lines, roads or fences are the slow, careful part of any job.',
      'Once a tree is down, the branches go through a chipper and the trunk is cut into rings or cordwood lengths. Agree up front what happens to both: chip blown into a trailer and taken away, left in a pile for paths and mulch, or spread on site; timber stacked for your own logs or removed.',
      'Stumps are normally cut low and left. If you need the ground clear for mowing or building, ask for stump grinding or removal with a digger as a separate item, because it is a different machine and a different price.',
    ],
    when: [
      'Late autumn and winter are the usual felling season. The leaves are off, so it is easier to see the crown and the brash is lighter, and you avoid the bird nesting season, which runs roughly from March to August. It is an offence to damage or destroy an active nest, so spring and summer work needs a proper check first.',
      'Dangerous trees are the exception and should be dealt with when they are found. For everything else, wet winter ground is the main limit: a chipper and tractor on soft pasture will leave ruts, so frosty or dry spells are worth waiting for.',
    ],
    priceFactors: [
      'The number, size and species of trees, and whether they can be felled whole or must come down in sections.',
      'What is nearby: buildings, overhead lines, roads, fences and livestock all slow the work down.',
      'Whether the timber and chip are taken away or left on site.',
      'Access for the chipper and a vehicle, and how far the brash has to be dragged.',
      'Stump grinding or removal, if you want it.',
    ],
    goodToKnow: [
      'Check permissions before any work starts. In England a Forestry Commission felling licence is generally needed to fell more than 5 cubic metres of timber in a calendar quarter, though there are exemptions, for example for trees in gardens. Wales and Scotland have their own rules.',
      'Trees under a Tree Preservation Order or in a conservation area need consent from your council before work, whatever their size. Your council can tell you if either applies.',
      'Ash dieback has left many dead and brittle ash trees on field edges and roadsides. They are more dangerous to fell than they look, so mention them when you describe the job.',
      'Keep people, dogs and stock well away while trees are coming down, and move horses out of the field for the day.',
    ],
    faqs: [
      {
        q: 'Do I need permission to fell a tree?',
        a: 'Often not for a few trees, but check first. In England a Forestry Commission felling licence is generally needed for more than 5 cubic metres of timber a calendar quarter, with exemptions such as garden trees. Trees with a Tree Preservation Order or in a conservation area need council consent regardless.',
      },
      {
        q: 'What is the best time of year to fell trees?',
        a: 'Autumn and winter, outside the bird nesting season, which runs roughly from March to August. The trees are lighter without leaves and it is easier to see their structure. Dangerous trees should be dealt with whenever they are found.',
      },
      {
        q: 'Will the contractor take the wood away?',
        a: 'Only if you agree it. Many landowners keep the trunk wood for logs and have the chip left for paths or bedding areas. Say what you want when you describe the job, because removal adds to the price.',
      },
      {
        q: 'Is stump removal included in tree felling?',
        a: 'Usually not. Stumps are normally cut close to the ground and left. Grinding or digging them out is a separate job, so ask for it if you need the ground clear.',
      },
    ],
    related: ['fixed-tooth-mulching', 'land-clearance', 'hedge-cutting', 'excavator-work'],
  },
  {
    card: 'fixed-tooth-mulching',
    path: 'forestry-mulching',
    canonical: ['Fixed tooth mulching'],
    metaTitle: 'Forestry Mulching (Fixed Tooth Mulcher)',
    metaDescription:
      'Forestry mulching with a fixed tooth mulcher: scrub, brash, saplings and stumps turned to mulch where they stand. Local contractors send you a price.',
    h1: 'Forestry mulching with a fixed tooth mulcher',
    intro:
      'For ground that has gone past what a flail or topper can handle: dense scrub, bramble and blackthorn, self-set birch and willow, or brash left after felling. A fixed tooth mulcher shreds it where it stands and leaves a layer of mulch, with no burning and nothing to cart away.',
    involves: [
      'A fixed tooth mulcher is a heavy rotor fitted with hardened teeth, mounted on a high-powered tractor or a tracked carrier. It is lowered onto the vegetation and chews through stems, small trees and brash, leaving the material as a mat of chip on the surface.',
      'It handles far thicker material than a flail mower. Saplings and small trees go straight through it, and larger trees are usually felled first and the brash mulched after. Many machines can take stumps down to ground level or a little below, which leaves the ground ready for mowing or cultivation.',
      'The result is rough at first: a layer of mulch over bare soil. On grassland it breaks down over a season or two, and grass will come back through it, though reseeding speeds things up.',
    ],
    when: [
      'Autumn and winter are the main season, outside the bird nesting period that runs roughly from March to August. Dense scrub is prime nesting habitat, so summer work needs a careful check for active nests first, and is often best avoided altogether.',
      'Firm ground matters. These are heavy machines, and on wet clay they will rut badly. Tracked carriers spread the weight better than tractors, but a dry or frozen spell gives the cleanest finish.',
    ],
    priceFactors: [
      'The area, and how dense and tall the growth is.',
      'Stem thickness: saplings mulch quickly, thick scrub and stumps take much longer.',
      'Whether larger trees need felling first.',
      'Ground conditions and slope, and whether a tracked machine is needed.',
      'Hidden hazards such as old wire, fence posts, rubble or scrap in the scrub.',
    ],
    goodToKnow: [
      'Old fencing and wire buried in scrub are the biggest risk to the machine. Walk the ground first and tell the contractor about anything you know is in there.',
      'Mulched ground left alone will often regrow from roots, especially blackthorn and bramble. Plan follow-up topping or weed control for the next season.',
      'Mulchers throw material a long way. Keep people, animals and vehicles well clear, and mention any nearby roads, buildings or windows.',
    ],
    faqs: [
      {
        q: 'What is the difference between a mulcher and a flail mower?',
        a: 'A flail mower cuts grass and light scrub with swinging flails. A fixed tooth mulcher has rigid hardened teeth on a heavy rotor and is built to shred saplings, thick scrub, brash and stumps. Use a flail for regular cutting and a mulcher for reclaiming overgrown ground.',
      },
      {
        q: 'Can a forestry mulcher remove tree stumps?',
        a: 'Many can take stumps down to ground level or slightly below, which is enough for mowing or cultivation. Large stumps take time and may be better ground out or dug out with an excavator. Say how many stumps there are and roughly how big.',
      },
      {
        q: 'How do I clear overgrown land without burning?',
        a: 'Forestry mulching turns the growth into chip on site, so there is nothing to burn or haul away. Larger trees are felled first and their brash mulched. The mulch rots down and adds organic matter to the soil.',
      },
    ],
    related: ['land-clearance', 'tree-felling', 'flailing', 'mounding'],
  },
  {
    card: 'mounding',
    path: 'forestry-mounding',
    canonical: ['Mounding'],
    metaTitle: 'Forestry Mounding for Tree Planting',
    metaDescription:
      'Forestry mounding for tree planting: an excavator builds raised mounds on wet or weedy ground. Describe the site and local contractors send a price.',
    h1: 'Mounding for tree planting',
    intro:
      'For anyone planting a new wood, shelterbelt or restocking a felled site on ground that is wet, heavy or thick with grass and bracken. Mounding gives each young tree a raised, weed-free spot to root in, which can make a real difference to how many survive.',
    involves: [
      'An excavator works across the site, digging a scoop of soil and turning it over beside the hole to form a mound, typically in rows at the spacing of your planting plan. The turned turf smothers the grass under the mound and lifts the planting position above the wettest soil.',
      'There are variations. Inverted mounds turn the turf upside down and cap it with mineral soil; hinge mounds leave the turf attached on one side. On very wet sites the holes are sometimes linked into shallow drains. The contractor will suggest what suits your soil.',
      'The mounds are left to settle before planting, and trees are planted into the top or the shoulder of each mound.',
    ],
    when: [
      'Mounding is done ahead of the planting season, usually from late summer through winter, so the mounds have a few weeks or months to settle before bare-root trees go in between November and March.',
      'On restock sites it follows felling and brash clearance. Very wet spells make the work slow and the mounds slump, so a drier window in autumn is ideal where you can get one.',
    ],
    priceFactors: [
      'The area and the number of mounds, which follows from your planting density.',
      'Ground conditions: wet, peaty or stony ground is slower.',
      'Brash, stumps or scrub that need clearing first.',
      'Access for a tracked excavator, and the distance to travel.',
      'Whether drainage channels are wanted as well.',
    ],
    goodToKnow: [
      'If your planting is part of a grant scheme, check what ground preparation it allows before you book. Grant rules and site plans sometimes limit disturbance on peat, archaeology or protected habitats.',
      'Have your planting plan ready, with spacing and any open areas or rides marked, so mounds go where trees will actually be planted.',
      'Mounding is not needed everywhere. On free-draining, lightly vegetated ground, direct planting with spot weed control may be enough.',
    ],
    faqs: [
      {
        q: 'What is mounding in forestry?',
        a: 'It is ground preparation for tree planting, where an excavator digs and turns soil to make a raised mound for each tree. The mound drains better than the surrounding ground and smothers competing grass and weeds for the first few years.',
      },
      {
        q: 'Do I need to mound before planting trees?',
        a: 'Not always. It helps most on wet, heavy or peaty soils and on sites with thick grass or bracken. On dry, well-drained ground direct planting can be fine.',
      },
      {
        q: 'When should mounding be done?',
        a: 'Before the planting season, usually in late summer, autumn or early winter, so mounds can settle before trees go in. Allow time between mounding and planting where you can.',
      },
    ],
    related: ['fixed-tooth-mulching', 'excavator-work', 'tree-felling', 'weed-control'],
  },
  {
    card: 'excavator-work',
    path: 'excavator-hire-with-driver',
    canonical: ['Excavator work'],
    metaTitle: 'Excavator Hire with Driver',
    metaDescription:
      'Excavator hire with driver for ditching, drainage, ponds, trenches and stump removal. Describe the job and local contractors send you a price.',
    h1: 'Excavator hire with a driver',
    intro:
      'For the digging jobs every farm, smallholding and estate has on its list: a blocked ditch, a wet gateway, a water pipe to a trough, a pond, or stumps that need to come out. A contractor brings the right size of machine and an operator who knows what they are doing.',
    involves: [
      'Machine size is the first decision. A micro or mini digger fits through a field gate and suits trenches, trough pipes and tight corners; a mid-size machine handles ditching, stumps and small ponds; a larger tracked excavator is for big ditches, ponds and moving a lot of material quickly. Describe the job and the access and the contractor will choose.',
      'Common farm work includes cleaning out and re-profiling ditches, laying land drains, digging trenches for water and cable ducts, clearing stumps and roots, levelling pads for field shelters, and digging and shaping ponds.',
      'Spoil is the hidden part of most jobs. Decide whether it can be spread on site, used to build up a bank, or needs loading into trailers and taking away.',
    ],
    when: [
      'Excavators work all year, but ground conditions set the pace. Late summer and early autumn, when ditches are low and fields are firm, is the easiest time for ditching and drainage, and tracking across wet grassland in winter leaves lasting damage.',
      'Pond digging is best when the water table is low so you can see the real finished level. Ditch and hedge-line work should avoid the bird nesting season where it disturbs vegetation.',
    ],
    priceFactors: [
      'The size of machine needed and how long the job will take.',
      'What happens to the spoil: spread on site or loaded and removed.',
      'Access for moving the machine on a low loader or trailer.',
      'Ground conditions, water in the dig, and rock or old foundations.',
      'Materials such as drainage pipe, stone or ducting, if the contractor supplies them.',
    ],
    goodToKnow: [
      'Find out where buried services run before any digging: water pipes, electricity cables, gas and telecoms. Old farm water pipes are rarely on any plan, so mark what you know.',
      'Work in or next to a watercourse, including many ditches and streams, may need consent before it starts. Your council or the Environment Agency can tell you what applies.',
      'For ponds, think about where the water will come from and where the overflow will go before the first bucket goes in.',
    ],
    faqs: [
      {
        q: 'What size digger do I need?',
        a: 'For trenches, pipes and work through a normal field gate, a micro or mini digger is usually enough. Ditching, stump removal and small ponds suit a mid-size machine, and big ponds or long ditches a larger tracked one. Describe the job and access and let the contractor match the machine.',
      },
      {
        q: 'Can I hire a digger with an operator?',
        a: 'Yes. Hiring with a driver means you get someone who does this every day, and the machine is their responsibility. It is usually quicker and safer than self-drive hire for anything beyond a small trench.',
      },
      {
        q: 'Do I need permission to dig a pond?',
        a: 'Often not for a small pond, but it depends on size, location and what happens to the spoil. Larger ponds, ones fed from a watercourse, or work that changes a ditch or stream may need consent. Check with your council before you start.',
      },
    ],
    related: ['road-construction', 'mole-ploughing', 'fencing', 'mounding'],
  },
  {
    card: 'road-grading',
    path: 'farm-track-grading',
    canonical: ['Road grading'],
    metaTitle: 'Farm Track Grading & Pothole Repair',
    metaDescription:
      'Farm track grading: potholes levelled, the camber restored and water shed off the surface. Describe your track and local contractors send you a price.',
    h1: 'Farm track and private road grading',
    intro:
      'For stone tracks, drives and estate roads that have gone to potholes, ruts and a grass strip down the middle. Grading reshapes the surface you already have, pulling loose material back into the holes and restoring a camber so rain runs off instead of sitting in the track.',
    involves: [
      'A grading blade, on a tractor or a purpose-built grader, cuts the surface down to the bottom of the potholes and drags the stone back across the track, then reshapes it with a crown or cross-fall so water sheds to the sides. The track is often rolled afterwards to firm it up.',
      'Grading works with the material already in the track. Where the surface is worn thin, extra stone such as scalpings or crushed hardcore may be brought in and graded in with it.',
      'Drainage is half the job. Clearing the edges, reopening side ditches and cutting or clearing the cross drains keeps water off the surface, and it is standing water that makes potholes in the first place.',
    ],
    when: [
      'Grade when the track is damp but not wet. Bone-dry stone will not bind and turns to dust, while saturated material smears and slumps. Spring and autumn usually give the best conditions.',
      'Many tracks benefit from grading once or twice a year, before potholes get deep. Leaving it until the track is badly broken up often means it needs rebuilding rather than grading.',
    ],
    priceFactors: [
      'The length and width of the track.',
      'How badly potholed and rutted it is.',
      'Whether new stone is needed, and how much.',
      'Rolling, and clearing of side ditches and cross drains.',
      'Access for the machine and any gates, bridges or tight bends.',
    ],
    goodToKnow: [
      'If the potholes come back within weeks, the problem is water, not the surface. Ask about drainage, not just another grade.',
      'Filling potholes with loose stone or rubble without cutting them out tends to fail quickly. Grading the whole section gives a more even, longer-lasting result.',
      'Grass growing down the centre is a sign the camber has gone. Grading it out restores the crown and keeps water moving.',
    ],
    faqs: [
      {
        q: 'How do you fix potholes in a gravel farm track?',
        a: 'The lasting fix is to grade the track: cut the surface down to the bottom of the holes, pull the stone back across and reshape the camber so water runs off. Add fresh stone where the surface is thin, and sort out drainage so water does not sit on the track.',
      },
      {
        q: 'How often should a farm track be graded?',
        a: 'Most stone tracks benefit from grading once or twice a year, depending on traffic and rainfall. Grading little and often costs less than rebuilding a track that has been left to break up.',
      },
      {
        q: 'What is the difference between grading and resurfacing?',
        a: 'Grading reshapes the stone already in the track, with a little added where needed. Resurfacing or rebuilding means digging out, laying new sub-base and a fresh top layer, and is needed when the track has lost its foundation.',
      },
    ],
    related: ['road-construction', 'excavator-work', 'trailer-work', 'rolling'],
  },
  {
    card: 'road-construction',
    path: 'farm-track-construction-and-repair',
    canonical: ['Road construction/repair'],
    metaTitle: 'Farm Track Construction & Repair',
    metaDescription:
      'Farm track construction and repair: new stone tracks, rebuilt roads, hardstanding and gateways. Describe the job and local contractors send you a price.',
    h1: 'Farm track construction and repair',
    intro:
      'For a new stone track to a field, barn or house, a hard-standing for a yard or field shelter, a gateway that turns to mud every winter, or an old track that has lost its foundation. A contractor digs out, builds up and finishes a surface that carries the traffic you actually have.',
    involves: [
      'A new track starts with stripping the topsoil and soft material down to firm ground. A geotextile membrane is usually laid to stop the stone sinking into the subsoil, then a sub-base of crushed stone is built up in layers and compacted with a roller.',
      'The surface layer is chosen for the use: scalpings or a finer crushed stone for a smooth drive, a coarser stone for tractor and lorry traffic. The finished track is shaped with a camber or cross-fall.',
      'Drainage is built in from the start: side ditches, cross drains and culvert pipes where the track crosses a wet dip or a watercourse. Repairs to existing tracks often come down to digging out the failed sections and rebuilding them properly, with the drainage fixed.',
    ],
    when: [
      'Late spring through early autumn is the best building window, when the ground is dry enough for machines and lorries to work without churning up the subsoil and the stone can be compacted well.',
      'Winter work is possible on firm or frozen ground, but plan ahead: stone deliveries need access for heavy lorries, and the field alongside a new track will take the brunt of the construction traffic.',
    ],
    priceFactors: [
      'The length and width of the track or area.',
      'The depth of dig-out, which depends on how soft the ground is.',
      'The type and quantity of stone, membrane and pipes.',
      'Drainage: ditches, cross drains and culverts.',
      'Access for stone lorries, and what happens to the dug-out soil.',
    ],
    goodToKnow: [
      'A new track may need planning permission or prior approval from the council, even on a farm. Check before work starts, especially near a road, a listed building or in a protected landscape.',
      'Say what will use the track. A drive for cars and a track for loaded tractors, lorries and horseboxes need very different depths of stone.',
      'Culverts across a stream or ditch may need consent before they are installed. Your council or the Environment Agency can advise.',
      'Topsoil stripped from the line of the track is useful. Agree where it will be spread or stacked.',
    ],
    faqs: [
      {
        q: 'How do you build a farm track?',
        a: 'Strip the topsoil to firm ground, lay a geotextile membrane, then build up crushed stone in compacted layers and finish with a surface stone. Shape it so water runs off, and put in ditches and cross drains so it stays dry.',
      },
      {
        q: 'Do I need planning permission for a farm track?',
        a: 'It depends on where you are and what the track is for. Some agricultural tracks can be built under permitted development after telling the council, while others need full planning permission. Check with your council before work starts.',
      },
      {
        q: 'How do I stop a gateway turning to mud?',
        a: 'Dig out the soft ground, lay a membrane and build it up with compacted crushed stone, sloped so water drains away. Grid systems filled with stone are another option. Moving the water trough away from the gate helps too.',
      },
    ],
    related: ['road-grading', 'excavator-work', 'trailer-work', 'fencing'],
  },
  {
    card: 'general-tractor-work',
    path: 'tractor-and-driver-hire',
    canonical: ['General tractor work'],
    metaTitle: 'Tractor and Driver Hire',
    metaDescription:
      'Tractor and driver hire for loader work, moving bales and muck, carting and odd jobs. Describe what needs doing and local contractors send you a price.',
    h1: 'Tractor and driver hire',
    intro:
      'For the jobs that need a tractor for a few hours but do not fit a single service: stacking bales, loading muck, moving a field shelter, dragging out a stuck vehicle, or a day of odd jobs around the yard. You get the tractor and someone to drive it.',
    involves: [
      'Most general tractor work is loader work. With a front loader and the right attachment, a tractor can stack and move bales, load muck onto trailers or spreaders, shift stone, soil and hardcore, and lift heavy items into place.',
      'The job depends on the kit, so list what you need doing. Bale spikes or squeeze, a muck grab, a bucket, pallet forks, a link box or a towing chain are all common, and the contractor will bring what matches.',
      'Where a job has its own machine, such as topping, harrowing or muck spreading, it is better posted as that service. General tractor work is for the mix of tasks that is left.',
    ],
    when: [
      'Any time of year. Autumn and winter are busy with bale moving and yard muck clearance, spring and summer with moving stock-related gear and getting ground ready. Book ahead at haymaking and harvest when tractors are in demand.',
      'Consider the ground. A loaded tractor in a wet field or gateway will cause damage, so plan field work for firm conditions and keep heavy work to hard standing where you can.',
    ],
    priceFactors: [
      'How long the work takes, and whether it is a few hours or a full day.',
      'The size of tractor and attachments needed.',
      'Travel distance to your site.',
      'Access, ground conditions and room to manoeuvre.',
      'Whether trailers or other equipment are needed as well.',
    ],
    goodToKnow: [
      'Write a list of every job before the tractor arrives, grouped so the driver is not swapping attachments back and forth.',
      'Have things ready: gates open, stock moved, and anything to be lifted cleared of obstructions.',
      'Check the weight and size of what needs moving. A small compact tractor and a large loader tractor can do very different work.',
    ],
    faqs: [
      {
        q: 'Can I hire a tractor with a driver for a day?',
        a: 'Yes. Many contractors will come for a few hours or a full day with a tractor and the attachments you need. Describe the tasks so they bring the right kit.',
      },
      {
        q: 'What can a tractor with a front loader do?',
        a: 'Stack and move bales, load muck and soil, shift stone and hardcore, lift pallets and move heavy items around the yard. The attachment makes the difference, so say what you are moving.',
      },
      {
        q: 'Is it better to hire a tractor with a driver or self-drive?',
        a: 'With a driver you get someone experienced and the machine stays their responsibility. For awkward or heavy lifting, or if you do not drive tractors often, it is usually the safer and quicker choice.',
      },
    ],
    related: ['trailer-work', 'muck-sweeping', 'topping', 'excavator-work'],
  },
  {
    card: 'trailer-work',
    path: 'tractor-and-trailer-haulage',
    canonical: ['Trailer work'],
    metaTitle: 'Tractor and Trailer Haulage',
    metaDescription:
      'Tractor and trailer haulage for bales, muck, stone, timber and machinery. Describe the load and distance, and local contractors send you a price.',
    h1: 'Tractor and trailer haulage',
    intro:
      'For moving bulk loads across a farm or between local sites: hay and straw from the field or a neighbour’s barn, muck from the yard, stone for a track, timber, or a machine that needs taking somewhere. A contractor brings the tractor, the right trailer and a driver.',
    involves: [
      'The trailer is chosen for the load. Bale trailers or flat beds carry round and square bales; tipping trailers or dump trailers move muck, soil, stone and chip; low loaders carry machinery. Say what you are moving and roughly how much.',
      'Loading is the other half. Tell the contractor whether there will be a loader at both ends or whether they need to bring one, because a trailer standing waiting costs time.',
      'Many jobs combine short field-to-yard runs with road miles between sites. Distance, the number of loads and turnaround time at each end set how long the job takes.',
    ],
    when: [
      'Haymaking and harvest are peak times, so book bale haulage early. Winter is the season for muck clearance, timber and stone, though field access is often the limit.',
      'Soft ground is the main risk. A loaded trailer will sink and rut wet fields and gateways, so plan field loading for dry spells or use hard standing.',
    ],
    priceFactors: [
      'The number of loads and the distance between sites.',
      'The type of trailer needed for the load.',
      'Loading and unloading: whether a loader is on site or needs bringing.',
      'Access at both ends, including gateways, tracks and turning space.',
      'Road travel and the time of year.',
    ],
    goodToKnow: [
      'Work out your load before booking, such as the number of bales or the tonnage of stone. The contractor can then bring the right trailer and plan the trips.',
      'Check access for a long tractor and trailer: tight gateways, low branches, weak bridges and soft verges.',
      'For muck and soil, say where it is going and whether it needs tipping in a heap or spreading.',
    ],
    faqs: [
      {
        q: 'Can I hire a tractor and trailer to move hay bales?',
        a: 'Yes. Contractors with bale trailers will cart round or square bales from the field or another farm. Say how many bales, what size, and whether there is a loader at each end.',
      },
      {
        q: 'How many bales fit on a trailer?',
        a: 'It depends on the trailer length and the size of the bales. Tell the contractor your bale type and count and they will work out the loads.',
      },
      {
        q: 'Can a contractor move a muck heap?',
        a: 'Yes. A loader and tipping trailer can load and cart a muck heap away, or move it to a field for spreading. Say where it is going and how big the heap is.',
      },
    ],
    related: ['general-tractor-work', 'muck-sweeping', 'road-construction', 'tree-felling'],
  },
  {
    card: 'fencing',
    path: 'fencing-contractors',
    canonical: ['Fencing'],
    metaTitle: 'Fencing Contractors: Garden & Paddock',
    metaDescription:
      'Fencing contractors for closeboard, panels, picket, and post and rail. Give the type, height and metres, and local contractors send a price per metre.',
    h1: 'Fencing contractors',
    intro:
      'For horse owners, smallholders and householders who need a new fence or an old one replaced: closeboard along a boundary, lap panels round a garden, picket at the front, or post and rail round a paddock. Describe the fence and local contractors send a price per metre.',
    involves: [
      'Start with the type. Closeboard (featheredge boards on rails) is strong and private; closeboard or lap panels are quicker to put up; picket suits front gardens; post and rail is the usual choice for paddocks and horses; trellis tops a fence or makes a screen for climbers.',
      'Then height, length in metres, and posts. Wooden posts look traditional and are easy to cut to fit; concrete posts with gravel boards last longer and suit panel fencing. A capping rail on closeboard sheds rain from the board tops and adds to their life.',
      'Every fence needs its details sorted: how many gates and what width, whether the line runs up a slope, whether the ground needs clearing of hedge, scrub or brambles first, and whether an old fence has to be taken down and taken away.',
    ],
    when: [
      'Fencing can go in all year, but post holes dig and set most easily in autumn and spring when the ground is workable. Hard summer clay and waterlogged winter ground both slow the job.',
      'For paddocks, fence before stock go out on new grass. For boundary lines alongside hedges, clearing work should avoid the bird nesting season.',
    ],
    priceFactors: [
      'The type and height of fence, and the length in metres.',
      'Wooden or concrete posts, gravel boards, and capping rail.',
      'The number and width of gates.',
      'Slope, ground conditions and any clearance of hedge or scrub.',
      'Taking down and removing an old fence.',
    ],
    goodToKnow: [
      'Measure the run in metres, including every leg of the line, and mark where gates go. A rough sketch with lengths is ideal.',
      'Know where the boundary is before a fence goes up. If a neighbour shares the line, agree it with them first.',
      'Mark buried pipes, cables and drains near the fence line before post holes are dug.',
      'On a slope, say so. Panels step down and closeboard or post and rail follows the ground, which changes how the fence is built.',
    ],
    faqs: [
      {
        q: 'How much fencing do I need?',
        a: 'Measure every side of the area to be fenced in metres and add them up, leaving out the width of any gates. Note the height you want and the position of posts at corners. A sketch with measurements helps the contractor price accurately.',
      },
      {
        q: 'What is the best fencing for horses?',
        a: 'Post and rail is the traditional choice because it is highly visible and has no sharp edges. Many owners add an electric line on the inside to stop horses leaning on or chewing the rails. Avoid barbed wire for horses.',
      },
      {
        q: 'Should I use wooden or concrete fence posts?',
        a: 'Concrete posts last longer and do not rot, which suits panel fences in wet or exposed spots. Wooden posts are easier to work with and look more natural, particularly for closeboard, picket and post and rail. Both work well when set properly.',
      },
      {
        q: 'Do I need planning permission for a fence?',
        a: 'Usually not for a fence up to 2 metres high, or up to 1 metre next to a road used by vehicles, under householder permitted development in England. Listed buildings, conservation areas and some other cases can differ, so check with your council if unsure.',
      },
    ],
    related: ['excavator-work', 'hedge-cutting', 'land-clearance', 'general-tractor-work'],
  },
];
