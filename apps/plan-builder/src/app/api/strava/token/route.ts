import { NextResponse } from 'next/server';

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      grantType = 'authorization_code',
      code,
      refreshToken,
      clientId: customClientId,
      clientSecret: customClientSecret,
    } = body || {};

    const resolvedClientId = String(
      customClientId ||
      process.env.STRAVA_CLIENT_ID ||
      process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ||
      ''
    ).trim();

    const resolvedClientSecret = String(
      customClientSecret ||
      process.env.STRAVA_CLIENT_SECRET ||
      ''
    ).trim();

    if (!resolvedClientId || !resolvedClientSecret) {
      return NextResponse.json(
        {
          error:
            "Configuration OAuth Strava incomplète : veuillez renseigner votre Client ID et Client Secret Strava ou votre Access Token.",
          missingAppCredentials: true,
        },
        { status: 400 }
      );
    }

    const payload: Record<string, string> = {
      client_id: resolvedClientId,
      client_secret: resolvedClientSecret,
      grant_type: grantType,
    };

    if (grantType === 'refresh_token') {
      if (!refreshToken) {
        return NextResponse.json({ error: 'Refresh token Strava manquant.' }, { status: 400 });
      }
      payload.refresh_token = refreshToken;
    } else {
      if (!code) {
        return NextResponse.json({ error: "Code d'autorisation OAuth Strava manquant." }, { status: 400 });
      }
      payload.code = code;
    }

    const stravaRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await stravaRes.json().catch(() => ({}));

    if (!stravaRes.ok) {
      const errDetail =
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => `${e.field}: ${e.code}`).join(', ') : '') ||
        `Erreur Strava OAuth (${stravaRes.status})`;
      return NextResponse.json({ error: errDetail, details: data }, { status: stravaRes.status });
    }

    return NextResponse.json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athlete: data.athlete || null,
    });
  } catch (err: any) {
    console.error('[API Strava Token] Erreur:', err);
    return NextResponse.json(
      { error: err?.message || "Erreur serveur lors de l'échange de jeton Strava." },
      { status: 500 }
    );
  }
}

