import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-order-table',
  template: `
    <table>
      @for (order of orders(); track order.id) {
        <tr><td>#{{ order.id }}</td><td>{{ order.customer }}</td><td>{{ order.total }}</td></tr>
      }
    </table>
  `,
})
export class OrderTable {
  readonly refreshes = input(0);

  protected readonly orders = computed(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: 1000 + i,
      customer: `Customer ${i + 1}`,
      total: ((i * 37 + this.refreshes()) % 400) + 10,
    })),
  );
}
