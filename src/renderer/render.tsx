import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import type { ShadowAgentHost } from './host';

export function renderShadowAgent(container: Element, host: ShadowAgentHost): Root {
  const root = createRoot(container);
  root.render(<App host={host} />);
  return root;
}
