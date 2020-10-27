// getarc

export default function(topology, i) {
  if (i < 0) i = ~i;
  if (topology.arcs !== undefined) return topology.arcs[i];
  let af = topology.packedarcs; // as Float64Array;
  if (i >= af[0]) return undefined;
  let z = 1 + i*2;
  let npoints = af[z++];
  let zpoint = af[z++];
  let a = new Array(npoints);
  for (i = 0; i < npoints; i++)
    a[i] = [ af[zpoint++], af[zpoint++] ];
  return a;
}
