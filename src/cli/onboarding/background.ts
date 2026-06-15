import { blue, cyan, dim, green, magenta, yellow } from '@std/fmt/colors';
import { ANSI_RESET, ansiColor256, cursorPos, getTermSize } from './animations.ts';

interface Node {
  x: number;
  y: number;
  label: string;
  connections: number[];
  pulsePhase: number;
  color: number;
}

interface Signal {
  from: number;
  to: number;
  progress: number;
  speed: number;
  alive: boolean;
}

export class NeuralNetwork {
  private nodes: Node[] = [];
  private signals: Signal[] = [];
  private frame = 0;
  private width: number;
  private height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.initializeNodes();
  }

  private initializeNodes(): void {
    const w = this.width;
    const h = Math.min(this.height, 20);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.min(cx, cy) - 4;

    const nodeDefs = [
      { label: 'Memory', angle: 0, color: 45 },
      { label: 'LLM', angle: Math.PI * 0.4, color: 63 },
      { label: 'Reflection', angle: Math.PI * 0.8, color: 141 },
      { label: 'Tools', angle: Math.PI * 1.2, color: 120 },
      { label: 'Security', angle: Math.PI * 1.6, color: 196 },
      { label: 'Scheduler', angle: Math.PI * 1.8, color: 226 },
    ];

    const extraDefs = [
      { label: 'Vault', angle: Math.PI * 0.3, color: 205 },
      { label: 'Memory', angle: Math.PI * 0.7, color: 81 },
      { label: 'Workspace', angle: Math.PI * 1.1, color: 220 },
      { label: 'Pipeline', angle: Math.PI * 1.5, color: 117 },
      { label: 'Plugins', angle: Math.PI * 1.9, color: 213 },
      { label: 'IPC', angle: Math.PI * 0.1, color: 51 },
    ];

    const allDefs = this.width >= 100 ? [...nodeDefs, ...extraDefs] : nodeDefs;

    this.nodes = allDefs.map((def, i) => {
      const x = Math.round(cx + r * 0.8 * Math.cos(def.angle));
      const y = Math.round(cy + r * 0.6 * Math.sin(def.angle));
      return {
        x: Math.max(2, Math.min(w - 2, x)),
        y: Math.max(2, Math.min(h - 2, y)),
        label: def.label,
        connections: [] as number[],
        pulsePhase: Math.random() * Math.PI * 2,
        color: def.color,
      };
    });

    for (let i = 0; i < this.nodes.length; i++) {
      const distances = this.nodes.map((n, j) => ({
        idx: j,
        dist: Math.hypot(n.x - this.nodes[i].x, n.y - this.nodes[i].y),
      }));
      distances.sort((a, b) => a.dist - b.dist);
      const closest = distances.slice(1, 4).filter((d) => d.dist < r * 1.5);
      this.nodes[i].connections = closest.map((d) => d.idx);
    }
  }

  update(): void {
    this.frame++;
    const signalSpawnRate = 0.08;

    for (const node of this.nodes) {
      node.pulsePhase += 0.03;
    }

    const existingPaths = new Set(this.signals.map((s) => `${s.from}-${s.to}`));
    for (const [i, node] of this.nodes.entries()) {
      for (const conn of node.connections) {
        if (Math.random() < signalSpawnRate && !existingPaths.has(`${i}-${conn}`)) {
          this.signals.push({
            from: i,
            to: conn,
            progress: 0,
            speed: 0.02 + Math.random() * 0.03,
            alive: true,
          });
        }
      }
    }

    for (const sig of this.signals) {
      sig.progress += sig.speed;
      if (sig.progress >= 1) {
        sig.alive = false;
      }
    }

    this.signals = this.signals.filter((s) => s.alive);
    if (this.signals.length > 8) {
      this.signals = this.signals.slice(-8);
    }
  }

  render(offsetRow = 0, offsetCol = 0): void {
    const encoder = new TextEncoder();
    const nodeChars = ['◉', '●', '◆', '■'];
    const connStyle = dim;

    for (const [i, node] of this.nodes.entries()) {
      for (const conn of node.connections) {
        if (conn >= i) continue;
        const other = this.nodes[conn];
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const len = Math.round(Math.sqrt(dx * dx + dy * dy));
        if (len === 0) continue;

        const steps = Math.max(2, Math.round(len / 2));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const sx = Math.round(node.x + dx * t);
          const sy = Math.round(node.y + dy * t);
          if (sx >= 0 && sx < this.width && sy >= 0 && sy < this.height) {
            const ch = (dx === 0) ? '│' : (dy === 0) ? '─' : '·';
            const pos = cursorPos(offsetRow + sy + 1, offsetCol + sx + 1);
            Deno.stdout.writeSync(encoder.encode(pos + connStyle(ch)));
          }
        }
      }
    }

    for (const sig of this.signals) {
      const from = this.nodes[sig.from];
      const to = this.nodes[sig.to];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const sx = Math.round(from.x + dx * sig.progress);
      const sy = Math.round(from.y + dy * sig.progress);
      if (sx >= 0 && sx < this.width && sy >= 0 && sy < this.height) {
        const brightness = 0.6 + 0.4 * Math.sin(sig.progress * Math.PI);
        const color = `\x1b[38;2;${Math.round(252 * brightness)};${Math.round(211 * brightness)};${
          Math.round(77 * brightness)
        }m`;
        const pos = cursorPos(offsetRow + sy + 1, offsetCol + sx + 1);
        Deno.stdout.writeSync(encoder.encode(pos + color + '●' + ANSI_RESET));
      }
    }

    for (const [i, node] of this.nodes.entries()) {
      const brightness = 0.5 + 0.5 * Math.sin(node.pulsePhase);
      const color = `\x1b[38;5;${node.color}m`;
      const brightColor = `\x1b[38;2;${Math.round(200 * brightness)};${
        Math.round(200 * brightness)
      };${Math.round(255 * brightness)}m`;
      const ch = nodeChars[i % nodeChars.length];
      const pos = cursorPos(offsetRow + node.y + 1, offsetCol + node.x + 1);
      Deno.stdout.writeSync(encoder.encode(pos + brightColor + ch + ANSI_RESET));
      const labelPos = cursorPos(
        offsetRow + node.y + 2,
        offsetCol + node.x - Math.floor(node.label.length / 2) + 1,
      );
      Deno.stdout.writeSync(encoder.encode(labelPos + dim(node.label)));
    }
  }

  renderToBottom(): void {
    const { rows } = getTermSize();
    const nnHeight = Math.min(this.nodes.length + 2, 14);
    const offsetRow = rows - nnHeight - 3;
    const offsetCol = 2;
    this.render(offsetRow, offsetCol);
  }
}
