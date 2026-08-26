import "@testing-library/jest-dom/vitest";

// Recharts' ResponsiveContainer requires ResizeObserver, which jsdom does not provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// The alert strip scrolls itself into view; jsdom does no layout and leaves the method undefined.
// Suites that opt into the node environment have no DOM here at all.
if ("Element" in globalThis) Element.prototype.scrollIntoView ??= () => {};
