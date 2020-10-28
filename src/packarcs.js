// packArcs

export default function(topology) {
  // Convert arcs (array of arrays of point arrays) to packed representation.
  // First index is length of arc array, then ForEachArc(npoints, offset to points), then points.
  // So total size of buffer (in floats) is 1 + (NumberOfArcs * 2) + (TotalNumberOfPoints)

  if (topology == null || topology.arcs === undefined) return topology;
  var nArcs = topology.arcs.length;
  var nPoints = 0;
  topology.arcs.forEach((a) => { nPoints += a.length });
  var nFloats = 1 + nArcs*2 + nPoints*2;
  var ab = new ArrayBuffer(nFloats * 8);
  var af = new Float64Array(ab);
  af[0] = nArcs;
  var z = 1;
  var zpoint = 1 + (nArcs * 2);
  topology.arcs.forEach((a) => {
      af[z++] = a.length;
      af[z++] = zpoint;
      a.forEach((pt) => {
          af[zpoint++] = pt[0];
          af[zpoint++] = pt[1];
        });
    });
  if (zpoint !== nFloats)
    throw 'topoPack: packing error';
  delete topology.arcs;
  if (topology.packed === undefined) topology.packed = {};
  topology.packed.arcs = af;
  return topology;
}
