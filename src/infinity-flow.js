// A horizontal figure eight. Increasing arc distance follows the sketch:
// centre -> lower right -> upper right -> centre -> lower left -> upper left.
// Arc-length sampling keeps the stream equally quick around the bends.
export const FLOW_RATE = .075;
export const FLOW_PATH_SIZE = 1024;

export function createInfinityPath(size = FLOW_PATH_SIZE) {
 const steps = 8192, arc = new Float64Array(steps + 1);
 let previous = [0, 0];
 for (let i = 1; i <= steps; i++) {
  const t = i / steps * Math.PI * 2, p = [Math.sin(t), -.46 * Math.sin(t * 2)];
  arc[i] = arc[i - 1] + Math.hypot(p[0] - previous[0], p[1] - previous[1]);
  previous = p;
 }
 const length = arc[steps], pixels = new Float32Array(size * 4);
 let segment = 1;
 for (let i = 0; i < size; i++) {
  const distance = i / (size - 1) * length;
  while (segment < steps && arc[segment] < distance) segment++;
  const fraction = (distance - arc[segment - 1]) / (arc[segment] - arc[segment - 1]);
  const t = (segment - 1 + fraction) / steps * Math.PI * 2;
  const tx = Math.cos(t), ty = -.92 * Math.cos(t * 2), norm = Math.hypot(tx, ty);
  pixels.set([Math.sin(t), -.46 * Math.sin(t * 2), tx / norm, ty / norm], i * 4);
 }
 return {pixels, size, length};
}

export function sampleInfinityPath(path, distance) {
 const s = ((distance % 1) + 1) % 1, offset = s * (path.size - 1);
 const a = Math.floor(offset), b = Math.min(a + 1, path.size - 1), f = offset - a;
 return Array.from({length:4}, (_, k) => path.pixels[a * 4 + k] * (1 - f) + path.pixels[b * 4 + k] * f);
}

export const infinityVertex = `
attribute vec4 stream;
uniform sampler2D flowPath;
uniform float flowMix;
uniform float flowScale;
uniform vec2 flowAnchor;
varying vec2 vFlowDirection;
varying float vFlowAmount;
varying float vFlowFoam;
float waterCrest;
const float WATER_TAU = 6.28318530718;
vec4 infinitySample(float distance) {
 // Manual interpolation avoids requiring float-texture linear filtering.
 float offset = fract(distance) * ${FLOW_PATH_SIZE - 1}.0;
 float texel = floor(offset);
 vec4 a = texture2D(flowPath, vec2((texel + .5) / ${FLOW_PATH_SIZE}.0, .5));
 vec4 b = texture2D(flowPath, vec2((texel + 1.5) / ${FLOW_PATH_SIZE}.0, .5));
 return mix(a, b, fract(offset));
}
vec3 infinityPosition(float clock) {
 float s = fract(stream.x + clock * ${FLOW_RATE} * stream.w);
 vec4 path = infinitySample(s);
 vec2 tangent = normalize(path.zw), normal = vec2(-tangent.y, tangent.x);
 float phase = s * WATER_TAU * 4.0 - clock * 1.47
  + .75 * sin(s * WATER_TAU - clock * .23)
  + .25 * sin(s * WATER_TAU * 9.0 + clock * .30);
 waterCrest = pow(.5 + .5 * sin(phase), 7.0);
 float swell = sin(s * WATER_TAU * 2.0 - clock * .80 + .75 * sin(s * WATER_TAU + clock * .21));
 float chop = sin(s * WATER_TAU * 9.0 - clock * 3.2 + .35 * sin(phase * 2.0));
 float curl = sin(s * WATER_TAU * 14.0 - clock * 2.4 + stream.y * 90.0 + grain * 1.7);
 // Unequal travelling fronts widen and buckle the water rather than blinking
 // a perfectly uniform tube. Bounds leave space for the buffer typography.
 float lane = clamp(stream.y * (1.0 + .58 * waterCrest + .20 * swell)
  + .012 * swell + .008 * chop + .003 * curl, -.09, .09);
 float cycle = fract(clock * .43 + stream.x * 11.0 + grain * 7.0);
 float flight = sin(cycle * 3.14159);
 float foam = step(.88, grain);
 float fade = smoothstep(.02, .18, cycle) * (1.0 - smoothstep(.72, 1.0, cycle));
 float side = stream.y >= 0.0 ? 1.0 : -1.0;
 float spray = foam * flight * (.010 + .045 * waterCrest);
 lane += side * spray;
 vFlowFoam = foam * fade * (.20 + .80 * waterCrest);
 vFlowDirection = vec2(tangent.x, -tangent.y);
 vec2 p = path.xy + normal * lane
  + tangent * foam * flight * (.006 + .014 * waterCrest) * sin(grain * 97.0);
 // The two crossing strands have a small separation in depth.
 float bridge = .040 * tangent.x * exp(-path.x * path.x * 24.0);
 return vec3(p * flowScale + flowAnchor, (bridge + stream.z) * flowScale);
}
`;
