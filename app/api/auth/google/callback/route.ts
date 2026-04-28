// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.json(
      { error: "Missing 'code' from Google OAuth callback" },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const bubbleRedirect = process.env.BUBBLE_REDIRECT_URL;

  if (!clientId || !clientSecret || !bubbleRedirect) {
    return NextResponse.json(
      { error: "Server missing env vars" },
      { status: 500 }
    );
  }

  // This must match the redirect URI in Google Cloud
  const redirectUri =
    "https://connectiumai-sso-bridge.vercel.app/api/auth/google/callback";

  try {
    // 1. Exchange "code" for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Google token error:", text);
      return NextResponse.json(
        { error: "Failed to exchange code for tokens" },
        { status: 502 }
      );
    }

    const tokenJson: any = await tokenRes.json();
    const accessToken = tokenJson.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token from Google" },
        { status: 502 }
      );
    }

    // 2. Fetch Google user info (`sub`, email, etc.)
    const userRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      const text = await userRes.text();
      console.error("Google userinfo error:", text);
      return NextResponse.json(
        { error: "Failed to fetch user info from Google" },
        { status: 502 }
      );
    }

    const userJson: any = await userRes.json();
    const sub = userJson.sub;
    const email = userJson.email;

    // 3. Redirect to Bubble generic redirect URL with data
    const bubbleUrl = new URL(bubbleRedirect);
    if (sub) bubbleUrl.searchParams.set("google_sub", sub);
    if (email) bubbleUrl.searchParams.set("email", email);
    if (state) bubbleUrl.searchParams.set("state", state);

    return NextResponse.redirect(bubbleUrl.toString(), { status: 302 });
  } catch (err) {
    console.error("Unexpected error in Google callback:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
