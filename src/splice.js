import getarc from "./getarc.js";

// Copy from src to dst, srcend not inclusive
function copyBuffer(src, dst, srcstart, srcend, dststart) {
  while (srcstart < srcend)
    dst[dststart++] = src[srcstart++];
}

// Reverse from start to end, non-inclusive of end
function reverse(a, s, e) {
  var t;
  var m = s + (e - s) / 2;
  for (e--; s < m; s++, e--)
    t = a[s], a[s] = a[e], a[e] = t;
}

// guaranteed to not collide, but more expensive than just using a numeric hash
function hashPoint(p) { return `${p[0]},${p[1]}` }

// Determine required space for these cuts [arclength][pointoffset]*[[pointx][pointy]]*
function spaceFor(cuts) {
  let narcs = 0;
  let nfloats = 0;
  cuts.forEach(ptsarray => {
      narcs += ptsarray.length;
      ptsarray.forEach(pts => nfloats += pts.length * 2);
    });
  nfloats += narcs * 2;
  return { narcs, nfloats };
}

function validateArcPacking(af) {
  let narcs = af[0];
  let zp = af[2];
  for (let i = 0; i < narcs; i++) {
    let z = 1 + i*2;
    let npoints = af[z];
    let zpoints = af[z+1];
    if (zp != zpoints)
      console.log(`toposplice: arcpacking: point index unexpected for arc ${i}`);
    zp += npoints * 2;
  }
  if (zp != af.length)
    console.log(`toposplice: arcpacking: buffer length unexpected: last used index ${zp} != actual length ${af.length}`);
}

function validateObjects(topology) {

  function equalPoint(p1, p2) { return p1[0] == p2[0] && p1[1] == p2[1] }

  function validateMultiPolygon(k) {
    var npoly = arcs[k++];
    for (var i = 0; i < npoly; i++)
      k = validatePolygon(k);
    return k;
  }

  function validatePolygon(k) {
    var nring = arcs[k++];
    for (var i = 0; i < nring; i++)
      k = validateRing(k);
    return k;
  }

  function validateRing(k) {
    var narc = arcs[k++];
    var prev;
    var allpoints = [];
    var bad = 0;
    for (var i = 0; i < narc; i++) {
      let arc = arcs[k++];
      let pts = getarc(topology, arc);
      if (arc < 0) reverse(pts, 0, pts.length);
      allpoints.push(pts);
      var first = pts[0];
      var last = pts[pts.length-1];
      if (prev && !equalPoint(prev, first))
        bad++;
      prev = last;
    }
    if (bad)
      console.log(`toposplice: ${bad} of ${allpoints.length} ring arcs do not merge`);
    return k;
  }

  var arcs = topology.packed.arcindices;
  for (var id in topology.objects) {
    var o = topology.objects[id];
    switch (o.type) {
      case 'MultiPolygon':
        validateMultiPolygon(o.packedarcs);
        break;
      case 'Polygon':
        validatePolygon(o.packedarcs);
        break;
    }
  }
}

/*
var times = {};
function t(s) {
  if (times[s]) {
    var e = (new Date()).getTime();
    var ms = e - times[s];
    delete times[s];
    console.log(`toposplice: ${s}: ${ms}ms`);
  }
  else
    times[s] = (new Date()).getTime();
}
*/

function reduceSum(accum, cur) { return accum+cur }

