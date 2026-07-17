/**
 * Balance reads via gRPC — the ONLY read path this app uses.
 *
 * Sui JSON-RPC is deactivated on mainnet July 31, 2026; all reads go
 * through SuiGrpcClient (`@mysten/sui/grpc`). Server-side so the fullnode
 * endpoint stays swappable in one place.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidSuiAddress } from "@mysten/sui/utils";

const client = new SuiGrpcClient({
  baseUrl: "https://fullnode.mainnet.sui.io",
  network: "mainnet",
});

export interface CoinRow {
  coinType: string;
  symbol: string;
  /** Display amount, floored to the token's decimals (never rounded up). */
  amount: string;
}

export async function GET(req: Request): Promise<Response> {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner || !isValidSuiAddress(owner)) {
    return Response.json({ error: "Invalid or missing ?owner address" }, { status: 400 });
  }

  const { balances } = await client.core.listBalances({ owner, limit: 20 });
  const held = balances.filter((b) => BigInt(b.balance) > 0n);

  const coins: CoinRow[] = await Promise.all(
    held.map(async (b) => {
      const meta = await client.core
        .getCoinMetadata({ coinType: b.coinType })
        .catch(() => null);
      const decimals = meta?.coinMetadata?.decimals ?? 9;
      const symbol =
        meta?.coinMetadata?.symbol ?? b.coinType.split("::").pop() ?? b.coinType;

      // Floor, never round — a displayed amount must be <= the on-chain
      // balance or downstream transaction builders overdraw.
      const raw = BigInt(b.balance);
      const base = 10n ** BigInt(decimals);
      const whole = raw / base;
      const displayDp = BigInt(10 ** Math.min(decimals, 4));
      const frac = ((raw % base) * displayDp) / base;
      const amount =
        frac > 0n
          ? `${whole}.${frac.toString().padStart(4, "0").replace(/0+$/, "")}`
          : whole.toString();

      return { coinType: b.coinType, symbol, amount };
    }),
  );

  return Response.json({ coins });
}
