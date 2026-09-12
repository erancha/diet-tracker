import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { fromUpstream } from "./upstream";

const gatewayGaveUp = new ApiError(503, 'POST /chat → 503: {"message":"Service Unavailable"}');

describe("fromUpstream", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the request's own result and never reads the transcript", async () => {
    const landed = vi.fn();

    expect(await fromUpstream(() => Promise.resolve("answer"), landed, 3000, vi.fn())).toBe("answer");
    expect(landed).not.toHaveBeenCalled();
  });

  it("rethrows a failure the handler gave a reason for, without reading the transcript", async () => {
    const refused = new ApiError(502, 'POST /chat → 502: {"error": "השירות אינו זמין"}', "השירות אינו זמין");
    const landed = vi.fn();

    await expect(fromUpstream(() => Promise.reject(refused), landed, 3000, vi.fn())).rejects.toBe(refused);
    expect(landed).not.toHaveBeenCalled();
  });

  it("rethrows a rejection of the request itself, without reading the transcript", async () => {
    const rejected = new ApiError(403, 'POST /chat → 403: {"message":"Forbidden"}');
    const landed = vi.fn();

    await expect(fromUpstream(() => Promise.reject(rejected), landed, 3000, vi.fn())).rejects.toBe(rejected);
    expect(landed).not.toHaveBeenCalled();
  });

  it("reads the transcript at the poll interval once the gateway gave up, until the result lands", async () => {
    const landed = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce("answer");
    const polling = vi.fn();

    const result = fromUpstream(() => Promise.reject(gatewayGaveUp), landed, 3000, polling);
    await vi.advanceTimersByTimeAsync(0);
    expect(polling).toHaveBeenCalledTimes(1);
    expect(landed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(landed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000);

    expect(await result).toBe("answer");
    expect(landed).toHaveBeenCalledTimes(3);
  });

  it("treats a dropped connection like the gateway giving up", async () => {
    const landed = vi.fn().mockResolvedValue("answer");

    const result = fromUpstream(() => Promise.reject(new TypeError("Failed to fetch")), landed, 3000, vi.fn());
    await vi.advanceTimersByTimeAsync(3000);

    expect(await result).toBe("answer");
  });

  it("gives up with the original failure once the Lambda's own wait has passed", async () => {
    const landed = vi.fn().mockResolvedValue(null);

    const result = fromUpstream(() => Promise.reject(gatewayGaveUp), landed, 3000, vi.fn());
    const outcome = result.then(() => "resolved", (failure: unknown) => failure);
    await vi.advanceTimersByTimeAsync(70_000);

    expect(await outcome).toBe(gatewayGaveUp);
    expect(landed.mock.calls.length).toBeGreaterThan(5);
    expect(landed.mock.calls.length).toBeLessThan(25);
  });
});
