import { Component, signal } from '@angular/core';
import { OrderHeader } from './order-header';
import { OrderTable } from './order-table';
import { PromoBanner } from './promo-banner';
import { ShippingEstimate } from './shipping-estimate';

@Component({
  selector: 'app-root',
  imports: [OrderHeader, OrderTable, PromoBanner, ShippingEstimate],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly refreshes = signal(0);

  protected refresh() {
    this.refreshes.update((n) => n + 1);
  }
}
