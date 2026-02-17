export class FixedStepRunner {
  private accumulator = 0;

  constructor(
    private readonly fixedStepSeconds: number,
    private readonly maxSubSteps: number = 6
  ) {}

  step(deltaSeconds: number, callback: (fixedDelta: number) => void): void {
    this.accumulator += deltaSeconds;

    let subStepCount = 0;
    while (
      this.accumulator >= this.fixedStepSeconds &&
      subStepCount < this.maxSubSteps
    ) {
      callback(this.fixedStepSeconds);
      this.accumulator -= this.fixedStepSeconds;
      subStepCount += 1;
    }

    if (subStepCount === this.maxSubSteps) {
      this.accumulator = 0;
    }
  }
}
