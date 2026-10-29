// Walks the fell planner can suggest. Fells for each walk come from
// fells-data.js (each fell's `routes` array) — this file only adds what the
// planner needs on top: where you park, how far, how much climbing.
//
// Start points are the usual car park for each round; distance and ascent
// are typical figures for the standard circuit, rounded, not measured from a
// GPX. They're for ranking and rough timing only — the route link has the
// detail. `linear: true` means one-way (needs a lift or a bus back).
//
// label/url are copied from ROUTES in tracker.js (private to that file).
// To add a walk: give its fells the route id in fells-data.js (and a ROUTES
// entry in tracker.js for the label/blurb/link), then add a row here.
const PLANNER_WALKS = {
  coniston_horseshoe:      { label: "Coniston Fells Horseshoe", url: "https://www.mudandroutes.com/routes/the-coniston-round/", start: { key: "coniston-walna",    name: "Walna Scar Road car park, Coniston", lat: 54.3637, lng: -3.1029 }, miles: 9.0,  ascent: 1100 },
  bowfell_crinkles:        { label: "Bowfell & Crinkle Crags Round", url: "https://www.walkupscafellpike.co.uk/lake-district-walk/classic-lake-district-walks-bowfell-and-crinkle-crags-from-great-langdale/", start: { key: "langdale-odg",      name: "Old Dungeon Ghyll, Great Langdale",  lat: 54.4459, lng: -3.1062 }, miles: 8.5,  ascent: 1050 },
  scafell_traverse:        { label: "Scafell Massif Traverse", url: "https://where2walk.co.uk/walk/scafell-from-wasdale-head/", start: { key: "wasdale-head-nt",   name: "Wasdale Head NT car park",           lat: 54.4535, lng: -3.2865 }, miles: 8.5,  ascent: 1300 },
  wasdale_screes:          { label: "The Wasdale Screes", url: "https://www.walklakes.co.uk/walk_62.html", start: { key: "wastwater-foot",    name: "Foot of Wastwater, Nether Wasdale",  lat: 54.4330, lng: -3.3170 }, miles: 8.0,  ascent: 650 },
  glaramara_ridge:         { label: "The Glaramara Ridge", url: "https://www.walklakes.co.uk/walk_165.html", start: { key: "seatoller",         name: "Seatoller car park, Borrowdale",     lat: 54.5222, lng: -3.1708 }, miles: 9.0,  ascent: 850 },
  fairfield_horseshoe:     { label: "The Fairfield Horseshoe", url: "https://www.walklakes.co.uk/walk_42.html", start: { key: "rydal",             name: "Rydal (or Ambleside)",               lat: 54.4480, lng: -2.9820 }, miles: 10.0, ascent: 1000 },
  helvellyn_striding_edge: { label: "Helvellyn via Striding Edge", url: "https://www.walkinginthewild.co.uk/walks/helvellyn-via-striding-edge-1", start: { key: "glenridding",       name: "Glenridding car park",               lat: 54.5440, lng: -2.9510 }, miles: 8.0,  ascent: 950 },
  dodds_traverse:          { label: "The Helvellyn Range", url: "https://www.thegreatoutdoorsmag.com/spot/helvellyn-range-traverse-route-guide/", start: { key: "legburthwaite",     name: "Legburthwaite, Thirlmere",           lat: 54.5910, lng: -3.0600 }, miles: 13.0, ascent: 1350, linear: true },
  kentmere_horseshoe:      { label: "The Kentmere Horseshoe", url: "https://www.walklakes.co.uk/walk_14.html", start: { key: "kentmere",          name: "Kentmere church",                    lat: 54.4300, lng: -2.8400 }, miles: 12.0, ascent: 1200 },
  langdale_pikes:          { label: "The Langdale Pikes", url: "https://www.walklakes.co.uk/walk_63.html", start: { key: "langdale-ndg",      name: "Stickle Ghyll car park, Great Langdale", lat: 54.4480, lng: -3.0830 }, miles: 6.0, ascent: 850 },
  skiddaw_horseshoe:       { label: "The Skiddaw Horseshoe", url: "https://www.bigwalks.com/skiddaw-horseshoe.html", start: { key: "ravenstone",        name: "Ravenstone layby, A591",             lat: 54.6490, lng: -3.1890 }, miles: 8.0,  ascent: 950 },
  mungrisdale_round:       { label: "The Mungrisdale Round", url: "https://www.paulbeal.com/bannerdale-crags/", start: { key: "mungrisdale",       name: "Mungrisdale village",                lat: 54.6590, lng: -3.0030 }, miles: 8.0,  ascent: 750 },
  coledale_round:          { label: "The Coledale Round", url: "https://where2walk.co.uk/walk/coledale-round/", start: { key: "braithwaite",       name: "Braithwaite",                        lat: 54.6030, lng: -3.1930 }, miles: 10.0, ascent: 1200 },
  newlands_round:          { label: "The Newlands Round", url: "https://where2walk.co.uk/walk/newlands-round/", start: { key: "little-town",       name: "Little Town, Newlands",              lat: 54.5650, lng: -3.1830 }, miles: 10.0, ascent: 1150 },
  buttermere_horseshoe:    { label: "The Buttermere Horseshoe", url: "https://fabulousnorth.com/walks/red-pike-high-stile-high-crag-and-haystacks/", start: { key: "buttermere",        name: "Buttermere village",                 lat: 54.5410, lng: -3.2770 }, miles: 8.5,  ascent: 1000 },
  mosedale_horseshoe:      { label: "The Mosedale Horseshoe", url: "https://www.walkwainwrights.co.uk/2021/12/maximum-mosedale.html", start: { key: "wasdale-head-inn",  name: "Wasdale Head Inn",                   lat: 54.4650, lng: -3.2580 }, miles: 11.0, ascent: 1700 },
  great_gable_group:       { label: "The Great Gable Group", url: "https://www.walkingbritain.co.uk/walk-1112-description", start: { key: "honister",          name: "Honister Pass",                      lat: 54.5100, lng: -3.1990 }, miles: 6.0,  ascent: 750 }
};

