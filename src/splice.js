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

// guaranteed to not clash, more expensive than just using a numeric hash
function hashPoint(p) { return `${p[0]},${p[1]}` }

/*
function toDisplay(m) {
  let a = [];
  if (m) m.forEach((v, k) => { if (v !== undefined) a.push(`${k}: ${v}`) });
  return a.join(', ');
}
*/

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

/*
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
    for (var i = 0; i < narc; i++) {
      let arc = arcs[k++];
      let pts = getarc(topology, arc);
      var first, last;
      if (arc < 0)
        first = pts[pts.length-1], last = pts[0];
      else
        first = pts[0], last = pts[pts.length-1];
      if (prev && !equalPoint(prev, first))
      {
        console.log('toposplice: ring arcs do not merge');
        break;
      }
      prev = last;
    }
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
*/

// Combine packed arc buffer (which is [narcs][[arclength][pointoffset]]*[[pointx][pointy]]*
// Also add new cut segments to each fragment. Record the new arc index in place of the point arrays
// in the cuts data structure. These new arc indices are still relative to the uncombined index
// (cuts1 added to the end of a1, cuts2 added to the end of a2).
// So:
// [narcs][arcs1][newarcs1][arcs2][newarcs2][points1][newpoints1][points2][newpoints2]
//
//
function combineArcs(a1, a2, cuts1, cuts2) {
  var l1 = a1.length;
  var l2 = a2.length;
  var new1 = spaceFor(cuts1);
  var new2 = spaceFor(cuts2);
  var ab = new ArrayBuffer((l1 + l2 + new1.nfloats + new2.nfloats - 1) * 8); // -1 because narcs combined
  var af = new Float64Array(ab);
  var n1 = a1[0];
  var n2 = a2[0];
  var c = n1 + n2 + new1.narcs + new2.narcs;
  af[0] = c;
  var zpoint = 1 + (2 * c);
  var z = 1;
  var zend = 1 + (n1 * 2);

  // 1. Move first set of [length,pointoffset] pairs, adjusting the point delta
  for (; z < zend; z += 2)
  {
    af[z] = a1[z];
    af[z+1] = zpoint;
    zpoint += a1[z] * 2;
  }

  // 2. Now generate new cuts1 arcs and copy over points. In process, convert cuts value to array of arc indices
  var arcnew = n1;
  cuts1.forEach((ptsarray, arc) => {
    let arcs = [];
    ptsarray.forEach(pts => {
        arcs.push(arcnew++);
        af[z++] = pts.length;
        af[z++] = zpoint;
        pts.forEach(pt => {
            af[zpoint++] = pt[0];
            af[zpoint++] = pt[1];
          });
      });
    cuts1.set(arc, arcs);
  });
  var arcoffset = arcnew;

  // 3. Now move second set of [length,pointoffset] pairs
  var z2 = 1;
  zend = 1 + (n2 * 2);
  for (; z2 < zend; z += 2, z2 += 2)
  {
    af[z] = a2[z2];
    af[z+1] = zpoint;
    zpoint += a2[z2] * 2;
  }

  // 4. Now generate new cuts2 arcs and copy over points. In process, convert cuts value to array of arc indices
  arcnew = n2;
  cuts2.forEach((ptsarray, arc) => {
    let arcs = [];
    ptsarray.forEach(pts => {
        arcs.push(arcnew++);
        af[z++] = pts.length;
        af[z++] = zpoint;
        pts.forEach(pt => {
            af[zpoint++] = pt[0];
            af[zpoint++] = pt[1];
          });
      });
    cuts2.set(arc, arcs);
  });

  // Move first set of points
  copyBuffer(a1, af, 1+(n1*2), l1, 1+(c*2));
  // Move second set of points
  copyBuffer(a2, af, 1+(n2*2), l2, l1 + new1.nfloats + (n2+new2.narcs)*2);

  return { af, arcoffset };
}

// Return a mapping of any second instance of an arc to the first instance
function dedup(af, dedupfrom) {
  let ptsToArc = new Map(); // starting points to set of arcs with that starting point

  function equalArcs(a1, a2) {
    let z1 = 1 + a1 * 2;
    let z2 = 1 + a2 * 2;
    let n1 = af[z1];
    let n2 = af[z2];
    if (n1 == n2) {
      let p1 = af[z1+1];
      let p2 = af[z2+1];
      for (let k = n1*2 - 1; k >= 0; k--)
        if (af[p1+k] != af[p2+k])
          return false;
      return true;
    }
    return false;
  }

  let narcs = af[0];
  for (let arc = 0; arc < narcs; arc++) {
    let zpoint = af[1 + (arc*2) + 1];
    let h = hashPoint([ af[zpoint], af[zpoint+1] ]);
    if (! ptsToArc.has(h)) ptsToArc.set(h, new Set());
    ptsToArc.get(h).add(arc);
  }

  let arcsToArc = new Map();
  ptsToArc.forEach(arcset => {
    let arcs = Array.from(arcset);
    for (let i = 0; i < arcs.length; i++)
      for (let j = i+1; j < arcs.length; j++) {
        let a1 = arcs[i];
        let a2 = arcs[j];
        if ((a1 < dedupfrom && a2 >= dedupfrom) || (a2 < dedupfrom && a1 >= dedupfrom)) {
          if (equalArcs(a1, a2))
            arcsToArc.set(Math.max(a1, a2), Math.min(a1, a2));
        }
      }
  });

  return arcsToArc;
}

/*
function equalRings(r1, r2) {
  // Need to be same length
  if (r1.length !== r2.length)
    return false;

  r1 = r1.map(hashPoint).sort();
  r2 = r2.map(hashPoint).sort();

  for (var i = 0; i < r1.length; i++)
    if (r1[i] != r2[i])
      return false;
  return true;
}
*/

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
    var object = objects[id];
    switch (object.type) {
      case 'MultiPolygon': walkMultiPolygon(object, object.packedarcs); break;
      case 'Polygon': walkPolygon(object, object.packedarcs); break;
    }
  }
}

