import { Component, computed, input } from '@angular/core';
import { OrderRow } from './order-row';

// Swapped in by the "many-rows" build configurations: 1,000 small row
// components, to see how per-entry profiling cost shows up on the track.

@Component({
  selector: 'app-order-table',
  imports: [OrderRow],
  template: `
    @for (order of orders(); track order.id) {
      <app-order-row [id]="order.id" [customer]="order.customer" [total]="order.total" />
    }
  `,
})
export class OrderTable {
  readonly refreshes = input(0);

  protected readonly orders = computed(() =>
    Array.from({ length: 1000 }, (_, i) => ({
      id: 1000 + i,
      customer: `Customer ${i + 1}`,
      total: ((i * 37 + this.refreshes()) % 400) + 10,
    })),
  );
}
