# FrameAnalytics v0.7 data model

## Rank-aware daily series

Normalization v3.1 remains finalized and immutable. It is still the canonical source for the current max-rank view, but it cannot answer rank-0 or all-rank queries because ranked mods were deliberately reduced to the exact `catalog.maxRank` record.

The next derived branch must therefore be new namespaces, built from the existing raw 181-day source without repeating the raw backfill:

```text
raw history + reference day
  -> normalized-v3-2
  -> items-v3-2
  -> metrics-v3-2
  -> scanner-v3-2
```

Every real market series has a stable key composed from all present dimensions in this order:

```text
mod_rank
subtype
charges
amberStars
cyanStars
```

Examples:

```text
scalar
mod_rank=0
mod_rank=10
subtype=radiant
mod_rank=0&subtype=revealed
```

No ranks, subtypes, charges, stars, or platforms may be averaged or merged. A missing exact series stays missing.

The public rank filter has two initial modes:

- `base` (default): include series with no `mod_rank` dimension and series where `mod_rank=0`.
- `all`: include every rank as an independent row. Rank is part of `rowId`, URL state, portfolio identity, metrics, and scanner signal.

The current max-rank v3.1 view remains available during migration and rollback, but it must not be presented as rank 0.

## Crossplay scopes

Crossplay and platform are separate settings:

- `crossplay=true` uses one upstream crossplay scope requested with `Platform: pc` and `Crossplay: true`.
- Nintendo Switch always forces `crossplay=false` and uses the `switch` scope.
- The crossplay scheduler never sends a Switch-platform request and never combines a Switch snapshot into crossplay data.
- With crossplay disabled, `pc`, `ps4`, and `xbox` remain independent in the existing daily v3 data. Hourly v1 does not duplicate requests for these rarely selected legacy scopes.

Daily v3.1 remains platform-specific until a separately validated crossplay daily history exists. The UI must not claim that current daily platform histories have already been merged.

## Forecast ranges

There is no separate user-facing “analysis period” setting.

- The longest displayed daily range selects the existing scanner score, potential, and target horizon.
- The direction arrow is a consensus of all displayed ranges with available data.
- Missing ranges do not vote.
- A move with absolute magnitude below 2% is neutral for direction voting.
- A tied vote uses the shortest displayed meaningful range because it is the freshest signal.

When a future scanner version stores a true multi-period aggregate, this frontend rule can be replaced without changing the range selector.