// Combine packed arc buffers (in format is [narcs][[arclength][pointoffset]]*[[pointx][pointy]]*
// Also add new cut segments to each fragment. Record the new arc index in place of the point arrays
// in the cuts data structure. These new arc indices are still relative to the uncombined index
// (cuts1 added to the end of a1, cuts2 added to the end of a2).
// So:
// [narcs][arcs1][newarcs1][arcs2][newarcs2][points1][newpoints1][points2][newpoints2] etc.
//
//
function combineArcs(topology, topoarray, cutsarray) {
  var nfloats = topoarray.map(t => t.topology.packed.arcs.length);
  var nfloat = nfloats.reduce(reduceSum, 0);
  var narcs = topoarray.map(t => t.topology.packed.arcs[0]);
  var narc = narcs.reduce(reduceSum, 0);
  var newspace = cutsarray.map(spaceFor);
  var newincr = newspace.reduce(
                    (accum, cur) => {return { narcs: accum.narcs+cur.narcs, nfloats: accum.nfloats+cur.nfloats }}, 
                    { narcs: 0, nfloats: 0 });
  var ab = new ArrayBuffer((nfloat + newincr.nfloats - (nfloats.length - 1)) * 8); // -lengths size because narcs combined
  var af = new Float64Array(ab);
  var c = narc + newincr.narcs;
  af[0] = c;
  var zpoint = 1 + (2 * c);
  var z = 1;
  var arcnext = 0;
  var deltaarray = []; // array of narcs+narcsnew

  cutsarray.forEach((cuts, index) => {
    deltaarray.push(arcnext);
    let t = topoarray[index]; // parallel array

    // First move [npoints,pointoffset] pairs, adjusting point offset
    let zpointstart = zpoint;
    let af2 = t.topology.packed.arcs;
    let z2 = 1;
    let na = narcs[index];
    let zend2 = 1 + (na * 2);
    for (; z2 < zend2; z += 2, z2 += 2) {
      af[z] = af2[z2];
      af[z+1] = zpoint;
      zpoint += af2[z2] * 2;
    }

    // Copy actual points
    copyBuffer(af2, af, 1+(na*2), af2.length, zpointstart);

    // Track value of next new arc that gets generated; increment by arcs copied above
    arcnext += na;

    // Now generate new cuts arcs and copy points to packed buffer.
    // In process, convert cuts value from array of array of points to array of arc indices (in final incremented form).
    cuts.forEach((ptsarray, arc) => {
      let arcs = [];
      ptsarray.forEach(pts => {
          arcs.push(arcnext++);
          af[z++] = pts.length;
          af[z++] = zpoint;
          pts.forEach(pt => {
              af[zpoint++] = pt[0];
              af[zpoint++] = pt[1];
            });
        });
      cuts.set(arc, arcs);
    });
  });

  // DEBUGGING VALIDATION
  validateArcPacking(af);

  topology.packed.arcs = af;
  return deltaarray;
}

// { x, y, arc }
function sortPoints(p1, p2) { return p1.x != p2.x ? p1.x - p2.x : p1.y != p2.y ? p1.y - p2.y : p1.arc - p2.arc }
function equalPoints(p1, p2) { return p1.x == p2.x ? p1.y == p2.y : false }

// Return a mapping of any second instance of an arc to the first instance
function dedup(af) {

  function equalArcs(a1, a2) {
    let z1 = 1 + a1 * 2;
    let z2 = 1 + a2 * 2;
    let n1 = af[z1];
    let n2 = af[z2];
    if (n1 == n2) {
      let zs1 = af[z1+1];
      let ze1 = zs1+n1*2;
      let zs2 = af[z2+1];
      let ze2 = zs2+n2*2;

      // forward
      let p1 = zs1;
      let p2 = zs2;
      for (; p1 < ze1 && af[p1] == af[p2] && af[p1+1] == af[p2+1]; p1 += 2, p2 += 2)
        ;
      if (p1 == ze1)
        return 1; // equal, same order

      // reverse
      p1 = zs1;
      p2 = ze2 - 2;
      for (; p1 < ze1 && af[p1] == af[p2] && af[p1+1] == af[p2+1]; p1 += 2, p2 -= 2)
        ;
      if (p1 == ze1)
        return 2; // equal, reversed
    }
    return 0; // not equal
  }

  // Create sorted array of arcs by start/end points
  let narcs = af[0];
  let arcarray = new Array(narcs*2);
  for (let arc = 0; arc < narcs; arc++) {
    let npoints = af[1 + (arc*2)];
    let zpoint = af[1 + (arc*2) + 1];
    let zend = zpoint + (npoints-1)*2;
    arcarray[arc*2] = { x: af[zpoint], y: af[zpoint+1], arc };
    arcarray[arc*2+1] = { x: af[zend], y: af[zend+1], arc };
  }
  arcarray.sort(sortPoints);

  let arcToArc = new Map();
  var start = 0;
  while (start < arcarray.length) {
    // Find set of equal points to test for complete equality
    var end; for (end = start+1; end < arcarray.length && equalPoints(arcarray[start], arcarray[end]); end++) ;
    for (let i = start; i < end; i++)
      for (let j = i+1; j < end; j++) {
        var p1 = arcarray[i];
        var p2 = arcarray[j];
        if (p1.arc != p2.arc && !arcToArc.has(p2.arc)) {
          var eq = equalArcs(p1.arc, p2.arc);
          if (eq)
            arcToArc.set(p2.arc, eq == 2 ? ~p1.arc : p1.arc);
        }
      }
    start = end;
  }
  return arcToArc;
}

