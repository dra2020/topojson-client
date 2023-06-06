import pointEqual from "./pointequal.js"

export default function(s1, s2) { return pointEqual(s1.s, s2.s) && pointEqual(s1.e, s2.e) }
