export default function(af, validate) {
  if (! validate) return;
  let narcs = af[0];
  let zp = af[2];
  for (let i = 0; i < narcs; i++) {
    let z = 1 + i*2;
    let npoints = af[z];
    let zpoints = af[z+1];
    if (zp != zpoints)
      console.log(`toposplice: arcpacking: point index unexpected for arc ${i}`);
    zp += npoints * 2;
  }
  if (zp != af.length)
    console.log(`toposplice: arcpacking: buffer length unexpected: last used index ${zp} != actual length ${af.length}`);
}

