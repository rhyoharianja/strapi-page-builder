/**
 * The one public route: the bridge script.
 *
 * Public because the browser fetching it is on the site's origin, not the admin's, and it
 * carries no content — only the protocol. Everything that touches data goes through the
 * Content Manager's own authenticated endpoints from the admin, so this plugin never opens a
 * second, less-guarded door onto the same content.
 */
export default () => ({
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/bridge.js',
      handler: 'bridge.serve',
      config: { auth: false, policies: [] },
    },
  ],
});
