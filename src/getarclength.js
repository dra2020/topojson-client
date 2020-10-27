// getarclength

export default function(topology) {
  if (topology.arcs !== undefined) return topology.arcs.length;
  let af = topology.packedarcs; // as Float64Array;
  return af[0];
}
