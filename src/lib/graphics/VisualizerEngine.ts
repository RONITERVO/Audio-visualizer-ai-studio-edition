import { getEnergy, idleEnergy } from "../utils";

interface Drop {
  x: number; y: number; z: number;
  speed: number; length: number;
}

interface Splat {
  x: number; y: number;
  life: number; maxLife: number;
}

interface Drip {
  x: number; y: number;
  life: number; size: number;
}

export class VisualizerEngine {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  rafId: number = 0;
  lastTime: number = performance.now();

  smoothedBins: Float32Array = new Float32Array(32);

  drops: Drop[] = [];
  splats: Splat[] = [];
  drips: Drip[] = [];
  waterLevels: Float32Array = new Float32Array(64); // Puddles

  colors = {
    ink: 'rgba(35, 30, 28, 0.85)',
    inkLight: 'rgba(35, 30, 28, 0.3)',
    rain: 'rgba(24, 75, 165, 0.35)', // Faint blueprint ink
    sun: 'rgba(230, 160, 40, 0.6)' // Warm graphite/watercolor sun
  };

  init(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (this.canvas) this.ctx = this.canvas.getContext('2d');
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  jitterVal(x: number, y: number, amp: number, time: number) {
    const frame = Math.floor(time * 12) % 3;
    const seed = x * 12.9898 + y * 78.233 + frame * 13.131;
    const h = Math.sin(seed) * 43758.5453;
    return ((h - Math.floor(h)) - 0.5) * amp;
  }

  drawFrame(analyser: AnalyserNode | null, dataFrequency: Uint8Array | null, dataTime: Uint8Array | null) {
    this.resize();
    if (!this.ctx || !this.canvas) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const t = now / 1000;

    const width = this.canvas.width; const height = this.canvas.height;
    const ratio = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.save();
    this.ctx.scale(ratio, ratio);

    const w = width / ratio; const h = height / ratio;

    let frequency = null;
    let dominantBin = 0;
    let maxBinVal = 0;

    if (analyser && dataFrequency && dataTime) {
      analyser.getByteFrequencyData(dataFrequency);
      analyser.getByteTimeDomainData(dataTime);
      frequency = dataFrequency;

      // Find dominant frequency for cloud coloring
      for (let i = 0; i < 32; i++) {
        if (frequency[i] > maxBinVal) {
          maxBinVal = frequency[i];
          dominantBin = i;
        }
      }
    }

    const energy = frequency ? getEnergy(frequency, 3, frequency.length * 0.72) : idleEnergy(t);
    const bass = frequency ? getEnergy(frequency, 0, 8) : idleEnergy(t + 2) * 0.7;
    const treble = frequency ? getEnergy(frequency, 20, 32) : idleEnergy(t + 1) * 0.5;

    for (let i = 0; i < 32; i++) {
      const target = frequency ? (frequency[i] / 255) : Math.abs(Math.sin(t + i * 0.2)) * 0.2;
      this.smoothedBins[i] += (target - this.smoothedBins[i]) * 15 * dt;
    }

    // Dynamic Cloud Hue (Changes based on what note/pitch is loudest)
    const targetHue = (dominantBin / 32) * 360;

    // Find the text bounding box to act as an umbrella
    const textEl = document.querySelector('.lyric-wrap');
    let textRect = null;
    if (textEl) {
      const rect = textEl.getBoundingClientRect();
      // Slightly contract the hitbox so rain looks like it hits the letters directly
      textRect = { left: rect.left + 10, right: rect.right - 10, top: rect.top + 10, bottom: rect.bottom };
    }

    // Render Story Layers
    this.drawAliveSun(this.ctx, w, h, t, frequency, energy, bass, treble);
    this.drawWatercolorClouds(this.ctx, w, h, t, targetHue, energy);
    this.processStorm(this.ctx, w, h, energy, dt, t, textRect);

    this.ctx.restore();
  }

  // 1. The Sun & Rays (The beating heart of the track)
  drawAliveSun(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, frequency: Uint8Array | null, energy: number, bass: number, treble: number) {
    const cx = w * 0.5;
    const cy = h * 0.25; // Placed higher up, behind clouds
    const maxDimension = Math.max(w, h);
    const baseRadius = maxDimension * (0.1 + bass * 0.05);
    const maxLift = maxDimension * (0.05 + energy * 0.1);
    const points = 90;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw Rays (Treble reactive)
    ctx.beginPath();
    const rayCount = 36;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + (t * 0.05); // Slow rotation
      const inner = baseRadius * 1.1;
      // Rays shoot out significantly on high energy/treble
      const outer = inner + (maxDimension * 0.1) + (treble * maxDimension * 0.4) + Math.sin(t * 5 + i) * 20;

      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(
        cx + Math.cos(angle) * outer + this.jitterVal(cx, cy, 10, t),
        cy + Math.sin(angle) * outer + this.jitterVal(cy, cx, 10, t)
      );
    }
    ctx.strokeStyle = this.colors.sun;
    ctx.lineWidth = 1 + energy * 3;
    ctx.globalAlpha = 0.3 + energy * 0.4;
    ctx.stroke();

    // Draw Sun Core (Bass reactive)
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const percent = i / points;
        const angle = percent * Math.PI * 2;
        const sourceIndex = frequency ? Math.floor(percent * (frequency.length * 0.5)) : 0;
        const value = frequency ? frequency[sourceIndex] / 255 : 0.18 + 0.05 * Math.sin(t * 1.7 + i);

        const wobble = Math.sin(t * 2 + i * 0.2 + pass) * maxDimension * 0.01;
        const radius = baseRadius + value * maxLift + wobble;

        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        if (i === 0) ctx.moveTo(x + this.jitterVal(x, y, 2, t), y);
        else ctx.lineTo(x + this.jitterVal(x, y, 2, t), y);
      }
      ctx.closePath();
      ctx.strokeStyle = pass === 1 ? this.colors.ink : this.colors.sun;
      ctx.globalAlpha = pass === 1 ? 0.8 : 0.5;
      ctx.lineWidth = pass === 1 ? 2 : 4 + bass * 10;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Adaptive Watercolor Clouds
  drawWatercolorClouds(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hue: number, energy: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'blur(10px)'; // Deep paper bleed

    const segments = 16; // Fewer, larger clouds for mobile
    const segW = w / segments;

    for (let i = 0; i < segments; i++) {
      const val = this.smoothedBins[i * 2] || 0; // Skip to space them out
      if (val < 0.05) continue;

      const lightness = 70 - (val * 30);
      // Saturation increases with track energy, Hue changes with track pitch
      const saturation = 40 + (energy * 40);
      const opacity = Math.min(1, val * 1.2);

      ctx.fillStyle = `hsla(${hue + (i * 2)}, ${saturation}%, ${lightness}%, ${opacity})`;

      const cx = i * segW + (segW / 2);
      // Hanging from the top of the screen
      const cy = -20 + (val * h * 0.15) + Math.sin(t + i) * 20;
      const radius = (w * 0.15) + (val * w * 0.2);

      ctx.beginPath();
      for (let j = 0; j <= 12; j++) {
        let angle = (j / 12) * Math.PI * 2;
        let noise = Math.sin(angle * 3 + t) * 0.2;
        let r = radius * (1 + noise);

        // Flatten tops so they stick to ceiling
        if (angle > Math.PI && angle < Math.PI * 2) r *= 0.2;

        let px = cx + Math.cos(angle) * r;
        let py = Math.min(cy + Math.sin(angle) * r, cy + r);

        if (j === 0) ctx.moveTo(px, py);
        else ctx.bezierCurveTo(
          cx + Math.cos(angle - 0.2) * r, cy + Math.sin(angle - 0.2) * r,
          px, py, px, py
        );
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. 3D Rain, Splats, and Puddles
  processStorm(ctx: CanvasRenderingContext2D, w: number, h: number, energy: number, dt: number, t: number, textRect: any) {
    // Spawning Rain
    for (let i = 0; i < 32; i += 2) {
      const val = this.smoothedBins[i];
      const dropsToSpawn = Math.floor(val * 4) + (Math.random() < val ? 1 : 0);

      for (let d = 0; d < dropsToSpawn; d++) {
        const z = 0.5 + Math.random(); // Parallax depth
        this.drops.push({
          x: (i / 32) * w + (Math.random() * (w / 16)),
          y: -10, // Spawn above screen
          z: z,
          speed: h * 0.8 * z + (energy * h * 0.5), // Scales with screen height
          length: (h * 0.02) * z + (val * h * 0.03)
        });
      }
    }

    ctx.save();
    ctx.lineCap = 'round';

    // Puddle Drainage & Overflow
    for (let i = 0; i < this.waterLevels.length; i++) {
      this.waterLevels[i] = Math.max(0, this.waterLevels[i] - 20 * dt);
      if (this.waterLevels[i] > h * 0.1 && Math.random() < 0.1) {
        this.drips.push({
          x: (i / this.waterLevels.length) * w,
          y: h,
          life: 1.0,
          size: w * 0.005 + Math.random() * (w * 0.01)
        });
        this.waterLevels[i] -= h * 0.05;
      }
    }

    // Fast batch drawing for rain
    ctx.beginPath();
    ctx.strokeStyle = this.colors.rain;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      let drop = this.drops[i];
      drop.y += drop.speed * dt;

      let hitText = false;
      // Text acts as an umbrella!
      if (textRect && drop.y > textRect.top && drop.y < textRect.bottom && drop.x > textRect.left && drop.x < textRect.right) {
        hitText = true;
      }
      let hitFloor = drop.y > h;

      if (hitText || hitFloor) {
        // Smaller splats for text, larger for floor
        const splatLife = hitText ? 0.1 : 0.2;
        this.splats.push({ x: drop.x, y: hitFloor ? h : drop.y, life: splatLife, maxLife: splatLife });
        if (hitFloor) {
          const segment = Math.floor((drop.x / w) * this.waterLevels.length);
          if (segment >= 0 && segment < this.waterLevels.length) {
            this.waterLevels[segment] += drop.z * 3; // Add volume to puddle
          }
        }
        this.drops.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = drop.z * 0.6;
      ctx.lineWidth = drop.z * 1.5;
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + (drop.speed * 0.03 * energy), drop.y + drop.length); // Wind skew
    }
    ctx.stroke();

    // Draw Splats
    ctx.globalAlpha = 0.5;
    for (let i = this.splats.length - 1; i >= 0; i--) {
      let splat = this.splats[i];
      splat.life -= dt;
      if (splat.life <= 0) { this.splats.splice(i, 1); continue; }

      const progress = 1 - (splat.life / splat.maxLife);
      const radius = progress * (w * 0.015);

      ctx.beginPath();
      ctx.ellipse(splat.x, splat.y, radius * 1.5, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = this.colors.inkLight;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw Puddles (Squigglevision Wave)
    ctx.beginPath();
    ctx.fillStyle = this.colors.rain;
    ctx.moveTo(0, h);
    for (let i = 0; i < this.waterLevels.length; i++) {
      let px = (i / this.waterLevels.length) * w;
      let pLevel = this.waterLevels[i];
      let py = h - pLevel + this.jitterVal(px, h, pLevel * 0.1, t);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(w, h);
    ctx.fill();
    // Puddle surface outline
    ctx.beginPath();
    ctx.strokeStyle = this.colors.ink;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < this.waterLevels.length; i++) {
      let px = (i / this.waterLevels.length) * w;
      let pLevel = this.waterLevels[i];
      let py = h - pLevel + this.jitterVal(px, h, pLevel * 0.1, t);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw Drips (Falling off screen onto user's feet)
    ctx.fillStyle = this.colors.inkLight;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      let drip = this.drips[i];
      drip.life -= dt;
      drip.y += (1 - drip.life) * (h * 0.5) * dt;

      if (drip.life <= 0) { this.drips.splice(i, 1); continue; }

      ctx.globalAlpha = drip.life;
      ctx.beginPath();
      ctx.arc(drip.x, drip.y, drip.size, 0, Math.PI);
      ctx.lineTo(drip.x, drip.y - drip.size * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}