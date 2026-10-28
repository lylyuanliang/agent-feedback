import { defineConfig } from 'vite';
import agentFeedback from '../../packages/vite-plugin/src/index.js';

export default defineConfig({
  plugins: [
    agentFeedback()
  ]
});
