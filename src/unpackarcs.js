// unpackArcs
// see packarcs.js for description of packed format

export default function(topology) {
  if (topology == null || topology.packed === undefined || topology.packed.arcs === undefined) return topology;
  var af = topology.packed.arcs;
  var nArcs = af[0];
  var arcs = new Array(nArcs);
  var z = 1;
  var i;
  for (i = 0; i < nArcs; i++) {
    var nPoints = af[z++];
    var zpoint = af[z++];
    var a = new Array(nPoints);
    var j;
    for (j = 0; j < nPoints; j++)
      a[j] = [ af[zpoint++], af[zpoint++] ];
    arcs[i] = a;
  }
  delete topology.packed.arcs;
  if (Object.keys(topology.packed).length == 0) delete topology.packed;
  topology.arcs = arcs;
  return topology;
}
