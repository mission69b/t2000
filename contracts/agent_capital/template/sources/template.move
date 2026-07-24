// Agent coin template — compiled ONCE, then parameterized per launch by
// rewriting the compiled bytecode (identifiers + constants) with
// `@mysten/move-bytecode-template`. No Move toolchain is needed at launch time,
// so the launch path can run from a serverless console API.
//
// Ported 2026-07-24 from the proven mainnet spike (`~/dev/funkii-ai-spike/`,
// tx 4p1dgo7FwAU51mDSKFzSuWeGdeSLPmTVBSG3uayZhkQn, tracker S.791/S.792).
// Unchanged in substance — only the package/module naming is agent-neutral.
//
// The can't-rug invariants all happen in `init`, atomically with publish:
//   1. full supply minted, exactly once
//   2. CoinMetadata frozen (name/symbol/icon immutable)
//   3. TreasuryCap frozen (minting impossible forever — supply is fixed)
// The publish PTB additionally calls `0x2::package::make_immutable` on the
// UpgradeCap, so the package itself can never be upgraded.
//
// NOTE ON ALLOCATION: `init` mints the whole supply to a single RECIPIENT — the
// launcher. The 50/50 LP/treasury split happens in the NEXT transaction, not
// here: objects created inside `init` are not addressable as PTB results in the
// publishing transaction, so an in-init split would have to hardcode both
// destinations and could not feed the pool-seeding command. Splitting downstream
// keeps the template free of allocation policy — the policy lives in the
// orchestrator, where it can change without recompiling this bytecode.
module agent_coin::template;

use sui::coin;
use sui::url;

public struct TEMPLATE has drop {}

const DECIMALS: u8 = 6;
const SYMBOL: vector<u8> = b"TMPL";
const NAME: vector<u8> = b"Template Coin";
const DESCRIPTION: vector<u8> = b"bytecode template placeholder";
const ICON_URL: vector<u8> = b"https://example.com/icon.svg";
// 1,000,000,000 whole coins at 6 decimals — the locked v1 supply.
const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000;
// Rewritten per launch to the launcher's wallet. The platform never custodies
// supply: this address is the agent or its confirmed owner, never t2000.
const RECIPIENT: address = @0xCAFE;

fun init(witness: TEMPLATE, ctx: &mut TxContext) {
    let (mut treasury, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        SYMBOL,
        NAME,
        DESCRIPTION,
        option::some(url::new_unsafe_from_bytes(ICON_URL)),
        ctx,
    );
    let supply = coin::mint(&mut treasury, TOTAL_SUPPLY, ctx);
    transfer::public_transfer(supply, RECIPIENT);
    transfer::public_freeze_object(metadata);
    transfer::public_freeze_object(treasury);
}
