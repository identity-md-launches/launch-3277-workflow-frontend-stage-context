import type { TxState } from "../chain";
import { useRuntime } from "../chain";
const TITLE: Record<string, string> = {
  simulating: "Checking", wallet: "Waiting for your wallet", pending: "Pending", confirmed: "Confirmed",
  reverted: "Reverted", rejected: "Rejected", failed: "Not sent",
};
/** A stable live region: the outcome text comes from the receipt or a re-read, never the simulation. */
export function TxStatus({ state }: { state: TxState }) {
  const { rt } = useRuntime();
  return (
    <div className={`tx tx-${state.phase}`} role="status" aria-live="polite">
      {state.phase !== "idle" && (
        <>
          <strong>{TITLE[state.phase]}{state.label ? `: ${state.label}` : ""}</strong>
          {state.message && <span> {state.message}</span>}
          {state.hash && <> <a href={rt.explorer("tx", state.hash)} target="_blank" rel="noreferrer">View transaction</a></>}
        </>
      )}
    </div>
  );
}
