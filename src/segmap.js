// Map type using segment as key (s: [ x, y], e: [ x, y ]). Uses underlying default Map() object and chains collisions
// that occur with a pretty good int32 hashing algorithm (small tens of collisions for hundreds of thousands of GeoJSON points)
// so chaining is not necessary much and mostly get Map performance.

import pointHash from "./pointhash.js"
import segEqual from "./segequal.js"

export default function() {
  let map = new Map();
  let _length = 0;

  function has(s) {
    let i = pointHash(s.s);
    let e = map.get(i);
    for (; e; e = e.next)
      if (segEqual(e.s, s))
        return true;
    return false;
  }

  function set(s, v) {
    let i = pointHash(s.s);
    let e = map.get(i);
    for (let c = e; c; c = c.next)
      if (segEqual(c.s, s)) {
        c.v = v;
        return v;
      }
    _length++;
    map.set(i, { s: s, v: v, next: e });
    return v;
  }

  function get(s) {
    let i = pointHash(s.s);
    for (let e = map.get(i); e; e = e.next)
      if (segEqual(e.s, s))
        return e.v;
    return undefined;
  }

  function forEach(cb) {
    map.forEach(e => {
        for (; e; e = e.next)
          cb(e.v, e.s);
      });
  }

  function length() {
    return _length;
  }

  return ({ has, set, get, forEach, length });
}

