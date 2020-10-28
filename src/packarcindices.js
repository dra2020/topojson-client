// packArcIndices

function ringSize(indices) {
  return 1 + indices.length;
}

function packRing(indices, ai, z) {
  ai[z++] = indices.length;
  indices.forEach(i => ai[z++] = i);
  return z;
}

function polygonSize(indices) {
  var z = 1;  // number of rings
  indices.forEach(i => { z += ringSize(i) });
  return z;
}

function packPolygon(indices, ai, z) {
  ai[z++] = indices.length;
  indices.forEach(i => { z = packRing(i, ai, z) });
  return z;
}

function multipolygonSize(indices) {
  var z = 1; // number of polygons
  indices.forEach(i => { z += polygonSize(i) });
  return z;
}

function packMultipolygon(indices, ai, z) {
  ai[z++] = indices.length;
  indices.forEach(i => { z = packPolygon(i, ai, z) });
  return z;
}

function bufferSize(topology) {
  var z = 0;
  var geos = topology.objects;
  for (var key in geos) {
    var g = geos[key];
    switch (g.type) {
      case "Polygon": z += polygonSize(g.arcs); break;
      case "MultiPolygon": z += multipolygonSize(g.arcs); break;
    }
  }
  return z;
}

export default function(topology) {
  // Convert arcs field in each geometry to a packed representation that specifies type:
  //    the unpacked form for the "arcs" field in each geometry object in the topology.geometries array is:
  //      line: array of arc indices
  //      multiline: array of array of arc indices
  //      polygon: array of array of arc indices
  //      multipolygon: array of array of array of arc indices
  //  The form of the buffer is an array of signed 32-bit integers:
  //    [Geometry descriptions]*
  //  Where each geometry description is:
  //    multipolygon:
  //      number of polgyons
  //      polygons*
  //    polygon:
  //      number of rings
  //      rings*
  //    ring:
  //      number of indices
  //      indices

  if (topology == null
      || topology.objects === undefined
      || topology.packed && topology.packed.arcindices !== undefined)
    return topology;
  var geos = topology.objects;
  var nInts = bufferSize(topology);
  var ab = new ArrayBuffer(nInts * 4);
  var ai = new Int32Array(ab);
  var z = 0;
  for (var key in geos) {
    var g = geos[key];
    switch (g.type) {
      case 'MultiPolygon':
        g.packedarcs = z;
        z = packMultipolygon(g.arcs, ai, z);
        delete g.arcs;
        break;
      case 'Polygon':
        g.packedarcs = z;
        z = packPolygon(g.arcs, ai, z);
        delete g.arcs;
        break;
      default:
        throw `geometry type ${g.type} not supported by packArcIndices`
    }
  }
  if (z !== nInts)
    throw 'packArcIndices: packing error';
  if (topology.packed === undefined) topology.packed = {};
  topology.packed.arcindices = ai;
  return topology;
}
