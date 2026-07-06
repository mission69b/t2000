import { VerifyHub } from "./components/verify-hub";
import {
  VerifyCloser,
  VerifyHow,
  VerifyNav,
} from "./components/verify-shell";

export default function Page() {
  return (
    <>
      <VerifyNav />
      <VerifyHub />
      <VerifyHow />
      <VerifyCloser />
      <div className="h-16" />
    </>
  );
}
