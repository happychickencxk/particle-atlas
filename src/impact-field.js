export const IMPACT_CAPACITY = 8;
export const IMPACT_LIFETIME = 2.2;

// Exact critically damped follow. Velocity survives target changes and stops,
// giving a short, soft catch-up without an extra oscillation or frame-rate dependence.
export class DampedValue {
  constructor(value = 0) { this.value = value; this.velocity = 0; }
  snap(value) { this.value = value; this.velocity = 0; return value; }
  step(target, dt, frequency) {
    const displacement = this.value - target;
    const momentum = this.velocity + frequency * displacement;
    const decay = Math.exp(-frequency * dt);
    this.value = target + (displacement + momentum * dt) * decay;
    this.velocity = (this.velocity - frequency * momentum * dt) * decay;
    return this.value;
  }
}

// Input history is the initial velocity of a damped spring, not a new target
// position. It keeps evolving after the cursor stops. The GPU and event picker
// evaluate the same closed-form response against each particle's original anchor.
export class ImpactField {
  constructor(uniforms) {
    this.uniforms = uniforms;
    this.previous = null;
    this.head = 0;
    this.lastEmission = -Infinity;
  }
  emit(x, y, time, velocity, dx, dy) {
    this.uniforms.fieldImpacts.value[this.head].set(x, y, time, velocity);
    this.uniforms.fieldImpactDirections.value[this.head].set(dx, dy);
    this.head = (this.head + 1) % IMPACT_CAPACITY;
    this.lastEmission = time;
  }
  move(x, y, time, radius) {
    const previous = this.previous;
    this.previous = {x, y, time};
    if (!previous) {
      this.emit(x, y, time, 180, 0, 0);
      return;
    }
    const dx = x - previous.x, dy = y - previous.y, distance = Math.hypot(dx, dy);
    // A long stationary dwell is not the duration of the following sweep.
    const elapsed = Math.max(.004, Math.min(.08, time - previous.time));
    const speed = Math.min(2500, distance / elapsed);
    if (distance < .5 || speed < 18) return;
    if (time - this.lastEmission < .028 && distance < radius * .7) return;
    // Sweep the intervening path too, so a fast move cannot tunnel through sand.
    const count = Math.max(1, Math.min(4, Math.ceil(distance / Math.max(10, radius * .85))));
    const f = Math.max(0, Math.min(1, (speed - 120) / 330));
    const blend = f * f * (3 - 2 * f);
    const soft = 35 + speed * .35, strike = 180 + speed * .5;
    const velocity = Math.min(1100, soft + (strike - soft) * blend) / Math.sqrt(count);
    for (let i = 1; i <= count; i++) {
      const f = i / count;
      this.emit(previous.x + dx * f, previous.y + dy * f,
        time - Math.min(elapsed, .08) * (1 - f), velocity, dx / distance, dy / distance);
    }
  }
  seed(x, y, time) {
    this.previous = {x, y, time};
  }
  release(immediate = false) {
    this.previous = null;
    if (immediate) {
      for (const packet of this.uniforms.fieldImpacts.value) packet.w = -1;
    }
  }
  resize(heightChange) {
    if (this.previous) this.previous.y += heightChange;
    for (const packet of this.uniforms.fieldImpacts.value) packet.y += heightChange;
  }
  metrics(time) {
    let count = 0, latest = null;
    for (const p of this.uniforms.fieldImpacts.value) {
      const age = time - p.z;
      if (p.w > 0 && age >= 0 && age < IMPACT_LIFETIME) {
        count++;
        if (!latest || p.z > latest.time) latest = {time:p.z, age, velocity:p.w};
      }
    }
    return {count, latest};
  }
}
