// The force lives in CSS screen coordinates, so its footprint stays circular
// across perspective, chapter transforms, viewport changes and pixel ratios.
// It changes the rendered position only; source data and target buffers stay fixed.
import {IMPACT_CAPACITY,IMPACT_LIFETIME} from './impact-field.js';
export const fieldVertex = `
uniform vec2 fieldViewport;
uniform vec2 fieldPointer;
uniform float fieldRadius;
uniform float fieldStrength;
uniform float fieldClock;
uniform float fieldDpr;
uniform vec4 fieldImpacts[${IMPACT_CAPACITY}];
uniform vec2 fieldImpactDirections[${IMPACT_CAPACITY}];
varying float vFieldTwinkle;
float fieldSeed(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
void applyParticleField(inout vec4 clip, float seed, float diameter, float drift) {
  float phase = seed * 6.2831853;
  // Independent, slow luminance cycles with a brief brighter crest.
  // No hard on/off flashes, synchronous pulses or colour changes.
  float wave = .5 + .5 * sin(fieldClock * (1.6 + fract(seed * 13.) * 1.3) + phase * 11.);
  vFieldTwinkle = .32 + .74 * wave + .50 * pow(wave, 12.);
  if (clip.w <= 0.) return;
  vec2 pixel = (clip.xy / clip.w * .5 + .5) * fieldViewport;
  pixel += drift * 2.6 * (vec2(sin(fieldClock + phase), cos(fieldClock * .87 + phase * 3.))
    + .28 * vec2(sin(fieldClock * 1.65 + phase * 7.), cos(fieldClock * 1.32 + phase * 5.)));
  vec2 original = pixel;
  if (fieldStrength > .005) {
    vec2 delta = pixel - fieldPointer;
    float distance = length(delta);
    float radius = fieldRadius * fieldStrength + diameter * .5;
    if (distance < radius * 3.5) {
      vec2 direction = distance > .001 ? delta / distance : vec2(cos(phase), sin(phase));
      // A continuous radial mapping: points at the centre move to the rim,
      // while distant points feel a progressively smaller outward force.
      float ratio = distance / radius;
      float outward = radius * sqrt(sqrt(ratio * ratio * ratio * ratio + 1.)) - distance;
      outward *= 1. - smoothstep(radius * 2.5, radius * 3.5, distance);
      pixel += direction * outward;
    }
  }
  // An impact sets an initial velocity. Its spring response first travels
  // outward, then reverses and decays, even with a completely stationary mouse.
  vec2 impactOffset = vec2(0.);
  float influence = max(28., fieldRadius * 2.4);
  for (int i = 0; i < ${IMPACT_CAPACITY}; i++) {
    vec4 hit = fieldImpacts[i];
    float age = fieldClock - hit.z;
    if (hit.w <= 0. || age < 0. || age >= ${IMPACT_LIFETIME.toFixed(1)}) continue;
    vec2 delta = original - hit.xy;
    float distance = length(delta);
    if (distance >= influence) continue;
    vec2 radial = distance > .001 ? delta / distance : vec2(cos(phase), sin(phase));
    vec2 direction = radial * .85 + fieldImpactDirections[i] * .60;
    float weight = 1. - distance / influence;
    float spring = exp(-3.3 * age) * sin(10.8 * age) / 10.8;
    impactOffset += normalize(direction) * hit.w * weight * weight * spring;
  }
  float travel = length(impactOffset);
  if (travel > 120.) impactOffset *= 120. / travel;
  pixel += impactOffset;
  // The small hole is a collision boundary: the spring's returning motion
  // may settle at the rim but must never carry particles through the cursor.
  if (fieldStrength > .005) {
    vec2 delta = pixel - fieldPointer;
    float distance = length(delta);
    float radius = fieldRadius * fieldStrength + diameter * .5;
    if (distance < radius) pixel = fieldPointer + (distance > .001 ? delta / distance : vec2(cos(phase),sin(phase))) * radius;
  }
  clip.xy = (pixel / fieldViewport * 2. - 1.) * clip.w;
}`;

export const fieldFragment = `
uniform vec2 fieldPointer;
uniform float fieldRadius;
uniform float fieldStrength;
uniform float fieldDpr;
varying float vFieldTwinkle;
void maskParticleHole() {
  if (fieldStrength > .005 && distance(gl_FragCoord.xy / fieldDpr, fieldPointer)
      < fieldRadius * fieldStrength) discard;
}`;

export const earthVisibility = `
uniform vec3 earthCameraLocal;
varying float vEarthVisible;
`;

