import { getEnergy, idleEnergy, pseudoRandom } from "../utils";
import { useStore } from "../store";

export class VisualizerEngine {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  seeds: number[] = Array.from({ length: 192 }, (_, i) => pseudoRandom(i + 7));
  blooms: any[] = Array.from({ length: 16 }, (_, i) => ({
    x: pseudoRandom(i * 7 + 1),
    y: pseudoRandom(i * 11 + 3),
    r: pseudoRandom(i * 17 + 5),
    phase: pseudoRandom(i * 13 + 9)
  }));
  rafId: number = 0;

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

  drawFrame(analyser: AnalyserNode | null, dataFrequency: Uint8Array | null, dataTime: Uint8Array | null) {
      this.resize();
      if (!this.ctx || !this.canvas) return;

      const width = this.canvas.width; const height = this.canvas.height;
      const ratio = window.devicePixelRatio || 1;
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.save(); 
      this.ctx.scale(ratio, ratio);

      const parent = this.canvas.parentElement;
      if(!parent) return;
      const rect = parent.getBoundingClientRect();
      const w = rect.width; const h = rect.height;

      const ink = 'rgba(35, 30, 28, 0.95)';
      const inkSoft = 'rgba(35, 30, 28, 0.4)';
      const accent = 'rgba(24, 75, 165, 0.9)';
      const accentSoft = 'rgba(24, 75, 165, 0.3)';
      const t = performance.now() / 1000;

      let frequency = null; let timeData = null;
      if (analyser && dataFrequency && dataTime) {
          analyser.getByteFrequencyData(dataFrequency);
          analyser.getByteTimeDomainData(dataTime);
          frequency = dataFrequency; timeData = dataTime;
      }

      const energy = frequency ? getEnergy(frequency, 3, frequency.length * 0.72) : idleEnergy(t);
      const bass = frequency ? getEnergy(frequency, 0, 18) : idleEnergy(t + 2) * 0.7;
      const treble = frequency ? getEnergy(frequency, 60, frequency.length) : idleEnergy(t + 4) * 0.5;

      this.drawInkBlooms(this.ctx, w, h, t, energy, accentSoft);
      this.drawCircularScribble(this.ctx, w, h, t, frequency, energy, bass, ink, accent);
      this.drawWaveNotes(this.ctx, w, h, t, timeData, treble, inkSoft);
      this.drawBeatTicks(this.ctx, w, h, t, bass, accent);

      this.ctx.restore();
  }

  drawInkBlooms(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, energy: number, color: string) {
    ctx.save(); ctx.globalCompositeOperation = "multiply";
    for (const bloom of this.blooms) {
      const x = w * (0.12 + bloom.x * 0.78); const y = h * (0.14 + bloom.y * 0.68);
      const radius = (18 + bloom.r * 42) * (1 + energy * 0.26 * Math.sin(t + bloom.phase * 8));
      ctx.beginPath();
      ctx.ellipse(x, y, radius * (0.7 + bloom.r * 0.4), radius * (0.34 + bloom.y * 0.28), bloom.phase * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.globalAlpha = 0.018 + energy * 0.035; ctx.fill();
    }
    ctx.restore();
  }

  drawCircularScribble(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, frequency: Uint8Array | null, energy: number, bass: number, ink: string, accent: string) {
    const cx = w * 0.5; const cy = h * 0.43; const smaller = Math.min(w, h);
    const baseRadius = smaller * (0.135 + bass * 0.026); const maxLift = smaller * (0.105 + energy * 0.09);
    const points = 180;

    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let pass = 0; pass < 4; pass += 1) {
      ctx.beginPath();
      for (let i = 0; i <= points; i += 1) {
        const percent = i / points; const angle = percent * Math.PI * 2;
        const sourceIndex = frequency ? Math.floor(percent * (frequency.length - 1)) : 0;
        const value = frequency ? frequency[sourceIndex] / 255 : 0.18 + 0.05 * Math.sin(t * 1.7 + i);
        const seed = this.seeds[(i + pass * 17) % this.seeds.length];
        const wobble = Math.sin(t * (1.7 + seed) + i * 0.19 + pass) * smaller * 0.006;
        const rough = Math.sin(i * 0.55 + seed * 9 + t * 0.35) * smaller * 0.004;
        const radius = baseRadius + value * maxLift + wobble + rough + pass * smaller * 0.006;
        const skew = 1 + Math.sin(angle * 2 + t * 0.3) * 0.035;
        const x = cx + Math.cos(angle) * radius * skew; const y = cy + Math.sin(angle) * radius * (0.86 + bass * 0.08);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.strokeStyle = pass === 2 ? accent : ink;
      ctx.globalAlpha = pass === 2 ? 0.32 + energy * 0.24 : 0.24 + energy * 0.34;
      ctx.lineWidth = (pass === 0 ? 0.8 : 1.25 + pass * 0.34) + energy * 1.4; ctx.stroke();
    }
    this.drawCenterPulse(ctx, cx, cy, smaller, bass, ink, accent);
    ctx.restore();
  }

  drawCenterPulse(ctx: CanvasRenderingContext2D, cx: number, cy: number, smaller: number, bass: number, ink: string, accent: string) {
    const radius = smaller * (0.035 + bass * 0.025);
    ctx.save(); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill(); ctx.globalAlpha = 0.35; ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink; ctx.stroke(); ctx.restore();
  }

  drawWaveNotes(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, timeData: Uint8Array | null, treble: number, inkSoft: string) {
    const left = w * 0.14; const right = w * 0.88; const y = h * 0.72; const points = 96;
    ctx.save(); ctx.globalAlpha = 0.32 + treble * 0.38; ctx.strokeStyle = inkSoft;
    ctx.lineWidth = 1.1 + treble * 1.8; ctx.lineCap = "round"; ctx.beginPath();
    for (let i = 0; i < points; i += 1) {
      const x = left + ((right - left) * i) / (points - 1);
      const sample = timeData ? (timeData[Math.floor((i / points) * timeData.length)] - 128) / 128 : Math.sin(t * 2 + i * 0.35) * 0.15;
      const scratch = Math.sin(i * 0.62 + t * 2.4) * 2.2;
      const yy = y + sample * h * 0.065 + scratch;
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    for (let i = 0; i < 9; i += 1) {
      const x = left + ((right - left) * i) / 8; const yy = y + Math.sin(t * 1.2 + i) * h * 0.024;
      ctx.beginPath(); ctx.moveTo(x - 6, yy + 9); ctx.quadraticCurveTo(x + 1, yy - 6, x + 9, yy + 5); ctx.stroke();
    }
    ctx.restore();
  }

  drawBeatTicks(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, bass: number, accent: string) {
    const count = 26; const radius = Math.min(w, h) * (0.255 + bass * 0.03);
    const cx = w * 0.5; const cy = h * 0.43;
    ctx.save(); ctx.strokeStyle = accent; ctx.lineCap = "round"; ctx.globalAlpha = 0.22 + bass * 0.5;
    ctx.lineWidth = 1.1 + bass * 2.1;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.sin(t * 0.6) * 0.03;
      const len = 5 + bass * 20 * this.seeds[i]; const inner = radius + Math.sin(t * 2 + i) * 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner * 0.86);
      ctx.lineTo(cx + Math.cos(angle) * (inner + len), cy + Math.sin(angle) * (inner + len) * 0.86); ctx.stroke();
    }
    ctx.restore();
  }

}
