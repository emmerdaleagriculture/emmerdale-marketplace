/**
 * Serialize an object for embedding in a <script type="application/ld+json">.
 *
 * JSON.stringify does NOT escape `<`, `>` or `&`, so a value containing
 * `</script>` could break out of the tag (stored/reflected XSS). All our JSON-LD
 * data is DB/config-controlled today, but escaping the HTML-significant
 * characters to their \u forms closes the vector for good.
 */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
