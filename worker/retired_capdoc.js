// Family sync was removed on 2026-10-06. This empty class exists only so the
// Worker keeps exporting the Durable Object class that wrangler.toml's
// v1-cap-doc-coordinator migration created. The stored family documents and
// their history live in that namespace and are deliberately retained: do NOT
// add a deleted_classes migration for it. It serves nothing and is bound to no
// route.
export class CapDocCoordinator {
  async fetch() {
    return new Response(null, { status: 410 })
  }
}
