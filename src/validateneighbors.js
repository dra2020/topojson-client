import getarc from "./getarc.js";
import pointMap from "./pointmap.js";
import segMap from "./segmap.js";
import segCreate from "./segcreate.js";
import forAllArcPoints from "./forallarcpoints.js";

var validate = false;

// Validate that there are no two arcs that contain the same two-point segment.
// Approach: add point segment as pointMap => pointMap with the 
export default function(topology) {
  if (! validate) return;
  let ptindex = pointMap();
  function p2i(p) { return ptindex.has(p) ? ptindex.get(p) : ptindex.set(p, ptindex.length()) } 
  function a2s(ps) { return ps.map(p2i).join(', ') }
  let segments = segMap();
  let duparcs = new Set();
  let pts = topology.packed.arcs;
  forAllArcPoints({ topology, onlyOnce: true },
    (topology, object, arc) => {
        var z = 1 + arc * 2;
        var npoints = pts[z];
        var zp = pts[z+1];
        var prev;
        var here = [ pts[zp++], pts[zp++] ];
        for (var i = 1; i < npoints; i++) {
          prev = here;
          here = [ pts[zp++], pts[zp++] ];
          var s = segCreate(prev, here);
          var dup = segments.get(s);
          if (dup)
            duparcs.add(arc), duparcs.add(dup.arc);
          segments.set(s, { arc, dup });
        }
      });
  console.log(`toposplice: found ${duparcs.size} arcs with duplicate segments`);
  segments.forEach((v, s) => {
    if (v.dup) {
      let dups = []; for (let j = v; j; j = j.dup) dups.push(j.arc);
      console.log(`toposplice: dupseg [${p2i(s.s)}, ${p2i(s.e)}]: in ${dups.join(', ')}`);
    }
  });
  duparcs.forEach(arc => { 
    console.log(`toposplice: duparc ${arc}: ${a2s(getarc(topology, arc))}`);
  });
}

