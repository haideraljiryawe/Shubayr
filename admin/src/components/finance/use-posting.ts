"use client";

import { useCallback, useRef, useState } from "react";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  isUnknownOutcome,
  resolveOutcome,
  type FinancialDocument,
} from "@/lib/finance/operations";

export type PostingState =
  | { phase: "idle" }
  | { phase: "posting" }
  | { phase: "posted"; document: FinancialDocument }
  /** The answer was lost; asking the API what happened. */
  | { phase: "checking" }
  /** Confirmed not committed: retrying with the same id is safe. */
  | { phase: "notPosted" }
  /** The first request is still being committed; check again shortly. */
  | { phase: "processing" }
  | { phase: "error"; error: ApiError };

/**
 * Post a financial document exactly once (see lib/finance/operations.ts).
 *
 * `post` refuses to start while a post is in flight — a double click is
 * dropped here, before any request, and the shared operation id makes the
 * API return the same document even if two requests did get out. When the
 * answer is lost, it asks GET /admin/operations/{id} before anything else.
 */
export function usePosting() {
  const [state, setState] = useState<PostingState>({ phase: "idle" });
  const inFlight = useRef(false);

  const check = useCallback(async (operationId: string) => {
    setState({ phase: "checking" });
    let outcome;
    try {
      outcome = await unwrap(
        browserApi.GET("/admin/operations/{operationId}", {
          params: { path: { operationId } },
        }),
      );
    } catch (cause) {
      outcome = cause instanceof ApiError ? cause : new ApiError(0, "Network error");
    }
    const resolution = resolveOutcome(outcome);
    switch (resolution.kind) {
      case "posted":
        setState({ phase: "posted", document: resolution.document });
        return;
      case "notPosted":
        setState({ phase: "notPosted" });
        return;
      case "processing":
        setState({ phase: "processing" });
        return;
      default:
        setState({
          phase: "error",
          error: outcome instanceof ApiError ? outcome : new ApiError(resolution.status ?? 0, "Posting failed"),
        });
    }
  }, []);

  const post = useCallback(
    async (operationId: string, send: () => Promise<FinancialDocument>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState({ phase: "posting" });
      try {
        const document = await send();
        setState({ phase: "posted", document });
      } catch (cause) {
        if (isUnknownOutcome(cause)) {
          await check(operationId);
        } else {
          setState({ phase: "error", error: cause as ApiError });
        }
      } finally {
        inFlight.current = false;
      }
    },
    [check],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, post, check, reset };
}
