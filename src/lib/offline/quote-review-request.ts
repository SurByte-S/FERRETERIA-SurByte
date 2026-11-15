import type { OfflineQuoteCommercialResult } from "./validate-quote-commercial";

export type ReviewState =
  | { status: "closed" | "loading" }
  | { status: "error"; message: string }
  | { status: "result"; result: OfflineQuoteCommercialResult };
type Lease = { check: () => void; subscribe: (listener: () => void) => () => void };

// In-memory only. Retain the session subscription while a result is visible.
// Routine A.3 revalidation does not change the lease generation.
export class QuoteReviewRequest {
  private generation = 0;
  private unsubscribe?: () => void;
  private busy = false;
  constructor(private readonly publish: (state: ReviewState) => void) {}

  cancel() {
    this.generation++;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.busy = false;
  }

  async run(capture: () => Lease, request: () => Promise<OfflineQuoteCommercialResult>) {
    if (this.busy) return;
    this.cancel();
    const generation = this.generation;
    this.busy = true;
    this.publish({ status: "loading" });
    try {
      const lease = capture();
      const invalidate = () => {
        try { lease.check(); } catch {
          this.cancel();
          this.publish({ status: "error", message: "La sesión cambió o venció. Abrí una pantalla nueva para revisar. El pendiente se conserva." });
        }
      };
      this.unsubscribe = lease.subscribe(invalidate);
      lease.check();
      const result = await request();
      if (generation !== this.generation) return;
      lease.check();
      this.publish({ status: "result", result });
    } catch {
      if (generation !== this.generation) return;
      this.cancel();
      this.publish({ status: "error", message: "No se pudo completar la revisión. Verificá la conexión y la sesión e intentá nuevamente. El pendiente se conserva." });
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
}
