import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import type { ShadowAgentHost } from './host';

export class ShadowAgentViewerElement extends HTMLElement {
  private root: Root | null = null;
  private rendererHost: ShadowAgentHost | null = null;

  get host(): ShadowAgentHost | null {
    return this.rendererHost;
  }

  set host(value: ShadowAgentHost | null) {
    this.rendererHost = value;
    this.render();
  }

  connectedCallback(): void {
    if (!this.root) {
      this.root = createRoot(this);
    }
    this.render();
  }

  disconnectedCallback(): void {
    this.root?.unmount();
    this.root = null;
  }

  private render(): void {
    if (!this.root || !this.rendererHost) {
      return;
    }

    this.root.render(<App host={this.rendererHost} />);
  }
}

export function registerShadowAgentElement(tagName = 'shadow-agent-viewer'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ShadowAgentViewerElement);
  }
}
