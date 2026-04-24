
import { sequenceSelfLoopPath } from './sequenceSelfLoopPath';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('sequenceSelfLoopPath', (): void => {
  it('starts at the source coordinates', (): void => {
    const path = sequenceSelfLoopPath(10, 20, 30, 40, 200, false);
    expect(path).toMatch(/^M 10,20 /);
  });

  it('ends at the target coordinates', (): void => {
    const path = sequenceSelfLoopPath(10, 20, 30, 40, 200, false);
    expect(path).toMatch(/L 30,40$/);
  });

  it('uses rx = labelX - 125 in full mode', (): void => {
    const labelX = 300;
    const path = sequenceSelfLoopPath(0, 0, 0, 100, labelX, false);
    // rx = 300 - 125 = 175, cornerR = min(8, 50) = 8
    // Second segment: L (175 - 8),0 = L 167,0
    expect(path).toContain('L 167,0');
  });

  it('uses rx = labelX + 35 in low-poly mode', (): void => {
    const labelX = 300;
    const path = sequenceSelfLoopPath(0, 0, 0, 100, labelX, true);
    // rx = 300 + 35 = 335, cornerR = min(8, 50) = 8
    // Second segment: L (335 - 8),0 = L 327,0
    expect(path).toContain('L 327,0');
  });

  it('caps corner radius at 8 when the vertical gap is large', (): void => {
    const path = sequenceSelfLoopPath(0, 0, 0, 100, 200, false);
    // |ty - sy| = 100, cornerR = min(8, 50) = 8
    // rx = 200 - 125 = 75
    // First Q: Q 75,0 75,8
    expect(path).toContain('Q 75,0 75,8');
  });

  it('shrinks corner radius for small vertical gaps', (): void => {
    const path = sequenceSelfLoopPath(0, 0, 0, 10, 200, false);
    // |ty - sy| = 10, cornerR = min(8, 5) = 5
    // rx = 200 - 125 = 75
    // First Q: Q 75,0 75,5
    expect(path).toContain('Q 75,0 75,5');
  });

  it('contains Q (quadratic curve) commands for rounded corners', (): void => {
    const path = sequenceSelfLoopPath(10, 20, 30, 120, 250, false);
    const qCount = (path.match(/Q /g) ?? []).length;
    expect(qCount).toBe(2);
  });

  it('has the correct segment structure: M, L, Q, L, Q, L', (): void => {
    const path = sequenceSelfLoopPath(5, 10, 15, 80, 200, false);
    const segments = path.match(/[MLQ]/g);
    expect(segments).toEqual(['M', 'L', 'Q', 'L', 'Q', 'L']);
  });

  it('produces different paths for different coordinates', (): void => {
    const pathA = sequenceSelfLoopPath(0, 0, 0, 100, 200, false);
    const pathB = sequenceSelfLoopPath(50, 60, 70, 200, 300, false);
    expect(pathA).not.toBe(pathB);
  });
});
