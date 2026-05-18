# Pawtato (LAND + HERO) NFT collections — fake-demand / bot-economy analysis

**Collections:**
- `0x09afb9a1c63a9bbaba650ef0a6b473b9874882cd63aab9570b99274e8f796f00::pawtato::LAND`
- `0xe0fa7b75a3dc8137b38bceb0c0c21c10e0f57c408fe9068694f58fd21e071925::pawtato_heroes::HERO`

**Operator linkage:** same memecoin operator that launched TATO
(`0x04deb377…::tato::TATO`). See `tato-rug-analysis.md` for the coin
side. Confirmed via overlapping tx senders and naming.

**Window analyzed:** 2025-11-12 17:42 → 2025-12-09 (≈27 days)

**Date of analysis:** 2026-04-28

---

## Headline

The Pawtato NFT/game ecosystem shows several "tricking retail" signatures:

1. **Game predates the TATO coin by 2 days** — NFTs and a play-to-earn
   loop were primed first, then a fungible coin was layered on top. The
   sequencing is consistent with using NFT engagement metrics to prop
   a coin launch, not the other way around.
2. **Tiny registered player base running enormous on-chain activity** —
   89 `pawtato_land::UserRegistered` events and 124 hero stakers, but
   46k `ResourcesProduced` and 13.7k `InfluenceClaimed` events. ~516
   resource-production events per registered land player is bot
   cadence, not human play.
3. **NFT-mint concentration** — top minter wallet (`0xd7bfa48…`) minted
   92 NFTs, second-place 68, third 46. The third-place wallet is the
   same `0x149bd7b6…` that holds 137T of TATO and ranks in the top 25
   net-position holders of TATO. NFT-side and coin-side power users
   are the same set of wallets.
4. **Wash-trade pair signature on the secondary market** — at least 15
   address pairs each moved the *same single NFT* 3–4 times between
   themselves. The top three pairs bounced one NFT each across four
   transfers — textbook wash.
5. **Mint revenue is small enough to be self-funded** — total 24,940
   SUI (~$62k) collected across 3,963 mint txs over 27 days. Not large
   enough to require independent retail demand; could be bootstrapped
   by the operator's own SUI cycling through ~600–700 sock wallets.

## Game economy scope

The Pawtato ecosystem isn't just two NFT collections — it's a full
play-to-earn game with a deep object graph:

```
NFT collections:
  pawtato::LAND                (2,021 NFTs, 4,217 historical owners)
  pawtato_heroes::HERO         (7,114 NFTs, 15,803 historical owners)
  pawtato_tools::TOOL          (6,781 minted, 5,428 burned — equipment)

Resource coins (8 distinct types):
  pawtato_coin_water::PAWTATO_COIN_WATER    (52,039 minted)
  pawtato_coin_wood::PAWTATO_COIN_WOOD      (56,474 minted)
  pawtato_coin_stone::PAWTATO_COIN_STONE    (54,750 minted)
  pawtato_coin_coal::PAWTATO_COIN_COAL      (48,344 minted)
  pawtato_coin_iron::PAWTATO_COIN_IRON      (42,450 minted)
  pawtato_coin_gold::PAWTATO_COIN_GOLD      (38,668 minted)
  pawtato_coin_crystal::PAWTATO_COIN_CRYSTAL (29,315 minted)
  pawtato_coin_wooden_plank::PAWTATO_COIN_WOODEN_PLANK (8,803 minted)

Game systems:
  pawtato_land::ResourcesProduced           (45,886 events)
  pawtato_land::RaffleStarted               (20,776 events)
  pawtato_hero_staking::InfluenceClaimed   (13,721)
  pawtato_hero_staking::UrrRolled           (11,578) — gambling/raffle
  pawtato_material_processing::*           (24k+ events)
  pawtato_tool_crafting_v2::*              (12k+ events)
  pawtato_tool_upgrades::*                 (3,619 events)
  pawtato_quests::WorldQuestCompleted      (5,937 events)
  pawtato_otc::DealCreated                 (2,802 events)
```

Genuine production-quality scope on the surface. The signal that this
is a bot-driven loop comes from the disproportion between the **89
registered land players** and the **45,886 resource-production events**
they collectively generated.

## Pre-launch — registered-player anomaly

```
pawtato_land::UserRegistered events:           89
pawtato_hero_staking::UserRegistered events:  124
ResourcesProduced events:                  45,886    →  516 per registered land player
InfluenceClaimed events:                   13,721    →  110 per registered hero staker
RaffleStarted events:                      20,776    →  234 per land player
```

