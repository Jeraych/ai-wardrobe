import React from "react";
import type { FieldPath } from "react-hook-form";
import { ONBOARDING_STEP_ORDER, STEP_TITLES } from "./onboarding-data";
import type { OnboardingFormValues } from "./onboarding-schema";

export const STEP_FIELDS = {
  "body-profile": [
    "firstName",
    "lastName",
    "age",
    "height",
    "weight",
    "bodyShape",
    "gender",
  ],
  "about-yourself": ["stylePreference"],
  "select-model": ["modelMode", "modelPhoto", "selectedModelId"],
} as const satisfies Record<
  keyof typeof STEP_TITLES,
  readonly FieldPath<OnboardingFormValues>[]
>;

export function firstInvalidStep(errors: Record<string, unknown>): number {
  return ONBOARDING_STEP_ORDER.findIndex(step => STEP_FIELDS[step].some(field => Boolean(errors[field])));
}

// Convert service rejection into visible feedback instead of an unhandled submit promise.
export async function saveOnboardingError(save: () => Promise<void>): Promise<string | null> {
  try {
    await save();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not save onboarding. Please try again.";
  }
}

export function OnboardingFeedback({ message }: { message: string | null }) {
  return message ? <p role="alert" className="mb-4 text-sm text-red-600">{message}</p> : null;
}
