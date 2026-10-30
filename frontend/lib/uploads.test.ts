import { describe, expect, it } from "vitest";
import { imageSizeError, MAX_IMAGE_BYTES, IMAGE_SIZE_ERROR } from "./uploads";
describe("deployment image upload limit", () => {
  it("allows 4 MB and rejects the next byte before uploading", () => {
    expect(imageSizeError({ size: MAX_IMAGE_BYTES })).toBeNull();
    expect(imageSizeError({ size: MAX_IMAGE_BYTES + 1 })).toBe(IMAGE_SIZE_ERROR);
  });
});
