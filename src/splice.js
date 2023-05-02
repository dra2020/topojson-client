import hashPoint from "./hash/point-hash.js";
import equalPoint from "./hash/point-equal.js";
import getarc from "./getarc.js";

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
  copyBuffer(a2, af, 1+(n2*2), l2, l1 + (n2*2));

  return af;
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

  function walkArc(object, arc) {
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

  // Combine packed points and arcs
  topology.packed = {};
  topology.packed.arcs = combineArcs(basetopology, shattertopology);

  // Compare arcs from base and shatter topology and see if they contain same points
  function equalArcs(b, s) { return equalRings(getarc(basetopology, b), getarc(shattertopology, s)) }

  // An arc in either topology might be sub-divided by a set of arcs in the other topology.
  // In the case of the base topology, only arcs that are referenced by the replaced objects
  // are candidates for this replacement, so we can optimize processing by looking at only them.
  // We also need to map duplicate arcs in the (presumably smaller) shattering topology to
  // their equivalent arcs in the base topology (again, the only candidates for being duplicates
  // are the referenced arcs in the shattered objects (although they might occur in not-shattered
  // contiguous objects so we walk the whole arc set to check for replacements).

  // To find arcs that might have been subdivided, we look for arcs that have a start or end
  // point that was an interior point of the other arc set.
  // Any arcs that have not been sub-divided then have some mapping.

  var baseInterior = new Map(); // hashed interior point to arc
  var baseArcs = new Map();     // arc to arc mapping set
  var baseEnds = new Map();     // hashed endpoint to set of arcs with that endpoint
  var shatInterior = new Map(); // hashed interior point to arc
  var shatArcs = new Map();     // arc to arc mapping set
  forAllArcPoints({ topology: basetopology, objects, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
        if (i == 0 || i == npoints-1) // start or end point
        {
          if (i == 0) baseArcs.set(arc, new Set());
          let h = hashPoint(point);
          if (! baseEnds.has(h))
            baseEnds.set(h, new Set());
          baseEnds.get(h).add(arc);
        }
        else
          baseInterior.set(hashPoint(point), arc);
      });
  forAllArcPoints({ topology: shattertopology, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
        if (i == 0) // start point
          shatArcs.set(arc, new Set());
        else if (i != npoints-1) // interior points
          shatInterior.set(hashPoint(point), arc);
      });
  forAllArcPoints({ topology: basetopology, objects, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
        if ((i == 0 || i == npoints-1) && shatInterior.has(hashPoint(point)))
          baseArcs.get(arc).add(shatInterior.get(hashPoint(point)));
      });
  forAllArcPoints({ topology: shattertopology, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
        if ((i == 0 || i == npoints-1) && baseInterior.has(hashPoint(point)))
          shatArcs.get(arc).add(baseInterior.get(hashPoint(point)));
      });
  forAllArcPoints({ topology: shattertopology, onlyOnce: true, walkPoints: true },
     (topology, object, arc, i, npoints, point) => {
        if (i == 0 && shatArcs.get(arc).size == 0)
        {
          var done = false;
          var baseCandidates = baseEnds.get(hashPoint(point));
          if (baseCandidates) baseCandidates.forEach(basearc => {
              if (!done && equalArcs(basearc, arc))
              {
                done = true;
                shatArcs.get(arc).add(basearc);
              }
            });
        }
     });

  // Copy new shattering objects
  for (var id in shattertopology.objects) {
    var o = shattertopology.objects[id];
    topology.objects[id] = Object.assign({}, o);
  }

  // Determine how much base and shattering packed indices will grow in order to
  // determine how much larger packedindices buffer needs to be.
  var nExtra = 0;
  forAllArcPoints({ topology: basetopology },
    (topology, object, arc) => {
        let replacements = baseArcs.get(arc);
        if (replacements && replacements.size)
          nExtra += replacements.size-1;
      });
  forAllArcPoints({ topology: shattertopology },
    (topology, object, arc) => {
        let replacements = shatArcs.get(arc);
        nExtra += replacements.size-1;
      });

  var l1 = basetopology.packed.arcindices.length;
  var l2 = shattertopology.packed.arcindices.length;
  var ab = new ArrayBuffer((l1 + l2 + nExtra) * 4);
  var ai = new Int32Array(ab);
  topology.packed.arcindices = ai;
  var k = 0;

  function copyMultiPolygon(src, ksrc, splices, delta, mapdelta) {
    var korig = k;
    var npoly = src[ksrc++];
    ai[k++] = npoly;
    for (var i = 0; i < npoly; i++)
      copyPolygon(src, ksrc, splices, delta, mapdelta);
    return korig;
  }

  function copyPolygon(src, ksrc, splices, delta, mapdelta) {
    var korig = k;
    var nring = src[ksrc++];
    ai[k++] = nring;
    for (var i = 0; i < nring; i++)
      copyRing(src, ksrc, splices, delta, mapdelta);
    return korig;
  }

  function copyRing(src, ksrc, splices, delta, mapdelta) {
    var narc = src[ksrc++];
    ai[k++] = narc;
    for (var i = 0; i < narc; i++)
    {
      let arc = src[ksrc++];
      let splice = splices.get(arc);
      if (splice && splice.size)
        splice.forEach(a => ai[k++] = a + mapdelta);
      else
        ai[k++] = arc + delta;
    }
  }

  topology.objects = {};

  function copyObjects(src, objects, filterout, splices, delta, mapdelta) {
    for (var id in objects) {
      var o = objects[id];
      if (filterout && ! filterout[id])
      {
        o = Object.assign({}, o);
        topology.objects[id] = o;
        switch (o.type) {
          case 'MultiPolygon':
            o.packedarcs = copyMultiPolygon(src, o.packedarcs, splices, delta, mapdelta);
            break;
          case 'Polygon':
            o.packedarcs = copyPolygon(src, o.packedarcs, splices, delta, mapdelta);
            break;
        }
      }
    }
  }

  // Copy base objects, filtering out replaced objects
  var delta = basetopology.packed.arcs[0]; // offset all shatter arcs by number of base arcs
  copyObjects(basetopology.packed.arcindices, basetopology.objects, objects, baseArcs, 0, delta);
  // Copy shatter objects
  copyObjects(shattertopology.packed.arcindices, shattertopology.objects, null, shatArcs, delta, 0);

  return topology;
}
