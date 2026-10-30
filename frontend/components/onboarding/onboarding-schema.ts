import { MAX_IMAGE_BYTES, IMAGE_SIZE_ERROR } from "@/lib/uploads";
import { z } from "zod";
import { BODY_SHAPES, GENDERS, STYLE_OPTIONS } from "./onboarding-data";

// FileList only exists in the browser, so the schema must tolerate server-side evaluation.
const fileListSchema = z.custom<FileList | null>((value) => {
  if (value == null) {
    return true;
  }

  return typeof FileList !== "undefined" && value instanceof FileList;
}, "Please upload a photo.").refine((value) => !value?.[0] || value[0].size <= MAX_IMAGE_BYTES, IMAGE_SIZE_ERROR);

export const onboardingStep1Schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required."),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required."),
  age: z
    .string()
    .trim()
    .min(1, "Age is required.")
    .refine((value) => Number.isFinite(Number(value)), {
      message: "Age must be a number.",
    })
    .refine((value) => Number(value) >= 0, {
      message: "Age must be a non-negative number.",
    }),
  height: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || Number.isFinite(Number(value)), {
      message: "Height must be a number.",
    }),
  weight: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || Number.isFinite(Number(value)), {
      message: "Weight must be a number.",
    }),
  bodyShape: z.enum(BODY_SHAPES).nullable(),
  gender: z
    .enum(GENDERS)
    .nullable()
    .refine((value) => value !== null, "Gender is required."),
});

export const onboardingStep2Schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required."),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required."),
  stylePreference: z.array(z.enum(STYLE_OPTIONS)),
});

export const onboardingStep3Schema = z
  .object({
    modelMode: z.enum(["upload", "select"]).nullable(),
    modelPhoto: fileListSchema,
    selectedModelId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    // Users can either upload their own model photo or choose one of the defaults.
    const hasFile = Boolean(value.modelPhoto?.[0]);
    const hasModel = Boolean(value.selectedModelId);

    if (value.modelMode === "upload") {
      if (!hasFile) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Upload a photo before continuing.",
          path: ["modelPhoto"],
        });
      }
      return;
    }

    if (value.modelMode === "select" && !hasModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a model to continue.",
        path: ["selectedModelId"],
      });
      return;
    }

    if (!hasFile && !hasModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Upload a photo or choose a model before continuing.",
        path: ["modelPhoto"],
      });
    }
  });

export const onboardingFormSchema = z.object({
  firstName: onboardingStep1Schema.shape.firstName,
  lastName: onboardingStep1Schema.shape.lastName,
  age: onboardingStep1Schema.shape.age,
  height: onboardingStep1Schema.shape.height,
  weight: onboardingStep1Schema.shape.weight,
  bodyShape: onboardingStep1Schema.shape.bodyShape,
  gender: onboardingStep1Schema.shape.gender,
  stylePreference: onboardingStep2Schema.shape.stylePreference,
  modelMode: onboardingStep3Schema.shape.modelMode,
  modelPhoto: onboardingStep3Schema.shape.modelPhoto,
  selectedModelId: onboardingStep3Schema.shape.selectedModelId,
});

export type OnboardingFormValues = z.input<typeof onboardingFormSchema>;
export type OnboardingFormOutput = z.output<typeof onboardingFormSchema>;

export type OnboardingStep1Values = z.infer<typeof onboardingStep1Schema>;
export type OnboardingStep2Values = z.infer<typeof onboardingStep2Schema>;
export type OnboardingStep3Values = z.infer<typeof onboardingStep3Schema>;

// Defaults keep react-hook-form controlled while allowing optional onboarding answers.
export const DEFAULT_ONBOARDING_VALUES: OnboardingFormValues = {
  firstName: "",
  lastName: "",
  age: "",
  height: "",
  weight: "",
  bodyShape: null,
  gender: null,
  stylePreference: [],
  modelMode: null,
  modelPhoto: null,
  selectedModelId: null,
};
