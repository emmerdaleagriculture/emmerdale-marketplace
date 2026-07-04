import path from 'path';
import sharp from 'sharp';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { resendAdapter } from '@payloadcms/email-resend';
import { fileURLToPath } from 'url';

import { env } from '../lib/env';
import { Users } from './collections/users';
import { Media } from './collections/media';
import { Listings } from './collections/listings';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Payload CMS configuration.
 *
 * Database:  Postgres via node-postgres
 * Storage:   local (/media) in dev — add @payloadcms/storage-s3 for production
 * Auth:      Payload's built-in (Users collection)
 * Email:     Resend (transactional — password resets, verification)
 *
 * Env vars expected (see .env.local.example):
 *   DATABASE_URL
 *   PAYLOAD_SECRET
 *   RESEND_API_KEY   (optional — email logs to console if unset)
 *   EMAIL_FROM       (optional — defaults to Resend's sandbox sender)
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — Emmerdale Marketplace Admin',
    },
  },

  editor: lexicalEditor({}),

  // Transactional email via Resend. Only wired when RESEND_API_KEY is present
  // so env-less tooling (e.g. `payload generate:types`) and local dev without
  // a key fall back to Payload's console transport instead of erroring.
  ...(process.env.RESEND_API_KEY
    ? {
        email: resendAdapter({
          defaultFromAddress:
            process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev',
          defaultFromName: process.env.EMAIL_FROM_NAME || 'Emmerdale Marketplace',
          apiKey: process.env.RESEND_API_KEY,
        }),
      }
    : {}),

  sharp,

  collections: [Users, Media, Listings],

  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
    },
  }),

  secret: env.PAYLOAD_SECRET,

  typescript: {
    outputFile: path.resolve(dirname, '../../payload-types.ts'),
  },

  // Trust the host so Payload builds correct URLs in production
  serverURL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
});
