/** Read-only settings for the builder page. Admin-authenticated like every other admin route. */
export default () => ({
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/settings',
      handler: 'settings.read',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/preview-token',
      handler: 'preview.token',
      config: { policies: [] },
    },
  ],
});
