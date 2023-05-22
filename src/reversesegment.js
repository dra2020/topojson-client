
// Reverse from start to end, non-inclusive of end
export default function(a, s, e) {
  var t;
  var m = s + (e - s) / 2;
  for (e--; s < m; s++, e--)
    t = a[s], a[s] = a[e], a[e] = t;
}