// Valley car parks / bases used to build a suggested walk for every fell the
// named rounds above don't cover. elev is the approximate car park height
// (m). Coordinates are approximate — good enough for a Google Maps pin and
// drive times; check the exact parking on the day.
const PLANNER_BASES = [
  { key: "keswick",        name: "Keswick (Lakeside car park)",      lat: 54.5975, lng: -3.1395, elev: 80 },
  { key: "latrigg",        name: "Gale Road car park, above Keswick", lat: 54.6170, lng: -3.1210, elev: 290 },
  { key: "braithwaite",    name: "Braithwaite",                       lat: 54.6030, lng: -3.1930, elev: 90 },
  { key: "whinlatter",     name: "Whinlatter Forest visitor centre",  lat: 54.6100, lng: -3.2270, elev: 300 },
  { key: "wythop",         name: "Wythop Mill, near Embleton",        lat: 54.6420, lng: -3.2600, elev: 110 },
  { key: "ravenstone",     name: "Ravenstone layby, A591",            lat: 54.6490, lng: -3.1890, elev: 120 },
  { key: "orthwaite",      name: "Peter House Farm, Orthwaite",       lat: 54.6880, lng: -3.1420, elev: 240 },
  { key: "fell-side",      name: "Fell Side, near Caldbeck",          lat: 54.7100, lng: -3.0700, elev: 300 },
  { key: "mosedale-caldbeck", name: "Mosedale, Caldbeck road",        lat: 54.6830, lng: -3.0130, elev: 250 },
  { key: "mungrisdale",    name: "Mungrisdale village",               lat: 54.6590, lng: -3.0030, elev: 260 },
  { key: "threlkeld",      name: "Threlkeld",                         lat: 54.6190, lng: -3.0440, elev: 170 },
  { key: "legburthwaite",  name: "Legburthwaite, Thirlmere",          lat: 54.5910, lng: -3.0600, elev: 180 },
  { key: "swirls",         name: "Swirls car park, Thirlmere",        lat: 54.5530, lng: -3.0650, elev: 190 },
  { key: "wythburn",       name: "Wythburn church, Thirlmere",        lat: 54.5350, lng: -3.0630, elev: 190 },
  { key: "dunmail",        name: "Dunmail Raise layby",               lat: 54.5020, lng: -3.0120, elev: 230 },
  { key: "grasmere",       name: "Grasmere village",                  lat: 54.4580, lng: -3.0230, elev: 65 },
  { key: "rydal",          name: "Rydal",                             lat: 54.4480, lng: -2.9820, elev: 60 },
  { key: "ambleside",      name: "Ambleside",                         lat: 54.4320, lng: -2.9630, elev: 60 },
  { key: "troutbeck",      name: "Troutbeck village",                 lat: 54.4180, lng: -2.9100, elev: 150 },
  { key: "kirkstone",      name: "Kirkstone Pass",                    lat: 54.4650, lng: -2.9250, elev: 450 },
  { key: "kentmere",       name: "Kentmere church",                   lat: 54.4300, lng: -2.8400, elev: 160 },
  { key: "sadgill",        name: "Sadgill, Longsleddale",             lat: 54.4520, lng: -2.7660, elev: 200 },
  { key: "mardale",        name: "Mardale Head, Haweswater",          lat: 54.4940, lng: -2.8140, elev: 250 },
  { key: "burnbanks",      name: "Burnbanks, Haweswater",             lat: 54.5370, lng: -2.7800, elev: 240 },
  { key: "howtown",        name: "Howtown, Ullswater",                lat: 54.5810, lng: -2.8580, elev: 150 },
  { key: "pooley-bridge",  name: "Pooley Bridge",                     lat: 54.6120, lng: -2.8180, elev: 140 },
  { key: "aira-force",     name: "Aira Force / Dockray",              lat: 54.5800, lng: -2.9300, elev: 200 },
  { key: "glenridding",    name: "Glenridding car park",              lat: 54.5440, lng: -2.9510, elev: 150 },
  { key: "patterdale",     name: "Patterdale",                        lat: 54.5330, lng: -2.9380, elev: 150 },
  { key: "hartsop",        name: "Cow Bridge, Hartsop",               lat: 54.5050, lng: -2.9270, elev: 160 },
  { key: "elterwater",     name: "Elterwater",                        lat: 54.4300, lng: -3.0340, elev: 60 },
  { key: "langdale-ndg",   name: "Stickle Ghyll car park, Great Langdale", lat: 54.4480, lng: -3.0830, elev: 100 },
  { key: "langdale-odg",   name: "Old Dungeon Ghyll, Great Langdale", lat: 54.4459, lng: -3.1062, elev: 95 },
  { key: "wrynose",        name: "Wrynose Pass top",                  lat: 54.4160, lng: -3.1310, elev: 393 },
  { key: "hardknott",      name: "Hardknott Pass top",                lat: 54.4030, lng: -3.1690, elev: 393 },
  { key: "tilberthwaite",  name: "Tilberthwaite",                     lat: 54.3980, lng: -3.0680, elev: 120 },
  { key: "tarn-hows",      name: "Tarn Hows car park",                lat: 54.3840, lng: -3.0400, elev: 190 },
  { key: "coniston-walna", name: "Walna Scar Road car park, Coniston", lat: 54.3637, lng: -3.1029, elev: 240 },
  { key: "duddon",         name: "Seathwaite, Duddon Valley",         lat: 54.3550, lng: -3.1930, elev: 60 },
  { key: "brotherilkeld",  name: "Brotherilkeld, foot of Hardknott",  lat: 54.4000, lng: -3.2070, elev: 90 },
  { key: "boot",           name: "Dalegarth / Boot, Eskdale",         lat: 54.3950, lng: -3.2720, elev: 60 },
  { key: "wastwater-foot", name: "Foot of Wastwater, Nether Wasdale", lat: 54.4330, lng: -3.3170, elev: 60 },
  { key: "wasdale-head-nt", name: "Wasdale Head NT car park",         lat: 54.4535, lng: -3.2865, elev: 80 },
  { key: "bleach-green",   name: "Bleach Green, Ennerdale Water",     lat: 54.5230, lng: -3.4300, elev: 110 },
  { key: "bowness-knott",  name: "Bowness Knott, Ennerdale",          lat: 54.5300, lng: -3.3900, elev: 120 },
  { key: "felldyke",       name: "Felldyke, Lamplugh",                lat: 54.5560, lng: -3.3780, elev: 230 },
  { key: "loweswater",     name: "Maggie's Bridge, Loweswater",       lat: 54.5800, lng: -3.3450, elev: 125 },
  { key: "lanthwaite",     name: "Lanthwaite Wood, Crummock Water",   lat: 54.5850, lng: -3.3000, elev: 110 },
  { key: "buttermere",     name: "Buttermere village",                lat: 54.5410, lng: -3.2770, elev: 110 },
  { key: "honister",       name: "Honister Pass",                     lat: 54.5100, lng: -3.1990, elev: 356 },
  { key: "seatoller",      name: "Seatoller car park, Borrowdale",    lat: 54.5222, lng: -3.1708, elev: 120 },
  { key: "seathwaite-borrowdale", name: "Seathwaite, Borrowdale",     lat: 54.4980, lng: -3.1800, elev: 125 },
  { key: "rosthwaite",     name: "Rosthwaite, Borrowdale",            lat: 54.5230, lng: -3.1470, elev: 95 },
  { key: "watendlath",     name: "Watendlath",                        lat: 54.5360, lng: -3.1180, elev: 260 },
  { key: "ashness",        name: "Ashness Bridge",                    lat: 54.5730, lng: -3.1200, elev: 200 },
  { key: "hawes-end",      name: "Hawes End, below Catbells",         lat: 54.5870, lng: -3.1650, elev: 120 },
  { key: "little-town",    name: "Little Town, Newlands",             lat: 54.5650, lng: -3.1830, elev: 130 },
  { key: "mell-fells",     name: "Matterdale End, by the Mell Fells", lat: 54.6100, lng: -2.9050, elev: 260 },
  { key: "binsey",         name: "Binsey, roadside below the fell",   lat: 54.7090, lng: -3.1980, elev: 240 }
];

