// Central error sink: single choke point so failures are visible in one
// place (console) and could later be routed to telemetry/notification.
export function reportError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] ${msg}`);
}