// Given a base Topology, a new topology that shatters some set of objects in that base topology,
// produce a combined topology that removes the shattered objects and inserts the new shapes.
export default function(basetopology, shattertopology, objects) {
  var topology = Object.assign({}, basetopology);

  if (! basetopology.packed || ! shattertopology.packed)
    throw 'topojson.splice only works on packed topologies';

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

  // Compute new junctions ptoarc2 forces on pttoarc1 (pt is interior for 1, endpoint for 2)
  function newJunctions(ptoarc1, ptoarc2) {
    let pointset = new Set();
    let arcset = new Set();

    // Create map of how many points each arc has in common with some other arc
    ptoarc1.forEach((arcmap1, h) => {
      let arcmap2 = ptoarc2.get(h);
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
    });

    return { pointset, arcset };
  }

  // Cut the arcs specified. Return a map from arc being split to array of point arrays
  function cutArcs(t, pointset, arcset) {
    let m = new Map();
    arcset.forEach(arc => {
        let pts = getarc(t, arc);
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

  //function toOneValue(set) { var one; set.forEach(e => one = e); return one }

  // Compute arc overlaps
  let ptsToBaseArcs = ptsToArcs(basetopology, objects);
  let ptsToShatArcs = ptsToArcs(shattertopology);
  let baseJunctions = newJunctions(ptsToBaseArcs, ptsToShatArcs);
  let shatJunctions = newJunctions(ptsToShatArcs, ptsToBaseArcs);
  let baseCuts = cutArcs(basetopology, baseJunctions.pointset, baseJunctions.arcset);
  let shatCuts = cutArcs(shattertopology, shatJunctions.pointset, shatJunctions.arcset);

  // Combine packed points and arcs and add new arc indices with their points
  topology.packed = {};
  var combo = combineArcs(basetopology.packed.arcs, shattertopology.packed.arcs, baseCuts, shatCuts);
  topology.packed.arcs = combo.af;

  // Still need to dedup replicated arcs in the shatter topology
  let dupMapping = dedup(combo.af, combo.arcoffset);

  // Determine how much base and shattering packed indices will grow in order to
  // determine how much larger packedindices buffer needs to be.
  var nExtra = 0;
  forAllArcPoints({ topology: basetopology },
    (topology, object, arc) => {
        let splice = baseCuts.get(arc);
        if (splice && splice.length)
          nExtra += splice.length-1;
      });
  forAllArcPoints({ topology: shattertopology },
    (topology, object, arc) => {
        let splice = shatCuts.get(arc);
        if (splice && splice.length)
          nExtra += splice.length-1;
      });

  var l1 = basetopology.packed.arcindices.length;
  var l2 = shattertopology.packed.arcindices.length;
  var ab = new ArrayBuffer((l1 + l2 + nExtra) * 4);
  var ai = new Int32Array(ab);
  topology.packed.arcindices = ai;

  var k = 0;  // Tracks index in destination packed arcindices buffer (cumulative as we pack)
  var ksrc;   // Tracks index in source packed arcindices buffer (reset at each object)

  function translateArc(arc, dups, delta) {
    let absarc = (arc < 0) ? ~arc : arc;
    if (dups && dups.has(absarc))
      arc = dups.get(absarc);
    else
      absarc += delta;
    return sameSign(arc, absarc);
  }

  function sameSign(arc, arcabs) {
    return arc < 0 ? ~arcabs : arcabs;
  }

  function copyMultiPolygon(src, splices, dups, delta) {
    var npoly = src[ksrc++];
    ai[k++] = npoly;
    for (var i = 0; i < npoly; i++)
      copyPolygon(src, splices, dups, delta);
  }

  function copyPolygon(src, splices, dups, delta) {
    var nring = src[ksrc++];
    ai[k++] = nring;
    for (var i = 0; i < nring; i++)
      copyRing(src, splices, dups, delta);
  }

  function copyRing(src, splices, dups, delta) {
    var narc = src[ksrc++];
    var karc = k;
    var nfinalarc = narc;
    ai[k++] = narc;
    for (var i = 0; i < narc; i++)
    {
      let arc = src[ksrc++];
      let splice = splices.get(arc < 0 ? ~arc : arc);
      if (splice && splice.length)
      {
        splice.forEach(a => { ai[k++] = sameSign(arc, translateArc(a, dups, delta)) });
        if (arc < 0) reverse(ai, k - splice.length, k);
        nfinalarc += splice.length - 1;
      }
      else
        ai[k++] = translateArc(arc, dups, delta);
    }
    ai[karc] = nfinalarc;
  }

  topology.objects = {};

  function copyObjects(src, objects, filterout, splices, dups, delta) {
    for (var id in objects) {
      var o = objects[id];
      if (!filterout || !filterout[id])
      {
        o = Object.assign({}, o);
        topology.objects[id] = o;
        ksrc = o.packedarcs;
        o.packedarcs = k;
        switch (o.type) {
          case 'MultiPolygon':
            copyMultiPolygon(src, splices, dups, delta);
            break;
          case 'Polygon':
            copyPolygon(src, splices, dups, delta);
            break;
        }
      }
    }
  }

  // Copy base objects, filtering out replaced objects
  copyObjects(basetopology.packed.arcindices, basetopology.objects, objects, baseCuts, null, 0);
  // Copy shatter objects
  copyObjects(shattertopology.packed.arcindices, shattertopology.objects, null, shatCuts, dupMapping, combo.arcoffset);

  //validateObjects(topology);

  return topology;
}