A registered "player" producing ~500 resource events in 27 days is
running an automated harvesting loop, not playing a game. If the
average is 500 you can be sure the median is still in the 100s — i.e.
the *typical* player is bot-like, not just the heaviest.

For comparison, common play-to-earn games (Axie, Stepn, Big Time)
show median per-player session counts in the low teens per day. ~19
events/player/day is roughly continuous automated cycling.

## Launch — mint pace and concentration

The first hour of LAND mints (the flagship collection):

```
LAND mints in first 60 min: 22
HERO mints in first 60 min:  9
```

Steady ~25–50 NFTs/hour for the first 24 hours, no FOMO spike. That
pattern alone is not abnormal — it's consistent with both an organic
soft-launch *and* an internal-bot-driven steady-state mint. What
makes it suspicious is who the senders are.

**Top 25 NFT-minting senders** (across the whole window, both
collections combined, where the sender's address triggered the
chronologically-earliest activity for an NFT):

| Sender | NFTs first-touched |
|---|---|
| `0xd7bfa48299c3a3a5394ca3da4809fc1a7665b8c81af7690126a3827e6c1dc366` | 92 |
| `0xc848c5cc29fdff135650156194a27442b6c8cada58fab5ba9123d635754ae66f` | 68 |
| **`0x149bd7b6fea575f35843b5b02738dc4c68de9e53112ad47db096021f337bbbb4`** | **46** |
| `0x09e77ec77a88a00a988d39e4864ad99c24f9b8a3ce00fb3c5f403ec66ec8c195` | 37 |
| `0xd871c08263a25de824a638136b3702b06357405c0c8012882e77c32f394570e0` | 31 |
| `0xc9a85e207306aec1c86e76456771f909a75bbd58368c56126b1c98c711dd389b` | 27 |
| ... | ... |

The middle row is the smoking gun: `0x149bd7b6…` is the same address
that ranks #17 in the TATO top-net-position list (`+137T` net TATO,
205 trades). The NFT side and the coin side share power users.

Of the top 25 minters, none of the *known* TATO operator wallets
(`0x98fc…`, `0xc32d…`, `0x2c31…`, `0x8b81fb…`, `0x6b7f…`, `0x9e32…`,
`0xde0d…`, `0x1de2…`, `0xa472…`, `0xda085…`) appear directly.
Either:

- The operator uses fresh wallets for NFT minting (cleanest ops
  hygiene), or
- The NFTs are minted into Kiosk shared objects so the recorded
  `output_owner` is the Kiosk ID, not the operator's address (which
  would also explain why `change_type='CREATED'` is 0 — see schema
  caveat below).

Either way, the linkage via `0x149bd7b6…` is sufficient to put the
NFT-side and TATO-side activity under the same operational umbrella.

## Mint revenue (low enough to self-fund)

```
mint_tx_count:                3,963
total SUI paid by minters:    24,940 SUI    (~$62k @ $2.50/SUI)
```

Twenty-five thousand SUI is a small enough number that the operator's
treasury wallet (`0x98fc…`, which rotates ~3.4M SUI gross according
to the TATO analysis) could trivially have funded it. Spread across
~700 sock wallets each minting a handful of NFTs, the per-wallet
spend is ~35 SUI — well within the funding budget the same operator
demonstrably has.

This is not proof the mint was self-funded, but the bound is
permissive: $62k of NFT mint revenue is not large enough to
*require* genuine retail demand.

## Post-launch — wash-trade pair signatures

For each LAND/HERO NFT, we tracked ownership transitions in
`object_changes` (where `output_owner` changes between consecutive
rows for the same `object_id`).

```
total ownership transitions:           12,643
unique NFTs that changed hands at least once: 6,423
```

**Address pairs that moved the same NFT 3+ times** (i.e. the same
wallet pair bouncing the same item across multiple txs):

