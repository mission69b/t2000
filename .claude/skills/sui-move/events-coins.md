# Events and Coins

## Events

Events let Move code emit data that offchain systems can subscribe to. Events are not stored onchain as objects; they exist only in the transaction's effects.

```move
use sui::event;

public struct ItemCreated has copy, drop {
    item_id: ID,
    creator: address,
}

public fun create_item(ctx: &mut TxContext) {
    let item = Item { id: object::new(ctx) };
    event::emit(ItemCreated {
        item_id: object::id(&item),
        creator: ctx.sender(),
    });
    transfer::transfer(item, ctx.sender());
}
```

Event structs must have `copy` and `drop` abilities. Subscribe to events offchain using the Sui TypeScript SDK or GraphQL API, filtering by event type.

## Coin operations

The `sui::coin` module provides the standard fungible token implementation. Key operations:

- `coin::create_currency(witness, decimals, symbol, name, description, icon_url, ctx)`: Creates a new currency using a One-Time Witness. Returns a `TreasuryCap` (for minting/burning) and `CoinMetadata`. **Warning:** Never freeze or share the `TreasuryCap` — doing so might allow malicious actors to call functions as the currency owner. Always transfer it to a controlled address.
- `coin::mint(treasury_cap, amount, ctx)`: Mint new coins.
- `coin::burn(treasury_cap, coin)`: Burn coins.
- `coin::split(coin, amount, ctx)`: Split a coin, returning a new coin with the specified amount.
- `coin::join(coin1, coin2)`: Merge two coins of the same type into one (called `merge` at the PTB level).
- `coin::value(coin)`: Read the balance of a coin.

The native gas token SUI is itself a `Coin` type — specifically `Coin<SUI>`, where `SUI` is the type defined at `0x2::sui::SUI`. It follows all the same `coin::` operations listed above (split, join, etc.). Coins are objects with `key` and `store`, so they can be freely transferred and stored.
