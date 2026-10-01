`pretix-2026.7.0-middleware.py` is unmodified upstream source from:
https://github.com/pretix/pretix/blob/v2026.7.0/src/pretix/base/middleware.py

The upstream license header is retained. `infra/ttd-csp.test.py` executes the
actual CSP functions and SecurityMiddleware response methods, substituting only
unrelated Django/app context. `infra/verify-ttd-pretix-local.py` additionally runs
against the actual pinned container, ephemeral SQLite, native card/mail renderers
and event settings. Neither is a payment, ticket-attachment or mail-delivery test.
