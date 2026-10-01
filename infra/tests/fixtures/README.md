`pretix-2026.7.0-middleware.py` is unmodified upstream source from:
https://github.com/pretix/pretix/blob/v2026.7.0/src/pretix/base/middleware.py

The upstream license header is retained. `infra/ttd-csp.test.py` executes the
actual CSP functions and SecurityMiddleware response methods, substituting only
unrelated Django/app context. `infra/verify-ttd-pretix-local.py` additionally runs
against the actual pinned container, ephemeral SQLite, native card/mail renderers
and event settings. Neither is a payment, ticket-attachment or mail-delivery test.

`pretix-pre-ttd-settings.py` is the exact repository adapter at PR28/main
`be350a1d320136abdc1592b350e5f32257f91a17` (also running booking release
`c02936ab`). Its pinned hash is used to verify the strict owner upgrade path
and rejection of drift; it is not installed as the candidate adapter.
