"use client";

import { useEffect } from "react";

export function AbortErrorSuppressor() {
  useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (isAbortErrorLike(event.reason)) {
        event.preventDefault();
      }
    }

    function handleWindowError(event: ErrorEvent) {
      if (isAbortErrorLike(event.error) || isAbortErrorMessage(event.message)) {
        event.preventDefault();
      }
    }

    window.addEventListener("unhandledrejection", handleUnhandledRejection, true);
    window.addEventListener("error", handleWindowError, true);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection, true);
      window.removeEventListener("error", handleWindowError, true);
    };
  }, []);

  return null;
}

function isAbortErrorLike(error: unknown) {
  if (!error || typeof error !== "object") {
    return isAbortErrorMessage(typeof error === "string" ? error : "");
  }

  const candidate = error as { message?: unknown; name?: unknown };

  return (
    candidate.name === "AbortError" ||
    isAbortErrorMessage(typeof candidate.message === "string" ? candidate.message : "")
  );
}

function isAbortErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("user aborted a request") ||
    normalized.includes("request aborted") ||
    normalized.includes("operation was aborted") ||
    normalized.includes("the user aborted")
  );
}
