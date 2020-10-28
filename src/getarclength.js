// getarclength

export default function(topology) {
  if (topology.arcs !== undefined) return topology.arcs.length;
  let af = topology.packed.arcs; // as Float64Array;
  return af[0];
}
