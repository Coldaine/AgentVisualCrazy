import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia. framer-motion's useReducedMotion and the
// canvas reduced-motion effect both probe it, so provide a stub that reports
// "no preference" and supports the (un)subscribe surface they use.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => {
    const list: MediaQueryList = {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    };
    return list;
  };
}
