/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Payload GraphQL endpoint. Optional, but useful for more complex queries.
 */
import config from '@payload-config';
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes';

export const POST = GRAPHQL_POST(config);
export const OPTIONS = REST_OPTIONS(config);
