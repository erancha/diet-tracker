import "@testing-library/jest-dom/vitest";

// Recharts' ResponsiveContainer requires ResizeObserver, which jsdom does not provide. jsdom
// also lays nothing out, so the stub reports one fixed size on observe: without it every chart
// measures 0 wide and renders no plot at all, leaving the panels untestable past their headings.
const CHART_SIZE = {
  width: 320, height: 120,
  top: 0, left: 0, right: 320, bottom: 120, x: 0, y: 0, toJSON: () => ({}),
};

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    const entry = { target, contentRect: CHART_SIZE } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }

  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// The alert strip scrolls itself into view; jsdom does no layout and leaves the method undefined.
// Suites that opt into the node environment have no DOM here at all.
if ("Element" in globalThis) Element.prototype.scrollIntoView ??= () => {};
