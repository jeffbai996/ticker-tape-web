# Test procedure

Use nvm Node 22. For a small change, run explicit related test files:

```sh
npm test -- test/test_scope.test.js
```

Replace that path with the files covering the change. Bare `npm test`, watch,
directory and changed/related collection are intentionally refused by the scope
guard. Do not disable the guard to obtain a wider run. Source-contract tests
also read application files directly, so import-only selection is incomplete.

For a general local sweep, use `npm run test:local`: it runs every test, with
two native-API suites in separate processes and the rest in isolated VM workers.
For Node-only work, `npm run test:fast` is a smaller sweep; it omits DOM suites.
A fast pass alone does not cover DOM changes.

Before landing, use `npm run test:full`. `.cc-land.json` enforces that same
complete suite in native processes. Keep this gate even when the local preset
passes. Native module loading and WebCrypto have different behavior across VM
realms; new uses of native APIs may need a native-process local exception.
Never relax an assertion to make it pass in a VM.

Check for existing coverage before adding another source-contract test or a
large parameter list. Prefer behavior tests and shared setup. Coverage details,
native exceptions and timings are in `docs/TEST_DIET.md`.
Use the Node environment for pure suites; retain jsdom when the tests or their
imports require browser storage or the DOM.
