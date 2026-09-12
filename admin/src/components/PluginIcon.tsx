import { Cursor } from '@strapi/icons';

/**
 * The plugin's glyph in the main navigation.
 *
 * A cursor rather than the SDK's default puzzle piece: the sidebar is a column of icons, and
 * with the default in every plugin the entries are indistinguishable. Pointing at something is
 * literally what this plugin does.
 */
const PluginIcon = () => <Cursor />;

export { PluginIcon };
