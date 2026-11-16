import { defineConfig } from 'vite';
import agentFeedback from '@lylyuanliang/agent-feedback-vite-plugin';

export default defineConfig({
  plugins: [
    agentFeedback()
  ]
});
