import { Box, Flex, Typography } from '@strapi/design-system';

interface SetupNoticeProps {
  bridgePath: string | null;
}

/**
 * What to do when nothing is configured yet.
 *
 * Shown instead of an empty iframe, because an empty iframe is indistinguishable from a broken
 * plugin and sends people to the issue tracker rather than to `config/plugins.ts`. The snippet
 * is the exact two steps, in order, with the bridge URL the server actually serves.
 */
const SetupNotice = ({ bridgePath }: SetupNoticeProps) => (
  <Flex direction="column" alignItems="center" justifyContent="center" height="100%" padding={10}>
    <Box maxWidth="640px">
      <Typography variant="beta">Point the editor at your site</Typography>

      <Box paddingTop={4}>
        <Typography variant="pi" textColor="neutral600">
          1 — tell Strapi where the site is, in <code>config/plugins.ts</code>:
        </Typography>
        <Box
          padding={3}
          marginTop={2}
          background="neutral100"
          hasRadius
          style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}
        >
          {`export default ({ env }) => ({
  'page-builder': {
    enabled: true,
    config: { frontendUrl: env('FRONTEND_URL', 'http://localhost:3000') },
  },
});`}
        </Box>
      </Box>

      <Box paddingTop={5}>
        <Typography variant="pi" textColor="neutral600">
          2 — load the bridge on the site, and annotate what should be editable:
        </Typography>
        <Box
          padding={3}
          marginTop={2}
          background="neutral100"
          hasRadius
          style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}
        >
          {`<script src="${window.location.origin}${bridgePath ?? '/api/page-builder/bridge.js'}" defer></script>

<section data-strapi-entry="api::page.page#\${page.documentId}">
  <h1 data-strapi-field="title">{{ page.title }}</h1>
</section>`}
        </Box>
      </Box>
    </Box>
  </Flex>
);

export { SetupNotice };
