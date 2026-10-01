# Broker currency availability

Broker account currency is an explicit uppercase three-letter code, excluding
XXX, UNK and NAN. Missing, invalid or conflicting units are unavailable.
Native position currency never establishes account currency. A current
unavailable warning overrides cached account amounts and metadata.

The response adapter preserves margin warnings, account ownership and labelled
per-account values. Empty positions remain a valid response. Unknown or mixed
books have no combined balance, base total, weight, leverage or stress estimate.
Missing amounts never become zero or synthetic demo cash/maintenance. Native
marks and P&L remain visible in their own explicit units. A missing native mark
cannot be replaced by a quote for an unverified instrument or currency.

Complete non-USD books retain their supplied base amounts and derived ratios.
Partial known-currency margin retains its received fields; missing fields are
unavailable. Combined weights require every base value and an available weight
for the row. Combining contracts cannot turn a missing leg into a partial total.

Sizing additionally requires the quote currency to match account currency;
no implicit FX conversion is performed. Quotes without currency cannot size a
broker book. Carry and stress retain their explicitly hypothetical rate/beta
assumptions, using received broker balances rather than demo balances. The public
synthetic demo contract remains separate.

The shared portfolio-currency-v1 fixture uses synthetic accounts and values.
Regression tests mount the portfolio views with all broker requests mocked.
Historical snapshots have no currency column; no historical unit migration is
included in this change.
