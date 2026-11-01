import { Component, input } from '@angular/core';

@Component({
  selector: 'app-promo-banner',
  template: `<p class="promo">Free shipping over $50 (offer #{{ refreshes() + 1 }})</p>`,
})
export class PromoBanner {
  readonly refreshes = input(0);
}
