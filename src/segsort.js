import pointSort from "./pointsort.js"

export default function(s1, s2) { return pointSort(s1.s, s2.s) || pointSort(s1.e, s2.e) }
