// unpackArcIndices
// see packarcindices.js for description of packed format
import getobjectarcs from './getobjectarcs';

export default function(topology) {
  if (topology == null
      || topology.packed === undefined
      || topology.packed.arcindices === undefined
      || topology.objects === undefined) return topology;
  for (var key in topology.objects) {
    var g = topology.objects[key];
    if (g.packedarcs !== undefined) {
      g.arcs = getobjectarcs(topology, g);
      delete g.packedarcs;
    }
  }
  delete topology.packed.arcindices;
  if (Object.keys(topology.packed).length == 0) delete topology.packed;
  return topology;
}
