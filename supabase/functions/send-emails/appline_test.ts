import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { smsAppLine, withAppLine } from './appline.ts';

const SITE = 'https://www.emmerdaleagriculture.com';

Deno.test('contractor and customer emails get their own line; admin and unlisted kinds none', () => {
  assertStringIncludes(withAppLine('Body', 'sq_invitation', 'a@b.com', SITE), 'new jobs as notifications');
  assertStringIncludes(withAppLine('Body', 'sq_first_quote', 'a@b.com', SITE), 'Follow your job');
  assertStringIncludes(withAppLine('Body', 'sq_first_quote', 'a@b.com', SITE + '/'), `${SITE}/iphone`);
  assertEquals(withAppLine('Body', 'sq_invitation', '__admin__', SITE), 'Body');
  assertEquals(withAppLine('Body', 'contractor_email_verify', 'a@b.com', SITE), 'Body');
  assertEquals(withAppLine('Body', 'admin_direct', 'a@b.com', SITE), 'Body');
});

Deno.test('the text line is short and drops the scheme', () => {
  assertEquals(smsAppLine(SITE), ' iPhone app: www.emmerdaleagriculture.com/iphone');
});
