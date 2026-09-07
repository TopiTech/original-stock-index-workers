import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomIndex } from "../data/indices";
import { getIndicesRequestHeaders } from "./useIndices";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getIndicesRequestHeaders", () => {
  it("does not send an ETag when the corresponding cached response body is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue('"old-etag"'),
    });

    expect(getIndicesRequestHeaders(null)).toEqual({});
  });

  it("uses an ETag only with a locally available indices response", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue('"current-etag"'),
    });

    expect(getIndicesRequestHeaders([] as CustomIndex[])).toEqual({
      "If-None-Match": '"current-etag"',
    });
  });
});
