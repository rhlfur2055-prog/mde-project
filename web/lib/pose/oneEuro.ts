// One Euro Filter — 포즈 랜드마크 떨림 제거(저지연 적응형 저역통과).
// Casiez et al. 2012. 의존성 없는 순수 구현. 정규화 좌표(0~1)에 사용.

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPass {
  private s: number | null = null;
  filter(x: number, alpha: number): number {
    this.s = this.s === null ? x : alpha * x + (1 - alpha) * this.s;
    return this.s;
  }
  reset() {
    this.s = null;
  }
}

class OneEuro {
  private xPrev: number | null = null;
  private xLp = new LowPass();
  private dxLp = new LowPass();
  constructor(
    private minCutoff = 1.5,
    private beta = 0.5,
    private dCutoff = 1.0,
  ) {}
  filter(x: number, dt: number): number {
    if (dt <= 0) return x;
    const dx = this.xPrev === null ? 0 : (x - this.xPrev) / dt;
    const edx = this.dxLp.filter(dx, smoothingAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const out = this.xLp.filter(x, smoothingAlpha(cutoff, dt));
    this.xPrev = x;
    return out;
  }
  reset() {
    this.xPrev = null;
    this.xLp.reset();
    this.dxLp.reset();
  }
}

// 한 사람(최대 33개) 랜드마크의 x·y를 좌표별 OneEuro로 평활. 입력 타입(z 등) 보존.
export class LandmarkSmoother {
  private fx: OneEuro[] = [];
  private fy: OneEuro[] = [];
  constructor(
    private minCutoff = 1.5,
    private beta = 0.5,
  ) {}
  apply<T extends { x: number; y: number }>(landmarks: T[], dtSec: number): T[] {
    return landmarks.map((p, i) => {
      if (!this.fx[i]) {
        this.fx[i] = new OneEuro(this.minCutoff, this.beta);
        this.fy[i] = new OneEuro(this.minCutoff, this.beta);
      }
      return {
        ...p,
        x: this.fx[i].filter(p.x, dtSec),
        y: this.fy[i].filter(p.y, dtSec),
      };
    });
  }
  reset() {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
  }
}