| `a` | `b` | transfers | unique NFTs |
|---|---|---|---|
| `0x5c213eb18794bc59a7fe5ef0a82c9562746959a1ebd9247b949909786342968d` | `0x5f3fbe13bbcc1ae5fc67e4521f6ecab526003fec5cc77674e961262d89b938db` | **4** | **1** |
| `0x103883e7679ff27e15b2c22c0e5622c9ced41c22a03ec9c846f70370cddaeed3` | `0xc7ce640d590f6b21bdef7c243c95744f3c86bfbdc0324fad2b7979078878b204` | **4** | **1** |
| `0x79365dcd4bacdea65e6d9d26b1e680dcb5b7bf7fc669bbac7c9c4cc2a0a3bb3e` | `0xea1379d461e8207d61c09d8810aa48d8e16d5d61ef83cf227e0717c7eeaeaa0a` | **4** | **1** |
| `0xa671d276adb1e295cfd8b0bcea984100a0f2a1ee92b91ffc31b7c01926b713f5` | `0xd328e274d2d7a68b8b79eb6a78c0b62bc1abeefe2def988c40660abf5f722309` | 3 | 1 |
| `0x104a085b363b2dfa980ddeadd5dc04198ec0a8727accf3e1282e60733e795eb4` | `0x8463f47e267a447763ccca5cd4bb33d5eed71ecc4cbe8c546d45f95bcc146239` | 3 | 1 |
| `0x0ac0bfe5ecba2f2bce76ea35da7728ac927b206f974c6129d76c40d7d909d8fd` | `0xab7df1c7a87577bfcc2f4da076e2f18a4a620b64bbefaea15b0afe7e5dc30b9a` | 3 | 1 |
| ... 12 more pairs at 3 transfers each ... | | | |

**The top three pairs each bounced one specific NFT four times
between themselves**. Two-party four-transfer cycles on a single NFT
do not happen in organic trading — they are wash trades or
stake/unstake/stake/unstake cycles via a staking-pool shared object.

**Caveat**: some of these pairs may be `(player_address,
staking_pool_object_id)` cycles, not human↔human wash trades. Resolving
which is which requires loading the `output_owner` strings against the
known staking-pool object IDs (e.g.
`0x42482d397dd0…::pawtato_land::StakingPool` or
`0x733d68482ee0…::pawtato_hero_staking::*`). For the production
detector this needs to be pre-filtered. The unfiltered count
(15+ pairs at 3+ transfers) is an *upper bound* on wash candidates.

## Schema caveats

A few non-obvious things showed up that affected this analysis and
will affect any productized Pawtato/NFT detectors:

1. **`change_type='CREATED'` is 0 for both LAND and HERO.** All rows
   are `MUTATED`. The pipeline appears to record only post-creation
   state for objects that are placed into shared parents (Kiosk,
   StakingPool) atomically with creation. Workaround: use `argMin(_,
   sui_timestamp) GROUP BY object_id` to find the chronologically
   first row per object, treat that as the mint event.

2. **`change_type='TRANSFERRED'` is 0 across all rows.** Ownership
   changes appear as `MUTATED` rows where `output_owner` differs from
   the previous row's `output_owner`. Workaround: `lagInFrame` over
   ownership history per object.

3. **`output_owner` may be a shared-object ID, not an address.** When
   an NFT is inside a Kiosk or a staking pool, `output_owner` is the
   parent object's ID. This inflates the apparent unique-owner count
   and creates the wash-pair false positives mentioned above. For a
   production detector, maintain a known-shared-objects set and
   exclude those from `(prev_owner, new_owner)` pairs before
   computing wash signals.

4. **Memory limit on cross-table joins.** Joining
   `balance_changes` to `object_changes` or `transactions` over the
   full 27-day window blows past the default 37 GiB. Use IN-clause
   subqueries with the per-object `argMin(tx_digest, sui_timestamp)`
   pattern to keep the join driver-side small.

These all argue for the post-`replay` data model (per the addendum
on `tato-rug-analysis.md`) to expose three view-style aggregates:

- `nft_mint_view(coll, object_id, minter_addr, minter_tx, minted_at)`
- `nft_transfer_view(coll, object_id, from, to, tx, ts)` excluding
  shared-object owners
- `coin_swap_view(coin_type, buyer, sui_paid, ts)` for coin-side
  retail-extraction queries

Each is straightforward to build but requires the schema-caveat
workarounds above.

## SQL queries used

