import getarc from './getarc';
import reverseSegment from './reversesegment.js';

var validate = false;

export default function(topology) {

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
      if (arc < 0) reverseSegment(pts, 0, pts.length);
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

  if (! validate) return;
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

