import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";

// Server route that exposes only the backend API access token to client components.
export async function GET() {
  try {
    const { token } = await auth0.getAccessToken();
    return NextResponse.json({ token }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ token: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