// Where "nearest car park in a straight line" picks the wrong side of a
// ridge, say which base a fell should start from instead. Add to this as
// you spot bad suggestions.
const PLANNER_BASE_OVERRIDES = {
  "Saint Sunday Crag": "patterdale",
  "Troutbeck Tongue": "troutbeck",
  "Great Mell Fell": "mell-fells",
  "Little Mell Fell": "mell-fells",
  "Binsey": "binsey",
  "Middle Fell": "wastwater-foot",
  "Seatallan": "wastwater-foot",
  "Haycock": "wastwater-foot",
  "Caw Fell": "wastwater-foot",
  "Mellbreak": "loweswater"
};

// Real AllTrails routes for the suggested walks, keyed by the walk's highest
// fell (each suggested walk has a different highest fell). Distance, ascent
// and route type come from AllTrails; the route may take in extra summits.
// Found with the AllTrails search on 2026-10-29. A suggested walk with no
// entry here falls back to estimated figures.
const PLANNER_ALLTRAILS = {
  "Saint Sunday Crag": { name: "St. Sunday Crag, Birks, and Arnison Crag", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/st-sunday-crag-birks-and-arnison-crag", miles: 9.2, ascent: 756, type: "Circular" },
  "Place Fell": { name: "Place Fell, Angletarn Pikes and Beda Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/place-fell-angletarn-pikes-and-beda-fell-circular", miles: 8.9, ascent: 775, type: "Circular" },
  "Red Screes": { name: "Red Screes, Middle Dodd, and Little Hart Crag Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/scandale-round", miles: 6.9, ascent: 850, type: "Circular" },
  "Hart Side": { name: "Glenridding Dodd, Sheffield Pike, Hart Side, and Catstycam Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/glenridding-dodd-sheffield-pike-hart-side-and-catstycam-circular", miles: 12.4, ascent: 1339, type: "Circular" },
  "Birkhouse Moor": { name: "Birkhouse Moor, Helvellyn, and Catstye Cam Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/birkhouse-moor-helvellyn-and-catstye-cam-circular", miles: 8, ascent: 897, type: "Circular" },
  "Seat Sandal": { name: "Seat Sandal Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/seat-sandal-circular", miles: 3.3, ascent: 514, type: "Circular" },
  "The Knott": { name: "The Knott, Kidsty Pike, High Raise, and Brock Crags from Hartsop", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/the-knott-kidsty-pike-high-raise-and-brock-crags-from-hartsop", miles: 7.9, ascent: 845, type: "Circular" },
  "Hartsop Above How": { name: "Hartsop Above How", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/hartsop-above-how", miles: 3.4, ascent: 439, type: "Out-and-back" },
  "Great Mell Fell": { name: "Little Mell Fell, Great Mell Fell and Gowbarrow Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/little-mell-fell-great-mell-fell-and-gowbarrow-fell", miles: 10.9, ascent: 823, type: "Circular" },
  "Stone Arthur": { name: "Helm Crag, Gibson Knott, Calf Crag and Tarn Crag Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/helm-crag-gibson-knott-calf-crag-and-tarn-crag-circular", miles: 7.4, ascent: 635, type: "Circular" },
  "Gowbarrow Fell": { name: "Gowbarrow Fell from Dockray", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/gowbarrow-fell-from-dockray", miles: 4.8, ascent: 338, type: "Circular" },
  "Branstree": { name: "Branstree, High Howes, and Selside Pike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/branstree-high-howes-and-selside-pike-circular", miles: 5.7, ascent: 512, type: "Circular" },
  "High Street": { name: "High Street, High Raise and Kidsty Pike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/high-street-high-raise-and-kidsty-pike-circular", miles: 7.5, ascent: 786, type: "Circular" },
  "Loadpot Hill": { name: "Steel Knotts, Wether Hill, Arthur's Pike, and Bonscale Pike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/bonscale-pike-arthur-s-pike-wether-hill-and-steel-knotts-circular", miles: 9, ascent: 750, type: "Circular" },
  "Wether Hill": { name: "Steel Knotts, Wether Hill, and Loadpot Hill Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/steel-knotts-wether-hill-and-loadpot-hill-circular", miles: 6.9, ascent: 635, type: "Circular" },
  "Tarn Crag (Longsleddale)": { name: "Tarn Crag and Grey Crag Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/tarn-crag-and-grey-crag-circular", miles: 5.3, ascent: 509, type: "Circular" },
  "Sallows": { name: "Sallows, Sour Howes, and Capple Howe Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/sallows-sour-howes-and-capple-howe-circular", miles: 6.1, ascent: 471, type: "Circular" },
  "Wansfell": { name: "Wansfell from Troutbeck", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/wansfell-from-troutbeck", miles: 6.7, ascent: 500, type: "Circular" },
  "High Raise (Langdale)": { name: "Sergeant Man, High Raise, and the Langdales", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/sergeant-man-high-raise-and-the-langdales", miles: 6.3, ascent: 778, type: "Circular" },
  "Rossett Pike": { name: "Rossett Pike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/rossett-pike-circular", miles: 8.8, ascent: 645, type: "Circular" },
  "Ullscarf": { name: "Eagle Crag, Sergeant's Crag, Ullscarf, and Great Crag Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/eagle-crag-sergeant-s-crag-ullscarf-and-great-crag-circular", miles: 9.3, ascent: 775, type: "Circular" },
  "High Seat": { name: "Raven Crag, High Seat, High Tove and Armboth Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/raven-crag-high-seat-high-tove-and-armboth-fell-loop", miles: 6.9, ascent: 543, type: "Circular" },
  "Bleaberry Fell": { name: "Walla Crag, Bleaberry Fell, and Ashness Bridge", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/walla-crag-bleaberry-fell-and-ashness-bridge", miles: 5.2, ascent: 548, type: "Circular" },
  "Tarn Crag (Easedale)": { name: "Easedale Tarn, Tarn Crag, Codale Tarn, and Blea Rigg Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/easedale-tarn-tarn-crag-codale-tarn-and-blea-rigg-circular", miles: 8.7, ascent: 615, type: "Circular" },
  "Lingmoor Fell": { name: "Lingmoor Fell", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/lingmoor-fell", miles: 2.5, ascent: 275, type: "Circular" },
  "Armboth Fell": { name: "Raven Crag, High Seat, High Tove and Armboth Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/raven-crag-high-seat-high-tove-and-armboth-fell-loop", miles: 6.9, ascent: 543, type: "Circular" },
  "Raven Crag": { name: "Thirlmere Dam and Raven Crag", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/thirlmere-dam-and-raven-crag", miles: 3, ascent: 294, type: "Out-and-back" },
  "High Rigg": { name: "High Rigg and St John's in the Vale Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/high-rigg-and-st-john-s-in-the-vale-circular", miles: 5.2, ascent: 308, type: "Circular" },
  "Loughrigg Fell": { name: "Loughrigg Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/loughrigg-fell-circular", miles: 7.6, ascent: 447, type: "Circular" },
  "Harter Fell (Eskdale)": { name: "Eskdale to Harter Fell", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/eskdale-to-harter-fell", miles: 4.1, ascent: 533, type: "Out-and-back" },
  "Slight Side": { name: "Sca Fell, Slight Side and Eel Tarn Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/sca-fell-slight-side-and-eel-tarn-circular", miles: 9.3, ascent: 907, type: "Circular" },
  "Pike O' Blisco": { name: "Cold Pike and Pike o'Blisco", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/cold-pike-and-pike-o-blisco", miles: 3.9, ascent: 484, type: "Circular" },
  "Hard Knott": { name: "Hard Knott", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/hard-knott", miles: 1.4, ascent: 156, type: "Out-and-back" },
  "Green Crag": { name: "Green Crag and Harter Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/green-crag-and-harter-fell-circular", miles: 7, ascent: 759, type: "Circular" },
  "Black Fell": { name: "Tarn Hows to Black Fell", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/tarn-hows-to-black-fell", miles: 3.9, ascent: 170, type: "Out-and-back" },
  "Holme Fell": { name: "Holme Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/holme-fell-circular-walk", miles: 3.8, ascent: 249, type: "Circular" },
  "Skiddaw Little Man": { name: "Latrigg, Lonscale Pike, Lonscale Fell, and Skiddaw Little Man Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/latrigg-lonscale-pike-lonscale-fell-and-skiddaw-little-man-circular", miles: 7.1, ascent: 698, type: "Circular" },
  "Knott": { name: "Brae Fell, Great Sca Fell, Knott, and High Pike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/brae-fell-great-sca-fell-knott-and-high-pike-circular", miles: 8.1, ascent: 619, type: "Circular" },
  "Meal Fell": { name: "Meal Fell via Brae Fell and Great Sca Fell", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/meal-fell-via-brae-fell-and-great-sca-fell", miles: 7.2, ascent: 592, type: "Out-and-back" },
  "Great Calva": { name: "Great Calva and Knott", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/great-calva-and-knott", miles: 6.9, ascent: 553, type: "Circular" },
  "Carrock Fell": { name: "Carrock Fell and High Pike", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/carrock-fell-and-high-pike", miles: 6.2, ascent: 523, type: "Circular" },
  "Mungrisdale Common": { name: "Blencathra, Mungrisdale Common and Bannerdale Crags Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/blencathra-mungrisdale-common-and-bannerdale-crags-circular", miles: 9, ascent: 846, type: "Circular" },
  "Dodd": { name: "Dodd Wood and Summit Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/dodd-wood-and-summit-circular", miles: 5.2, ascent: 405, type: "Circular" },
  "Binsey": { name: "Binsey Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/binsey-circular", miles: 2.8, ascent: 199, type: "Circular" },
  "Grasmoor": { name: "Grasmoor End, Wandope, Crag Hill, and Whiteside Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/grasmoor-end-wandope-crag-hill-and-whiteside-circular", miles: 7.1, ascent: 1051, type: "Circular" },
  "Wandope": { name: "Rannerdale Knotts and Whiteless Pike", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/rannerdale-knotts-and-whiteless-pike", miles: 5.2, ascent: 634, type: "Circular" },
  "Starling Dodd": { name: "Great Borne, Starling Dodd, and Red Pike from Ennerdale", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/great-bourne-starling-dodd-and-red-pike-from-ennerdale", miles: 8.9, ascent: 868, type: "Circular" },
  "Ard Crags": { name: "Knott Rigg and Ard Crags", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/knott-rigg-and-ard-crag", miles: 3.5, ascent: 352, type: "Out-and-back" },
  "Outerside": { name: "Barrow and Outerside Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/barrow-and-outerside-circular", miles: 5, ascent: 567, type: "Circular" },
  "Lord's Seat": { name: "Graystones, Sale Fell, Lord's Seat, Barf to Brown How Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/graystones-sale-fell-broom-fell-lord-s-seat-barf-to-whinlatter-circular", miles: 12.6, ascent: 1201, type: "Circular" },
  "Broom Fell": { name: "Graystones, Broom Fell, and Lord's Seat", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/graystones-broom-fell-and-lord-s-seat", miles: 5.3, ascent: 493, type: "Circular" },
  "Castle Crag": { name: "Castle Crag Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/castle-crag-loop", miles: 2.6, ascent: 209, type: "Circular" },
  "Haycock": { name: "Middle Fell, Seatallan and Buckbarrow from Nether Wasdale", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/middle-fell-seatallan-and-buckbarrow-from-nether-wasdale", miles: 8.4, ascent: 779, type: "Circular" },
  "Fleetwith Pike": { name: "Fleetwith Pike", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/fleetwith-pike", miles: 2.9, ascent: 296, type: "Circular" },
  "Base Brown": { name: "Base Brown from Seathwaite Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/base-brown-from-seathwaite-circular", miles: 3.4, ascent: 517, type: "Circular" },
  "Crag Fell": { name: "Lank Rigg, Crag Fell, and Grike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/lank-rigg-crag-fell-and-grike-circular", miles: 7.9, ascent: 573, type: "Circular" },
  "Great Borne": { name: "Great Borne, Starling Dodd, and Red Pike from Ennerdale", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/great-bourne-starling-dodd-and-red-pike-from-ennerdale", miles: 8.9, ascent: 868, type: "Circular" },
  "Blake Fell": { name: "Burnbank Fell, Blake Fell, Gavel Fell, and Hen Comb Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/burnblank-blake-fell-gavel-fell-and-hen-comb-circular", miles: 10.4, ascent: 762, type: "Circular" },
  "Lank Rigg": { name: "Lank Rigg, Crag Fell, and Grike Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/lank-rigg-crag-fell-and-grike-circular", miles: 7.9, ascent: 573, type: "Circular" },
  "Low Fell": { name: "Fellbarrow and Low Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/fellbarrow-and-low-fell-circular", miles: 4.8, ascent: 453, type: "Circular" },
  "Burnbank Fell": { name: "Burnbank Fell Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/burnbank-fell-circular", miles: 3.4, ascent: 270, type: "Circular" },
  "Mellbreak": { name: "Mellbreak and Crummock Water Circular", url: "https://www.alltrails.com/en-gb/trail/england/cumbria/mellbreak-and-crummock-water-circular", miles: 6.9, ascent: 473, type: "Circular" }
};
