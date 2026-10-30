"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FormProvider,
  useForm,
  useController,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OnboardingShell } from "./OnboardingShell";
import { STEP_FIELDS, firstInvalidStep, saveOnboardingError, OnboardingFeedback } from "./onboarding-feedback";
import {
  getStepKey,
  ONBOARDING_STEP_ORDER,
  STEP_TITLES,
} from "./onboarding-data";
import {
  DEFAULT_ONBOARDING_VALUES,
  onboardingFormSchema,
  type OnboardingFormValues,
} from "./onboarding-schema";
import { BodyProfileStep } from "./steps/BodyProfileStep";
import { AboutYourselfStep } from "./steps/AboutYourselfStep";
import { SelectModelStep } from "./steps/SelectModelStep";
import { onboardingService } from "@/lib/services/onboardingService";

interface OnboardingFlowProps {
  initialStepIndex?: number;
  session?: {
    user?: {
      name?: string | null;
      email?: string | null;
    };
  };
}

// Coordinates step routing, form validation, and final persistence for onboarding.
export function OnboardingFlow({
  initialStepIndex = 0,
  session,
}: OnboardingFlowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const methods = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: DEFAULT_ONBOARDING_VALUES,
    shouldUnregister: false,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  useController({
    name: "modelMode",
    control: methods.control,
  });
  useController({
    name: "selectedModelId",
    control: methods.control,
  });

  const currentStep = getStepKey(stepIndex);

  // Keep the current step in the URL so refreshes and links can reopen the same step.
  useEffect(() => {
    router.replace(`${pathname}?step=${currentStep}`, { scroll: false });
  }, [currentStep, pathname, router]);

  // Validate only the fields for the visible step instead of blocking on future steps.
  const handleNext = async () => {
    const isValid = await methods.trigger(STEP_FIELDS[currentStep], {
      shouldFocus: true,
    });
    if (!isValid) return;

    setSubmitError(null);
    setStepIndex((value) =>
      Math.min(value + 1, ONBOARDING_STEP_ORDER.length - 1),
    );
  };

  const handleBack = () => {
    setSubmitError(null);
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const onSubmit = methods.handleSubmit(
    async (values) => {
      // Final submission persists all steps and then enters the authenticated app.
      setSubmitError(null);
      const error = await saveOnboardingError(() => onboardingService.save(values, session));
      if (error) {
        setSubmitError(error);
        return;
      }
      router.push("/");
    },
    async (errors) => {
      const invalidStep = firstInvalidStep(errors);
      if (invalidStep >= 0) setStepIndex(invalidStep);
      setSubmitError("Please complete the highlighted fields before continuing.");
    },
  );

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className="block">
        <OnboardingShell
          step={stepIndex + 1}
          totalSteps={ONBOARDING_STEP_ORDER.length}
          stepLabel={STEP_TITLES[currentStep]}
          contentClassName={
            currentStep === "select-model" ? "max-w-4xl" : "max-w-md"
          }
        >
          <OnboardingFeedback message={submitError} />
          {currentStep === "body-profile" ? (
            <BodyProfileStep onNext={handleNext} />
          ) : null}
          {currentStep === "about-yourself" ? (
            <AboutYourselfStep onBack={handleBack} onNext={handleNext} />
          ) : null}
          {currentStep === "select-model" ? (
            <SelectModelStep onBack={handleBack} />
          ) : null}
        </OnboardingShell>
      </form>
    </FormProvider>
  );
}
