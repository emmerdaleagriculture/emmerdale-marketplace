/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Payload admin UI — served at /admin by the Payload Next integration.
 *
 * This file re-exports the Payload-provided admin page component. You never
 * need to edit it.
 */
import type { Metadata } from 'next';
import config from '@payload-config';
import { RootPage, generatePageMetadata } from '@payloadcms/next/views';
import { importMap } from '../importMap';

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

const Page = ({ params, searchParams }: Args) =>
  (<RootPage config={config} params={params} searchParams={searchParams} importMap={importMap} />);

export default Page;