// cb(topology, object, arc, npoint, npoints, point)
// params: { topology, objects, onlyOnce, walkPoints }

function forAllArcPoints(params, cb) {
  var pts = params.topology.packed.arcs;
  var arcs = params.topology.packed.arcindices;
  var seen = params.onlyOnce ? new Set() : null;
  var objects = params.objects || params.topology.objects;

  function walkMultiPolygon(object, z) {
    let npoly = arcs[z++];
    for (var i = 0; i < npoly; i++)
      z = walkPolygon(object, z);
    return z;
  }

  function walkPolygon(object, z) {
    let nring = arcs[z++];
    for (var i = 0; i < nring; i++)
      z = walkRing(object, z);
    return z;
  }

  function walkRing(object, z) {
    let narc = arcs[z++];
    for (var i = 0; i < narc; i++, z++)
      walkArc(object, arcs[z]);
    return z;
  }

  function walkArc(object, arc) {
    if (arc < 0) arc = ~arc;
    if (! params.onlyOnce || ! seen.has(arc)) {
      if (seen) seen.add(arc);
      if (params.walkPoints)
      {
        var z = 1 + arc * 2;
        var npoints = pts[z];
        var zpoint = pts[z+1];
        for (var i = 0; i < npoints; i++, zpoint += 2)
          cb(params.topology, object, arc, i, npoints, [ pts[zpoint], pts[zpoint+1] ]);
      }
      else
        cb(params.topology, object, arc);
    }
  }

  for (var id in objects) {
    var object = params.topology.objects[id];
    if (object) switch (object.type) {
      case 'MultiPolygon': walkMultiPolygon(object, object.packedarcs); break;
      case 'Polygon': walkPolygon(object, object.packedarcs); break;
    }
  }
}

// Create a mapping from points to a map of arcs that contain that point. The map specifies whether
// the point was an interior or end point.
function ptsToArcs(topology, objects) {
  let map = new Map();
  forAllArcPoints({ topology, objects, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
      let h = hashPoint(point);
      if (! map.has(h)) map.set(h, new Map());
      map.get(h).set(arc, i == 0 || i == npoints-1);
   });
   return map;
}

// Compute new junctions pttoarcOthers forces on pttoarc1 (pt is interior for 1, endpoint for others)
function newJunctions(pttoarc1, pttoarcOthers) {
  let pointset = new Set();
  let arcset = new Set();

  pttoarc1.forEach((arcmap1, h) => {
    pttoarcOthers.forEach(pttoarc2 => {
      if (pttoarc2 !== pttoarc1)
      {
        let arcmap2 = pttoarc2.get(h);
        if (arcmap2)
          arcmap1.forEach((e1, a1) => {
            arcmap2.forEach(e2 => {
                if (!e1 && e2)
                {
                  pointset.add(h);
                  arcset.add(a1);
                }
              });
          });
      }
    });
  });

  return { pointset, arcset };
}

// Cut the arcs specified. Return a map from arc being split to array of point arrays
function cutArcs(topology, pointset, arcset) {
  let m = new Map();
  arcset.forEach(arc => {
      let pts = getarc(topology, arc);
      let ptarray = [];
      let cut = [];
      ptarray.push(cut);
      for (let i = 0; i < pts.length; i++) {
        cut.push(pts[i]);
        if (pointset.has(hashPoint(pts[i])))
        {
          cut = [ pts[i] ];
          ptarray.push(cut);
        }
      }
      m.set(arc, ptarray);
  });
  return m;
}

