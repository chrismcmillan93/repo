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
