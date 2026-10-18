# Family AI activation

Family chat and research reports use a separate, authenticated inference
gateway. The public demo keeps its inert AI previews. The existing family
book capability authorizes edge requests; it is never forwarded upstream.
Broker routes and shared owner chat storage are not part of this service.

Required edge secrets for `worker/wrangler.toml`:

- `FAMILY_AI_ORIGIN`: the dedicated HTTPS gateway origin, with no path/query.
- `FAMILY_AI_GATEWAY_TOKEN`: the gateway's server-only bearer credential.
- Existing `FAMILY_SYNC_TOKEN`: unchanged; it also identifies saved family data.

The existing `READER_QUOTA` binding provides a separate `family-ai` counter.
No new Durable Object migration is needed. Only `/family-ai/api/chat/models`,
`/family-ai/api/chat` and `/family-ai/api/chat/stream` are forwarded. Generic
`/chat` remains disabled. Redirects are rejected and requests cannot choose
another upstream, model or effort. No metered-provider fallback is configured.

Deploy the standalone gateway from the companion service first, set the Worker
secrets without putting them on a command line, and deploy the Worker. Then
publish the reviewed family source with:

```sh
TTW_FAMILY_AI=1 bash scripts/deploy_family.sh --deploy FULL_SOURCE_SHA
```

Publication requires an explicit `TTW_FAMILY_AI=1` or `0`; build-only defaults
to off. Setting `VITE_FAMILY_AI` alone does not activate
the public build; it also requires the family build flag and its capability.
Client chat history and notes use the browser's existing local storage. The
inference transport does not make the gateway a private wire service or expose
broker/account routes. Existing browser tools supply quotes, news and watchlist
context to the assistant; native server tools are denied.

To disable the UI, redeploy with `TTW_FAMILY_AI=0`. Removing either new Worker
secret makes the inference route fail closed without touching saved portfolios.
