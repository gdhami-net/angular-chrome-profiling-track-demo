import { Component, input } from '@angular/core';

@Component({
  selector: 'app-order-header',
  template: `<h1>Orders</h1><p>Refreshed {{ refreshes() }} times</p>`,
})
export class OrderHeader {
  readonly refreshes = input(0);
}
