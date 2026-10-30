import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { firstInvalidStep, saveOnboardingError, OnboardingFeedback } from "./onboarding-feedback";

describe("onboarding submission recovery", () => {
  it("returns a refreshed final step to missing earlier profile fields", () => {
    const errors = { firstName: { type: "required" }, lastName: { type: "required" },
      age: { type: "required" }, gender: { type: "required" } };
    expect(firstInvalidStep(errors)).toBe(0);
    // The user can correct those fields and continue to the next remaining error.
    expect(firstInvalidStep({ stylePreference: { type: "invalid" }, selectedModelId: { type: "required" } })).toBe(1);
    expect(firstInvalidStep({ selectedModelId: { type: "required" } })).toBe(2);
    expect(firstInvalidStep({})).toBe(-1);
  });
  it("settles a rejected save and renders its error as visible accessible feedback", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Database unavailable. Please try again later."));
    const message = await saveOnboardingError(save);
    expect(save).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(createElement(OnboardingFeedback, { message }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Database unavailable. Please try again later.");
  });
  it("a successful retry clears the error so normal navigation can continue", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Temporary error")).mockResolvedValueOnce(undefined);
    expect(await saveOnboardingError(save)).toBe("Temporary error");
    const message = await saveOnboardingError(save);
    expect(message).toBeNull();
    expect(renderToStaticMarkup(createElement(OnboardingFeedback, { message }))).toBe("");
  });
  it("non-Error failures also produce visible feedback", async () => {
    const message = await saveOnboardingError(async () => { throw null; });
    expect(renderToStaticMarkup(createElement(OnboardingFeedback, { message }))).toContain("Could not save onboarding");
  });
});
