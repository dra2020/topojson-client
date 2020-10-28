export default function (topology, o) {
  if (o.arcs) return o.arcs;
  if (topology.packed && topology.packed.arcindices && o.packedarcs !== undefined) {
    var ai = topology.packed.arcindices;
    switch (o.type) {
      case 'MultiPolygon':
        return unpackMultipolygon(ai, o.packedarcs);
      case 'Polygon':
        return unpackPolygon(ai, o.packedarcs).indices;
      default: throw `getobjectarcs: ${o.type} not supported`;
    }
  }
  return [];
}

function unpackMultipolygon(ai, z) {
  var n = ai[z++];
  var indices = new Array(n);
  for (var j = 0; j < n; j++)
  {
    var res = unpackPolygon(ai, z);
    indices[j] = res.indices;
    z = res.z;
  }
  return indices;
}

function unpackPolygon(ai, z) {
  var n = ai[z++];
  var indices = new Array(n);
  for (var j = 0; j < n; j++)
  {
    var res = unpackRing(ai, z);
    indices[j] = res.indices;
    z = res.z;
  }
  return { indices: indices, z: z };
}

function unpackRing(ai, z) {
  var n = ai[z++];
  var indices = new Array(n);
  for (var j = 0; j < n; j++)
    indices[j] = ai[z++];
  return { indices: indices, z: z };
}
