import { renderShadowAgent } from '../renderer';
import { createElectronHost } from './renderer-host';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Shadow Agent root element was not found.');
}

renderShadowAgent(container, createElectronHost());
