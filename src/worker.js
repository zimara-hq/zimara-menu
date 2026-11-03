import app, { scheduled } from './app.js';
export { BranchHub } from './realtime.js';

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(scheduled(env));
  },
};
