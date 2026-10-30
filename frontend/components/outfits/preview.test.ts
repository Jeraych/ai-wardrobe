import { describe, expect, it } from "vitest";
import { getSavedTryOnState } from "./preview";

describe("saved outfit preview hydration", () => {
  it("restores a persisted generation result after an API round trip", () => {
    const saved = { _id: "outfit-test", name: "Saved Fit", items: [{ _id: "item-test" }],
      lastTryOnPreviewUrl: "https://res.cloudinary.com/test/image/upload/preview.webp" };
    const response = JSON.parse(JSON.stringify(saved));
    expect(getSavedTryOnState(response)).toEqual({
      tryOnResultUrl: saved.lastTryOnPreviewUrl, isTryOnActive: true,
    });
    expect(response).toEqual(saved);
  });
  it.each([{}, { lastTryOnPreviewUrl: null }, { lastTryOnPreviewUrl: "" }])(
    "keeps the placeholder for an outfit with no saved preview: %j", (outfit) => {
      expect(getSavedTryOnState(outfit)).toEqual({ tryOnResultUrl: null, isTryOnActive: false });
    },
  );
});