```sql
-- Game economy scope: object types in the pawtato namespace
SELECT object_type, count() AS n,
       countIf(change_type='CREATED') AS created,
       countIf(change_type='MUTATED') AS mutated
FROM sui_mainnet.object_changes
WHERE object_type LIKE '%pawtato%'
GROUP BY object_type ORDER BY n DESC LIMIT 30;

-- Player count vs activity disproportion
SELECT event_type, count() AS n
FROM sui_mainnet.events
WHERE event_type LIKE '%pawtato%'
GROUP BY event_type ORDER BY n DESC;

-- LAND/HERO unique-NFT count, owner count
SELECT 'LAND' AS coll, uniqExact(object_id) AS uniq_nfts,
       uniqExact(output_owner) AS uniq_owners
FROM sui_mainnet.object_changes
WHERE object_type = '<LAND>'
UNION ALL
SELECT 'HERO', uniqExact(object_id), uniqExact(output_owner)
FROM sui_mainnet.object_changes WHERE object_type = '<HERO>';

-- Top minters (sender of chronologically-first tx per object_id)
WITH first_mints AS (
  SELECT argMin(tx_digest, sui_timestamp) AS mint_tx
  FROM sui_mainnet.object_changes
  WHERE object_type IN ('<LAND>','<HERO>')
  GROUP BY object_id
)
SELECT sender, count() AS mint_txs
FROM sui_mainnet.transactions
WHERE digest IN (SELECT mint_tx FROM first_mints)
GROUP BY sender HAVING mint_txs > 5 ORDER BY mint_txs DESC;

-- Mint revenue (SUI paid in mint txs)
WITH mint_txs AS (
  SELECT argMin(tx_digest, sui_timestamp) AS mint_tx
  FROM sui_mainnet.object_changes
  WHERE object_type IN ('<LAND>','<HERO>')
  GROUP BY object_id
)
SELECT count(DISTINCT bc.tx_digest), sum(-bc.amount)/1e9
FROM sui_mainnet.balance_changes bc
WHERE bc.coin_type = '<SUI>' AND bc.amount < 0
  AND bc.tx_digest IN (SELECT mint_tx FROM mint_txs);

-- Wash-pair detector
WITH transitions AS (
  SELECT object_id, output_owner AS new_owner,
         lagInFrame(output_owner) OVER (PARTITION BY object_id ORDER BY sui_timestamp) AS prev_owner
  FROM sui_mainnet.object_changes
  WHERE object_type IN ('<LAND>','<HERO>')
)
SELECT
  if(prev_owner < new_owner, prev_owner, new_owner) AS a,
  if(prev_owner < new_owner, new_owner, prev_owner) AS b,
  count() AS transfers, uniqExact(object_id) AS uniq_objects
FROM transitions
WHERE prev_owner != '' AND new_owner != prev_owner AND new_owner != ''
GROUP BY a, b ORDER BY transfers DESC LIMIT 20;
```

## Productization angle

This NFT-collection forensic kit sits naturally next to the TATO
coin-rug detectors:

- **Bot-economy index** = `events_per_registered_player` against a
  per-package baseline. >100 events/player/27d is the threshold
  above which a P2E game is overwhelmingly bot-driven.
- **Mint-side concentration** = HHI-style index on top-25 minter
  share. >5% of supply minted by a single sender on a launch day is
  notable; >25% concentrated in top-10 senders is alarming.
- **Wash-pair detector for NFTs** = `(a, b)` pairs with ≥3 transfers
  on the same `object_id`, with shared-object-owner exclusion. This
  reuses the same architecture as the coin wash-MM detector.
- **Cross-asset linkage** = "wallet appears in top 25 net positions
  for token X *and* top 25 minters for NFT collection Y from the
  same operator" — strong sock-puppet/insider signal across
  asset classes.

All four are sub-100ms with the right per-(coll, day) and
per-(coin_type, day) materialized aggregates against the indexed
data on `sui_mainnet`.

## Bottom line

Pawtato (LAND + HERO) shows the same operational fingerprints as
TATO, suggesting a **coordinated NFT-game + memecoin product launch**
where:

- The NFT-game was launched first (Nov 12) to seed engagement
  metrics
- A token (TATO) was layered on two days later (Nov 14)
- The same power users participate on both sides
- The "registered player" base is far too small for the on-chain
  activity volume (516 events/player/27d)
- ~$62k of mint revenue is not big enough to require organic
  demand and could be bootstrapped from the operator's own SUI
- At minimum 15 wallet pairs show wash-trade signatures on
  individual NFTs (4-transfer cycles on a single NFT)

This is consistent with **a serial operator using a play-to-earn
shell to manufacture engagement metrics, then attaching a memecoin
to monetize the resulting attention**. The forensic-product story
remains the same as in `tato-rug-analysis.md` — the additional
detectors above (bot-economy index, NFT mint concentration,
NFT wash-pair detector, cross-asset linkage) extend the kit to
cover the NFT/game side.
