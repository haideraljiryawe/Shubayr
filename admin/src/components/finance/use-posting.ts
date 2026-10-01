"use client";

import { useCallback, useRef, useState } from "react";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  isUnknownOutcome,
  resolveOutcome,
  type FinancialDocument,
} from "@/lib/finance/operations";

export type PostingState<T = FinancialDocument> =
  | { phase: "idle" }
  | { phase: "posting" }
  | { phase: "posted"; document: T }
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
 * `post` and `check` resolve to the state they settled on (null when a post
 * was dropped as a double click), so a caller can chain a second document.
 */
export function usePosting<T = FinancialDocument>() {
  const [state, setState] = useState<PostingState<T>>({ phase: "idle" });
  const inFlight = useRef(false);

  const settle = useCallback((next: PostingState<T>): PostingState<T> => {
    setState(next);
    return next;
  }, []);

  const check = useCallback(async (operationId: string): Promise<PostingState<T>> => {
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
    const resolution = resolveOutcome<T>(outcome);
    switch (resolution.kind) {
      case "posted":
        return settle({ phase: "posted", document: resolution.document });
      case "notPosted":
        return settle({ phase: "notPosted" });
      case "processing":
        return settle({ phase: "processing" });
      default:
        return settle({
          phase: "error",
          error: outcome instanceof ApiError ? outcome : new ApiError(resolution.status ?? 0, "Posting failed"),
        });
    }
  }, [settle]);

  const post = useCallback(
    async (operationId: string, send: () => Promise<T>): Promise<PostingState<T> | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setState({ phase: "posting" });
      try {
        const document = await send();
        return settle({ phase: "posted", document });
      } catch (cause) {
        if (isUnknownOutcome(cause)) return await check(operationId);
        return settle({ phase: "error", error: cause as ApiError });
      } finally {
        inFlight.current = false;
      }
    },
    [check, settle],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, post, check, reset };
}
