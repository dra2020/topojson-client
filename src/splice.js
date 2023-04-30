import hashmap from "./hash/hashmap.js";
import hashPoint from "./hash/point-hash.js";
import equalPoint from "./hash/point-equal.js";
import getarc from "./getarc.js";
import getobjectarcs from "./getobjectarcs.js";

// Copy from src to dst, srcend not inclusive
function copyBuffer(src, dst, srcstart, srcend, dststart) {
  while (srcstart < srcend)
    dst[dststart++] = src[srcstart++];
}

// Combine packed arc buffer (which is [narcs][[arclength][pointoffset]]*[[pointx][pointy]]*
function combineArcs(a1, a2) {
  var l1 = a1.length;
  var l2 = a2.length;
  var ab = new ArrayBuffer((l1 + l2 - 1) * 8); // -1 because narcs combined
  var af = new Float64Array(ab);
  var n1 = a1[0];
  var n2 = a2[0];
  var c = n1 + n2;
  af[0] = c;
  var zpointdelta = n2 * 2;
  var z = 1;
  var zend = 1 + (n1 * 2);
  // Move first set of [length,pointoffset] pairs
  for (; z < zend; z += 2)
  {
    af[z] = a1[z];
    af[z+1] = a1[z+1] + zpointdelta;
  }
  var z2 = 1;
  zend = 1 + (n2 * 2);
  zpointdelta = n1 - 1; // everything but narcs pushes points over
  // Move second set of [length,pointoffset] pairs
  for (; z2 < zend; z += 2, z2 += 2)
  {
    af[z] = a2[z2];
    af[z+1] = a2[z2+1] + zpointdelta;
  }
  // Move first set of points
  copyBuffer(a1, af, 1+(n1*2), l1, 1+(c*2));
  // Move second set of points
  copybuffer(a2, af, 1+(n2*2), l2, l1 + (n2*2));

  return af;
}

function flattenArcs(arc) {
  var flat = [];
  function f1(a) { if (Array.isArray(a)) a.forEach(f1); else flat.push(a) }
  f1(arc);
  return flat;
}

function equalRings(r1, r2) {
  // Need to be same length
  if (r1.length !== r2.length)
    return false;

  // Try in same order
  let i = 0;
  for (; i < r1.length; i++)
    if (! equalPoint(r1[i], r2[i]))
      break;
  if (i == r1.length)
    return true;

  // Try in reverse order
  i = 0;
  for (; i < r1.length; i++)
    if (! equalPoint(r1[i], r2[r2.length-i-1]))
      return false;
  return true;
}

// cb(topology, object, arc, npoint, npoints, point)
// params: { topology, objects, onlyOnce, walkPoints }

