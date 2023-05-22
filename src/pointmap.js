// Map type using point as key ([ x, y]). Uses underlying default Map() object and chains collisions
// that occur with a pretty good int32 hashing algorithm (small tens of collisions for hundreds of thousands of GeoJSON points)
// so chaining is not necessary much.

let buffer = new ArrayBuffer(16), floats = new Float64Array(buffer), uints = new Uint32Array(buffer);
function hashPoint(point) {
  floats[0] = point[0];
  floats[1] = point[1];
  var hash = uints[0] ^ uints[1];
  hash = hash << 5 ^ hash >> 7 ^ uints[2] ^ uints[3];
  return hash & 0x7fffffff;
}

export default function() {
  let map = new Map();

  function equalPoint(p1, p2) { return p1[0] == p2[0] && p1[1] == p2[1] }

  function has(p) {
    let i = hashPoint(p);
    let e = map.get(i);
    for (; e; e = e.next)
      if (equalPoint(e.p, p))
        return true;
    return false;
  }

  function set(p, v) {
    let i = hashPoint(p);
    let e = map.get(i);
    for (let c = e; c; c = c.next)
      if (equalPoint(c.p, p)) {
        c.v = v;
        return;
      }
    map.set(i, { p: p, v: v, next: e });
  }

  function get(p) {
    let i = hashPoint(p);
    for (let e = map.get(i); e; e = e.next)
      if (equalPoint(e.p, p))
        return e.v;
    return undefined;
  }

  function forEach(cb) {
    map.forEach(e => {
        for (; e; e = e.next)
          cb(e.v, e.p);
      });
  }

  return ({ has, set, get, forEach });
}

