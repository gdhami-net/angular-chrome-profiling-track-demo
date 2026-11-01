import { Component, input } from '@angular/core';

@Component({
  selector: 'app-shipping-estimate',
  template: `<p>Estimated delivery: {{ estimateDays() }} days</p>`,
})
export class ShippingEstimate {
  readonly refreshes = input(0);

  // The deliberate mistake: a heavy calculation called from the template,
  // so it runs on every change detection pass that checks this component.
  estimateDays(): number {
    (globalThis as any).__estimateCalls = ((globalThis as any).__estimateCalls ?? 0) + 1;
    let score = 0;
    for (let i = 1; i < 6_000_000; i++) {
      score += Math.sqrt(i) % 7;
    }
    return 2 + (Math.round(score) % 3);
  }
}
