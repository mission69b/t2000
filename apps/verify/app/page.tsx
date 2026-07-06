import { ProductStrip } from "./components/product-strip";
import { SiteFooter } from "./components/site-footer";
import { SiteNav } from "./components/site-nav";
import { VerifyLive } from "./components/verify-hub";
import { VerifyCloser, VerifyHow } from "./components/verify-shell";

// Section order per the designer's verify/index.html:
// Nav → Hero (verifier) → Ledger → How → ProductStrip → Closer → Footer.
export default function Page() {
  return (
    <>
      <SiteNav />
      <VerifyLive />
      <VerifyHow />
      <ProductStrip />
      <VerifyCloser />
      <SiteFooter />
    </>
  );
}
