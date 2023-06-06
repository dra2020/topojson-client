// cb(topology, object, arc, npoint, npoints, point)
// params: { topology, objects, onlyOnce, walkPoints }

export default function(params, cb) {
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

