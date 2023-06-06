// getpoint

export default function(topology, i, n) {
  if (i < 0) i = ~i;
  if (topology.arcs !== undefined) return topology.arcs[i][n];
  let af = topology.packed.arcs; // as Float64Array;
  if (i >= af[0]) return undefined;
  let z = 1 + i*2;
  let npoints = af[z++];
  if (n === undefined) n = npoints-1;
  if (n < 0 || n >= npoints) return undefined;
  let zpoint = af[z] + n*2;
  return [ af[zpoint], af[zpoint+1] ];
}