function forAllArcPoints(params, cb) {
  var pts = params.topology.packed.arcs;
  var arcs = params.topology.packed.arcindices;
  var seen = params.onlyOnce ? new Set() : null;
  var objects = params.objects || params.topology.objects;

  function walkArc(object, arc) {
    if (! params.onlyOnce || ! seen.has(arc)) {
      if (seen) seen.add(arc);
      if (! params.walkPoints)
        cb(params.topology, object, arc);
      else
      {
        var z = 1 + arc * 2;
        var npoints = pts[z];
        var zpoint = pts[z+1];
        for (var i = 0; i < npoints; i++, zpoint += 2)
          cb(params.topology, object, arc, i, npoints, [ pts[zpoint], pts[zpoint+1] ]);
      }
    }
  }

  function walkMultiPolygon(object, z) {
    let npoly = arcs[z++];
    for (var i = 0; i < npoly; i++)
      z += walkPolygon(object, z);
    return z;
  }

  function walkPolygon(object, z) {
    let nring = arcs[z++];
    for (var i = 0; i < nring; i++)
      z += walkRing(object, z);
    return z;
  }

  function walkRing(object, z) {
    let narc = arcs[z++];
    for (var i = 0; i < narc; i++)
      walkArc(object, z++);
    return z;
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

  // Combine packed points and arcs
  topology.packed = {};
  topology.packed.arcs = combineArcs(basetopology, shattertopology);

  // Compare arcs from base and shatter topology and see if they contain same points
  function equalArcs(b, s) { return equalRings(getarc(basetopology, b), getarc(shattertopology, s)) }

  // For arcs in shattered objects, determine how to replace them with arcs or lists of arcs from the shattertopology.
  // First gather list of arcs and set up the data structure to track the mapping. The structure is a little odd in
  // that we end up picking only one of the arcs to store the 
  var oldarcset = new Map();
  var intpts = new hashmap(basetopology.packed.arcs.length * 1.4, hashPoint, equalPoint);
  var endpts = new hashmap(basetopology.packed.arcs.length * 1.4, hashPoint, equalPoint);
  var splices = new Map();

  forAllArcPoints({ topology: basetopology, objects, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
        var splice = { from: a, to: new Set(), allto: new Set() };
        oldarcset.set(a, splice);
        if (i == 0) // start point
          if (! endpts.has(point)) endpts.set(point, splice);
        if (i != 0 && i != npoints-1) // interior points
          intpts.set(point, splice);
      });

  // Now walk over shattering topology looking for interior points that have become arc endpoints and add that
  // arc to the replacement set. Also add any arcs that match an endpoint to the potential list of exact matches
  // (if the arc is replicated rather than subdivided in the shattertopology).
  forAllArcPoints({ topology: shattertopology, onlyOnce: true, walkPoints: true },
    (topology, object, arc, i, npoints, point) => {
        if (i == 0 || i == npoints-1)
        {
          var splice = intpts.get(point);
          if (splice)
            splice.to.add(arc);
        }
        if (i == 0)
        {
          var splice = endpts.get(point);
          if (splice)
            splice.allto.add(arc);
        }
      });

  // We still need to dedup arcs that occur in both. These are oldarcs that have nothing in their "to" set.
  // We can use the starting point to find all the possible dups that contain that starting point.
  var pts = basetopology.packed.arcs;
  oldarcset.forEach((splice, arc) => {
        var basesplice = splice;
        if (splice.to.size == 0) {
        // If this was not the special splice that is tracking allto, look it up from the start point.
        if (splice.allto.size == 0)
        {
          var z = 1 + arc * 2;
          var npoints = pts[z];
          var zpoint = pts[z+1];
          var start = [ pts[zpoint], pts[zpoint+1] ];
          splice = endpts.get(start);
          if (! splice)
            throw 'topojson.splice: yikes, expected to find starting point';
          if (! splice.allto.size)
            throw 'topojson.splice: yikes, expected there to be an arc to map to';
        }

        // Find the equal arc
        splice.allTo.forEach(t => { if (equalArcs(a, t)) basesplice.to.add(t) });
        if (basesplice.to.size == 0) throw 'topojson.splice: yikes, did not find any arc to map to';
      }
      let aTo = [];
      basesplice.to.forEach(t => aTo.push(t));
      basesplice.to = aTo;
    });

  // Copy base objects, filtering out replaced objects
  topology.objects = {};
  for (var id in basetopology.objects) {
    var o = basetopology.objects[id];
    if (! objects[id])
      topology.objects[id] = Object.assign({}, o);
  }

  // Copy new shattering objects
  for (var id in shattertopology.objects) {
    var o = shattertopology.objects[id];
    topology.objects[id] = Object.assign({}, o);
  }

  // Update arcindices referenced in oldarcset the challenge initially is that we don't know how much bigger the
  // packed arc indices array is going to get because every instance of an indice that is replaced by > 1 index
  // results in growth. So walk over twice to get size and then walk over and do the copy.
  var nExtra = 0;
  forAllArcPoints({ topology: basetopology },
    (topology, object, arc) => {
        var splice = oldarcset.get(arc);
        if (splice)
          nExtra += splice.to.length - 1;
      });

  // Now create merged packed indices, mapping arcs from the old arc set to 1 or more new arcs from the
  // shattered set.
  var nDelta = XXX  // Delta to apply to shattertopology indices since they go at the end
}