function combineIndices(topology, topoarray, cutsarray, deltaarray, dupMapping) {
  var k = 0;  // Tracks index in destination packed arcindices buffer (cumulative as we pack)
  var src;    // Set to source packed arcindices
  var ksrc;   // Tracks index in source packed arcindices buffer (reset at each object)

  function sameSign(arc, arcabs) {
    return arc < 0 ? ~arcabs : arcabs;
  }

  function translateArc(index, arc) {
    let absarc = (arc < 0) ? ~arc : arc;
    absarc += deltaarray[index];
    if (dupMapping.has(absarc))
      absarc = dupMapping.get(absarc);
    return sameSign(arc, absarc);
  }

  function copyMultiPolygon(index) {
    var npoly = src[ksrc++];
    ai[k++] = npoly;
    for (var i = 0; i < npoly; i++)
      copyPolygon(index);
  }

  function copyPolygon(index) {
    var nring = src[ksrc++];
    ai[k++] = nring;
    for (var i = 0; i < nring; i++)
      copyRing(index);
  }

  function copyRing(index) {
    var narc = src[ksrc++];
    var karc = k;
    var nfinalarc = narc;
    ai[k++] = narc;
    for (var i = 0; i < narc; i++)
    {
      let arc = src[ksrc++];
      let splice = cutsarray[index].get(arc < 0 ? ~arc : arc);
      if (splice && splice.length)
      {
        splice.forEach(a => { ai[k++] = sameSign(arc, translateArc(0, a)) });
        if (arc < 0) reverse(ai, k - splice.length, k);
        nfinalarc += splice.length - 1;
      }
      else
        ai[k++] = translateArc(index, arc);
    }
    ai[karc] = nfinalarc;
  }


  function copyObjects(index) {
    var objects = topoarray[index].topology.objects;
    var filterout = topoarray[index].filterout;
    src = topoarray[index].topology.packed.arcindices;
    for (var id in objects) {
      var o = objects[id];
      if (!filterout || !filterout[id])
      {
        o = Object.assign({}, o);
        topology.objects[id] = o;
        ksrc = o.packedarcs;
        o.packedarcs = k;
        switch (o.type) {
          case 'MultiPolygon': copyMultiPolygon(index); break;
          case 'Polygon':      copyPolygon(index);      break;
        }
      }
    }
  }

  // Determine how much base and shattering packed indices will grow in order to
  // determine how much larger packedindices buffer needs to be.
  var nExtra = 0;
  topoarray.forEach((t, index) => {
    let cuts = cutsarray[index];
    forAllArcPoints({ topology: t.topology },
      (topology, object, arc) => {
          let splice = cuts.get(arc);
          if (splice && splice.length)
            nExtra += splice.length-1;
        });
  });

  var lengths = topoarray.map(t => t.topology.packed.arcindices.length);
  var length = lengths.reduce(reduceSum, 0);
  var ab = new ArrayBuffer((length + nExtra) * 4);
  var ai = new Int32Array(ab);

  topology.packed.arcindices = ai;
  topology.objects = {};
  topoarray.forEach((t, index) => copyObjects(index));
}

// Given an array of [topology, objects] pairs, combine them into a single topology.
// The "objects" hash field specifies the objects being filtered out of the topology (and replaced by the other topologies).

export default function(topoarray) {
  var topology = Object.assign({}, topoarray[0].topology); // copy over any extraenous properties

  // Validate
  topoarray.forEach(e => { if (!e.topology.packed) throw 'topojson.splice only works on packed topologies' });

  // Compute arc overlaps
  let ptsToArcsArray = topoarray.map(t => ptsToArcs(t.topology, t.filterout));
  let newJunctionsArray = ptsToArcsArray.map(pttoarc1 => newJunctions(pttoarc1, ptsToArcsArray));
  let cutsarray = newJunctionsArray.map((e, index) => cutArcs(topoarray[index].topology, e.pointset, e.arcset));

  // Combine packed points and arcs and add new arc indices with their points
  topology.packed = {};
  var deltaarray = combineArcs(topology, topoarray, cutsarray);

  // Still need to dedup replicated arcs in the spliced topologies
  let dupMapping = dedup(topology.packed.arcs);

  // Now copy over objects with new arc indices
  combineIndices(topology, topoarray, cutsarray, deltaarray, dupMapping);

  // DEBUGGING VALIDATION
  topoarray.forEach(t => validateObjects(t.topology));
  validateObjects(topology);

  return topology;
}
