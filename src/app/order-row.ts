import { Component, input } from '@angular/core';

@Component({
  selector: 'app-order-row',
  template: `<span>#{{ id() }} {{ customer() }} {{ total() }}</span>`,
})
export class OrderRow {
  readonly id = input(0);
  readonly customer = input('');
  readonly total = input(0);
}
