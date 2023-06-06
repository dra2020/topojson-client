import pointSort from "./pointsort.js"

export default function(ps, pe) { return pointSort(ps, pe) < 0 ? { s: ps, e: pe } : { s: pe, e: ps } }
