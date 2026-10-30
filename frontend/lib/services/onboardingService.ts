import { imageSizeError } from "@/lib/uploads";
import { selectedDefaultModelImage } from "@/components/onboarding/onboarding-data";
import type { OnboardingFormValues } from "@/components/onboarding/onboarding-schema";
import { getAuthHeaders } from "@/lib/api/auth";

type AuthSession = {
  user?: {
    name?: string | null;
    email?: string | null;
  };
};

type UserProfilePayload = {
  name: string;
  bodyProfile: {
    age: number | null;
    height: number | null;
    weight: number | null;
    bodyType: string | null;
    gender: string | null;
  };
  stylePreferences: string[];
  modelImage: string | null;
  isCompleteOnboarding: boolean;
};

export class OnboardingService {
  private readonly apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001";

  // Persist onboarding in two phases: profile fields first, then optional image upload.
  async save(
    values: OnboardingFormValues,
    session?: AuthSession,
  ): Promise<void> {
    const name = this.buildName(values);
    const payload = this.buildProfilePayload(values, name);
    await this.ensureUserSynced(session, name);
    const response = await fetch(`${this.apiUrl}/api/users/me`, {
      method: "PUT",
      headers: await getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Failed to save onboarding profile (${response.status} ${response.statusText})${details ? `: ${details}` : ""}`,
      );
    }

    const uploadedPhoto = values.modelPhoto?.[0] ?? null;
    if (values.modelMode === "upload" && uploadedPhoto) {
      await this.uploadModelImage(uploadedPhoto);
    }
  }

  // Auth0 owns identity; the backend sync creates the app-specific MongoDB profile.
  private async ensureUserSynced(
    session: AuthSession | undefined,
    name: string,
  ): Promise<void> {
    const email = session?.user?.email;

    if (!email) {
      return;
    }

    const response = await fetch(`${this.apiUrl}/api/users/me/sync`, {
      method: "POST",
      headers: await getAuthHeaders(true),
      body: JSON.stringify({ name, email }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Failed to sync user profile (${response.status} ${response.statusText})${details ? `: ${details}` : ""}`,
      );
    }
  }

  private buildName(values: OnboardingFormValues): string {
    return `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
  }

  // Match backend User fields while preserving optional measurements as null.
  private buildProfilePayload(
    values: OnboardingFormValues,
    name: string,
  ): UserProfilePayload {
    return {
      name,
      bodyProfile: {
        age: values.age ? Number(values.age) : null,
        height: values.height ? Number(values.height) : null,
        weight: values.weight ? Number(values.weight) : null,
        bodyType: values.bodyShape ?? null,
        gender: values.gender ?? null,
      },
      stylePreferences: values.stylePreference,
      modelImage:
        // A missing asset configuration must not silently persist an unusable model image.
        values.modelMode === "select"
          ? selectedDefaultModelImage(values.selectedModelId)
          : null,
      isCompleteOnboarding: true,
    };
  }

  // Multipart uploads should not include a JSON content type header.
  private async uploadModelImage(image: File): Promise<void> {
    const error = imageSizeError(image);
    if (error) throw new Error(error);
    const formData = new FormData();
    formData.append("image", image);

    const response = await fetch(`${this.apiUrl}/api/users/me/photo/upload`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Failed to upload model image (${response.status} ${response.statusText})${details ? `: ${details}` : ""}`,
      );
    }
  }
}

export const onboardingService = new OnboardingService();
