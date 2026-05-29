import { getEnergy, idleEnergy, pseudoRandom } from "../utils";

interface AlcoholDrop {
  x: number; y: number;
  r: number; maxR: number;
  color: string;
  life: number; maxLife: number;
  seed: number;
}

export class VisualizerEngine {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  rafId: number = 0;
  lastTime: number = performance.now();

  // State for smoothing visualizer movements
  smoothedBins: Float32Array = new Float32Array(32);
  drops: AlcoholDrop[] = [];
  lastBassHit: number = 0;

  colors = {
    ink: 'rgba(35, 30, 28, 0.85)',
    inkLight: 'rgba(35, 30, 28, 0.3)',
    blueprint: 'rgba(24, 75, 165, 0.7)',
    watercolors: [
      'hsl(200, 50%, 60%)', // Muted Cyan
      'hsl(340, 50%, 65%)', // Muted Magenta
      'hsl(35, 60%, 60%)',  // Muted Ochre
      'hsl(260, 40%, 65%)'  // Muted Purple
    ]
  };

  init(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }
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

  // --- SQUIGGLEVISION API ---
  // Seeded noise based on coordinates and time frame
  jitterVal(x: number, y: number, amp: number, time: number) {
    const frame = Math.floor(time * 10) % 3; // 10fps stop-motion feel
    const seed = x * 12.9898 + y * 78.233 + frame * 13.131;
    const h = Math.sin(seed) * 43758.5453;
    return ((h - Math.floor(h)) - 0.5) * amp;
  }

  drawRoughLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, passes: number, amp: number, time: number) {
    ctx.beginPath();
    for (let i = 0; i < passes; i++) {
      let ox1 = x1 + this.jitterVal(x1, y1 + i, amp, time);
      let oy1 = y1 + this.jitterVal(x1 + i, y1, amp, time);
      let ox2 = x2 + this.jitterVal(x2, y2 + i, amp, time);
      let oy2 = y2 + this.jitterVal(x2 + i, y2, amp, time);
      ctx.moveTo(ox1, oy1);

      let mx = (x1 + x2) / 2 + this.jitterVal((x1 + x2) / 2, (y1 + y2) / 2 + i, amp * 2, time);
      let my = (y1 + y2) / 2 + this.jitterVal((x1 + x2) / 2 + i, (y1 + y2) / 2, amp * 2, time);
      ctx.quadraticCurveTo(mx, my, ox2, oy2);
    }
    ctx.stroke();
  }

  fillCrosshatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, density: number, amp: number, time: number) {
    ctx.beginPath();
    // Diagonal lines one way
    for (let i = 0; i < w + h; i += density) {
      let startX = Math.max(x, x + i - h);
      let startY = Math.max(y, y + h - i);
      let endX = Math.min(x + w, x + i);
      let endY = Math.min(y + h, y + w + h - i);
      if (startX < endX) {
        ctx.moveTo(startX + this.jitterVal(startX, startY, amp, time), startY);
        ctx.lineTo(endX + this.jitterVal(endX, endY, amp, time), endY);
      }
    }
    ctx.stroke();
  }

  // --- CORE RENDER LOOP ---
  drawFrame(analyser: AnalyserNode | null, dataFrequency: Uint8Array | null, dataTime: Uint8Array | null) {
    this.resize();
    if (!this.ctx || !this.canvas) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap dt
    this.lastTime = now;
    const t = now / 1000;

    const width = this.canvas.width; const height = this.canvas.height;
    const ratio = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.save();
    this.ctx.scale(ratio, ratio);

    const w = width / ratio; const h = height / ratio;

    let frequency = null; let timeData = null;
    if (analyser && dataFrequency && dataTime) {
      analyser.getByteFrequencyData(dataFrequency);
      analyser.getByteTimeDomainData(dataTime);
      frequency = dataFrequency; timeData = dataTime;
    }

    const energy = frequency ? getEnergy(frequency, 3, frequency.length * 0.72) : idleEnergy(t);
    const bass = frequency ? getEnergy(frequency, 0, 10) : idleEnergy(t + 2) * 0.7;

    // Smooth the frequency bins for architectural rendering
    for (let i = 0; i < 32; i++) {
      const target = frequency ? (frequency[i] / 255) : Math.abs(Math.sin(t + i * 0.2)) * 0.3;
      this.smoothedBins[i] += (target - this.smoothedBins[i]) * 12 * dt;
    }

    // Render Layers: Back to Front
    this.processWatercolors(this.ctx, w, h, bass, dt);
    this.drawAliveCore(this.ctx, w, h, t, frequency, energy, bass);
    this.drawArchitecturalSkyline(this.ctx, w, h, energy, t);
    this.drawFloatingWave(this.ctx, w, h, timeData, energy, t);

    this.ctx.restore();
  }

  // 1. Age of War style Watercolors (Rendered "behind" the paper)
  processWatercolors(ctx: CanvasRenderingContext2D, w: number, h: number, bass: number, dt: number) {
    if (bass > 0.7 && performance.now() - this.lastBassHit > 400) {
      this.lastBassHit = performance.now();
      if (Math.random() < 0.6) {
        this.drops.push({
          x: w * (0.15 + Math.random() * 0.7),
          y: h * (0.2 + Math.random() * 0.6),
          r: 20,
          maxR: 200 + Math.random() * 400,
          color: this.colors.watercolors[Math.floor(Math.random() * this.colors.watercolors.length)],
          life: 3.0,
          maxLife: 3.0 + Math.random() * 2.0,
          seed: Math.random() * 1000
        });
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'blur(4px)'; // Simulate being on the back side of thin paper

    for (let i = this.drops.length - 1; i >= 0; i--) {
      let drop = this.drops[i];
      drop.life -= dt;
      // Alcohol bloom physics (fast initially, slowing down)
      drop.r += (drop.maxR - drop.r) * 3 * dt;

      if (drop.life <= 0) {
        this.drops.splice(i, 1);
        continue;
      }

      // Evaporation curve
      const alpha = Math.max(0, (drop.life / drop.maxLife) * 0.08); // Very faint
      ctx.globalAlpha = alpha;
      ctx.fillStyle = drop.color;

      ctx.beginPath();
      const points = 16;
      for (let j = 0; j <= points; j++) {
        let angle = (j / points) * Math.PI * 2;
        // Seeded radius perturbation so the blob doesn't spin or shake, just scales organically
        let noise = Math.sin(angle * 3 + drop.seed) * 0.2 + Math.cos(angle * 7 + drop.seed) * 0.15;
        let currentR = drop.r * (1 + noise);

        let px = drop.x + Math.cos(angle) * currentR;
        let py = drop.y + Math.sin(angle) * currentR;

        if (j === 0) ctx.moveTo(px, py);
        else ctx.bezierCurveTo(
          drop.x + Math.cos(angle - 0.2) * currentR,
          drop.y + Math.sin(angle - 0.2) * currentR,
          px, py, px, py
        );
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. The Living Graphite Core (The Sun/Moon)
  drawAliveCore(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, frequency: Uint8Array | null, energy: number, bass: number) {
    const cx = w * 0.5;
    const cy = h * 0.45;
    const smaller = Math.min(w, h);
    const baseRadius = smaller * (0.15 + bass * 0.03);
    const maxLift = smaller * (0.15 + energy * 0.1);
    const points = 120;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const percent = i / points;
        const angle = percent * Math.PI * 2;
        const sourceIndex = frequency ? Math.floor(percent * (frequency.length * 0.5)) : 0;
        const value = frequency ? frequency[sourceIndex] / 255 : 0.18 + 0.05 * Math.sin(t * 1.7 + i);

        const wobble = Math.sin(t * 2 + i * 0.2 + pass) * smaller * 0.01;
        const radius = baseRadius + value * maxLift + wobble + pass * smaller * 0.01;

        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.9;

        if (i === 0) ctx.moveTo(x + this.jitterVal(x, y, 3, t), y);
        else ctx.lineTo(x + this.jitterVal(x, y, 3, t), y);
      }
      ctx.closePath();
      ctx.strokeStyle = pass === 2 ? this.colors.blueprint : this.colors.ink;
      ctx.globalAlpha = pass === 2 ? 0.3 + energy * 0.3 : 0.15 + energy * 0.3;
      ctx.lineWidth = (pass === 0 ? 0.8 : 1.5) + energy * 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Procedural Evolving Bridge / Castle
  drawArchitecturalSkyline(ctx: CanvasRenderingContext2D, w: number, h: number, energy: number, t: number) {
    ctx.save();
    ctx.strokeStyle = this.colors.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const numTowers = 16;
    const spacing = w / (numTowers + 1);
    const baseY = h * 0.9;

    // Base Ground Line
    ctx.lineWidth = 1.5;
    this.drawRoughLine(ctx, 0, baseY, w, baseY, 2, 2, t);

    for (let i = 1; i <= numTowers; i++) {
      const x = i * spacing;
      // Bins 0-15 map to towers
      const val = this.smoothedBins[i - 1];
      const height = 40 + (val * h * 0.4);
      const topY = baseY - height;
      const towerWidth = spacing * 0.4;

      // Draw Left and Right Walls
      ctx.lineWidth = 1.5;
      this.drawRoughLine(ctx, x - towerWidth / 2, baseY, x - towerWidth / 2, topY, 2, 1.5, t);
      this.drawRoughLine(ctx, x + towerWidth / 2, baseY, x + towerWidth / 2, topY, 2, 1.5, t);

      // Draw Tower Roof / Battlements
      if (i % 2 === 0) {
        // Spire
        this.drawRoughLine(ctx, x - towerWidth / 2 - 5, topY, x + towerWidth / 2 + 5, topY, 2, 2, t);
        this.drawRoughLine(ctx, x - towerWidth / 2, topY, x, topY - towerWidth, 2, 2, t);
        this.drawRoughLine(ctx, x + towerWidth / 2, topY, x, topY - towerWidth, 2, 2, t);
      } else {
        // Flat Battlement
        this.drawRoughLine(ctx, x - towerWidth / 2 - 5, topY, x + towerWidth / 2 + 5, topY, 2, 2, t);
      }

      // Shading / Crosshatching based on frequency volume
      if (val > 0.3) {
        ctx.strokeStyle = this.colors.inkLight;
        ctx.lineWidth = 1;
        const density = 12 - (val * 6); // Gets denser as it gets louder
        this.fillCrosshatch(ctx, x - towerWidth / 2 + 2, topY + 5, towerWidth - 4, height - 10, density, 2, t);
        ctx.strokeStyle = this.colors.ink;
      }

      // Bridges connecting towers
      if (i > 1) {
        const prevX = (i - 1) * spacing;
        const prevVal = this.smoothedBins[i - 2];
        const prevTopY = baseY - (40 + (prevVal * h * 0.4));

        // Suspension Bridge Cable
        ctx.lineWidth = 1;
        ctx.beginPath();
        let p1x = prevX + towerWidth / 2;
        let p1y = prevTopY + 20;
        let p2x = x - towerWidth / 2;
        let p2y = topY + 20;

        let cx1 = p1x + (p2x - p1x) / 2;
        let cy1 = Math.max(p1y, p2y) + 50 + (energy * 100); // Arch dips down, flexes with energy

        ctx.moveTo(p1x + this.jitterVal(p1x, p1y, 2, t), p1y);
        ctx.quadraticCurveTo(
          cx1 + this.jitterVal(cx1, cy1, 4, t),
          cy1 + this.jitterVal(cx1, cy1, 4, t),
          p2x + this.jitterVal(p2x, p2y, 2, t), p2y
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 4. Chaotic Floating Waveform (The strings of music)
  drawFloatingWave(ctx: CanvasRenderingContext2D, w: number, h: number, timeData: Uint8Array | null, energy: number, t: number) {
    ctx.save();
    ctx.strokeStyle = this.colors.inkLight;
    ctx.lineWidth = 1 + energy * 2;
    ctx.lineCap = 'round';

    const points = 128;
    const startX = w * 0.05;
    const endX = w * 0.95;
    const midY = h * 0.25;

    ctx.beginPath();
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < points; i++) {
        const percent = i / points;
        const x = startX + percent * (endX - startX);
        const sampleIndex = timeData ? Math.floor(percent * timeData.length) : 0;
        const sample = timeData ? (timeData[sampleIndex] - 128) / 128 : Math.sin(t * 3 + i * 0.1) * 0.2;

        // The wave physically tears and scribbles harder with energy
        const scratch = Math.sin(i * 0.6 + t * 5) * (energy * 30);
        const y = midY + (sample * h * 0.15) + scratch + this.jitterVal(x, midY, 4, t);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}