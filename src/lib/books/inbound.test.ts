import { describe, expect, it } from 'vitest';
import { attachmentType, bareAddress, findInboundCode, parseSenders, receiptsAddress } from './inbound';

describe('receipts by email', () => {
  it('builds the address from the code', () => {
    expect(receiptsAddress('3f9a1c2b7d4e', 'receipts@emmerdaleagriculture.com')).toBe('receipts+3f9a1c2b7d4e@emmerdaleagriculture.com');
  });

  it('finds the code in whichever field survived forwarding', () => {
    expect(findInboundCode(['books@inbound.example.com', 'Tom <receipts+3F9A1C2B7D4E@emmerdaleagriculture.com>'])).toBe('3f9a1c2b7d4e');
    expect(findInboundCode([null, undefined, 'receipts@emmerdaleagriculture.com'])).toBeNull();
    expect(findInboundCode(['receipts+short@x.com', 'receipts+zzzzzzzzzzzz@x.com'])).toBeNull();
  });

  it('compares bare sender addresses exactly', () => {
    expect(bareAddress('Dave Smith <Dave@Example.com>')).toBe('dave@example.com');
    expect(bareAddress('dave@example.com')).toBe('dave@example.com');
    expect(bareAddress('"bigdave@x.com" <other@y.com>')).toBe('other@y.com');
  });

  it('tidies the allowed senders list', () => {
    expect(parseSenders('A@b.com\nnot-an-email, c@d.co.uk; a@b.com')).toEqual(['a@b.com', 'c@d.co.uk']);
  });

  it('accepts PDFs and photos only, trusting a .pdf name over a generic type', () => {
    expect(attachmentType('application/pdf', 'x.pdf')).toBe('application/pdf');
    expect(attachmentType('application/octet-stream', 'Invoice 123.PDF')).toBe('application/pdf');
    expect(attachmentType('image/jpg', 'a.jpg')).toBe('image/jpeg');
    expect(attachmentType('image/heic', 'a.heic')).toBeNull();
    expect(attachmentType('text/html', 'x.html')).toBeNull();
  });
});
