import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('renders the four child components and refreshes them all', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-shipping-estimate p')?.textContent).toMatch(/Estimated delivery: \d days/);
    expect(el.querySelectorAll('app-order-table tr').length).toBe(50);

    const before = (globalThis as any).__estimateCalls;
    el.querySelector<HTMLButtonElement>('#refresh')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-order-header p')?.textContent).toContain('Refreshed 1 times');
    expect((globalThis as any).__estimateCalls).toBe(before + 1);
  });
});
