/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Payload GraphQL playground — a web UI for exploring the GraphQL schema.
 * Disabled in production by default in Payload's config.
 */
import config from '@payload-config';
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes';

export const GET = GRAPHQL_PLAYGROUND_GET(config);
