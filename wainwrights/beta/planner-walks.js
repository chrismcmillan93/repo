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
