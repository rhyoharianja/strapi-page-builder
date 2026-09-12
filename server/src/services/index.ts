import type { Core } from '@strapi/strapi';

import preview from './preview';
import settings from './settings';

/** Annotated for the same TS2742 reason as `controllers/index.ts`. */
type Factory = (context: { strapi: Core.Strapi }) => unknown;

const services: Record<string, Factory> = { preview, settings };

export default services;