// CPU counterpart for event picking. The small drift is included; a few
// pixels of hit tolerance accommodate GPU float precision in the seed hash.
export function particleSeed(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
export function displaceParticlePixel(x, y, seed, diameter, uniforms, drift = .55) {
  const time = uniforms.fieldClock.value, phase = seed * 6.2831853;
  x += drift * 2.6 * (Math.sin(time + phase) + .28 * Math.sin(time * 1.65 + phase * 7));
  y += drift * 2.6 * (Math.cos(time * .87 + phase * 3) + .28 * Math.cos(time * 1.32 + phase * 5));
  const originalX = x, originalY = y;
  if (uniforms.fieldStrength.value > .005) {
    const dx = x - uniforms.fieldPointer.value.x, dy = y - uniforms.fieldPointer.value.y;
    const distance = Math.hypot(dx, dy), radius = uniforms.fieldRadius.value * uniforms.fieldStrength.value + diameter * .5;
    if (distance < radius * 3.5) {
      const ratio = distance / radius, f = Math.max(0, Math.min(1, (distance / radius - 2.5)));
      const outward = (radius * Math.sqrt(Math.sqrt(ratio ** 4 + 1)) - distance) * (1 - f * f * (3 - 2 * f));
      x += (distance > .001 ? dx / distance : Math.cos(phase)) * outward;
      y += (distance > .001 ? dy / distance : Math.sin(phase)) * outward;
    }
  }
  let offsetX = 0, offsetY = 0;
  const influence = Math.max(28, uniforms.fieldRadius.value * 2.4);
  for (let i = 0; i < IMPACT_CAPACITY; i++) {
    const hit = uniforms.fieldImpacts.value[i], age = time - hit.z;
    if (hit.w <= 0 || age < 0 || age >= IMPACT_LIFETIME) continue;
    const dx = originalX - hit.x, dy = originalY - hit.y, distance = Math.hypot(dx, dy);
    if (distance >= influence) continue;
    const direction = uniforms.fieldImpactDirections.value[i];
    let vx = (distance > .001 ? dx / distance : Math.cos(phase)) * .85 + direction.x * .60;
    let vy = (distance > .001 ? dy / distance : Math.sin(phase)) * .85 + direction.y * .60;
    const length = Math.hypot(vx,vy), weight = 1 - distance / influence;
    const spring = Math.exp(-3.3 * age) * Math.sin(10.8 * age) / 10.8;
    offsetX += vx / length * hit.w * weight * weight * spring;
    offsetY += vy / length * hit.w * weight * weight * spring;
  }
  const travel = Math.hypot(offsetX,offsetY), scale = travel > 120 ? 120 / travel : 1;
  x += offsetX * scale; y += offsetY * scale;
  if (uniforms.fieldStrength.value > .005) {
    const dx=x-uniforms.fieldPointer.value.x,dy=y-uniforms.fieldPointer.value.y,distance=Math.hypot(dx,dy);
    const radius=uniforms.fieldRadius.value*uniforms.fieldStrength.value+diameter*.5;
    if(distance<radius){x=uniforms.fieldPointer.value.x+(distance>.001?dx/distance:Math.cos(phase))*radius;y=uniforms.fieldPointer.value.y+(distance>.001?dy/distance:Math.sin(phase))*radius}
  }
  return [x, y];
}

// Three.js point materials share the same screen-space field as the main
// cloud. Hidden depth surfaces are deformed too, preserving their occlusion.
export function attachField(material, uniforms, {points = false, earth = false} = {}) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = fieldVertex + '\n' + (earth ? earthVisibility : '') + shader.vertexShader;
    if (points) {
      shader.vertexShader = shader.vertexShader.replace('#include <logdepthbuf_vertex>', `
        applyParticleField(gl_Position, fieldSeed(position), gl_PointSize / fieldDpr, .55);
        ${earth ? 'vEarthVisible = step(0., dot(normalize(position), earthCameraLocal - position));' : ''}
        #include <logdepthbuf_vertex>`);
      shader.fragmentShader = fieldFragment + '\n' + (earth ? 'varying float vEarthVisible;\n' : '') + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        maskParticleHole();
        ${earth ? 'if (vEarthVisible < .5) discard;' : ''}
        #include <clipping_planes_fragment>`);
      shader.fragmentShader = shader.fragmentShader.replace('outgoingLight = diffuseColor.rgb;', 'outgoingLight = diffuseColor.rgb * vFieldTwinkle;');
    } else {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        applyParticleField(gl_Position, 0., 0., 0.);`);
    }
  };
  material.customProgramCacheKey = () => `atlas-field-${points}-${earth}`;
  return material;
}
