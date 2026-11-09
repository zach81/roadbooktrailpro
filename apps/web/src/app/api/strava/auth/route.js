import { NextResponse } from 'next/server';
import crypto from 'crypto';

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_ATHLETE_URL = 'https://www.strava.com/api/v3/athlete';

function cleanToken(raw) {
  if (!raw) return '';
  let str = String(raw).trim().replace(/^["']+|["']+$/g, '').trim();
  if (/^Bearer\s+/i.test(str)) {
    str = str.replace(/^Bearer\s+/i, '').trim();
  }
  return str;
}

/**
 * Génère les identifiants Firebase Auth déterministes liés de façon unique à l'ID d'athlète Strava vérifié par le serveur.
 */
function deriveFirebaseCredentialsForStravaAthlete(athleteId) {
  const safeId = String(athleteId).trim();
  const secretSeed =
    process.env.FIREBASE_AUTH_STRAVA_SECRET ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'trail-roadbook-pro-strava-auth-v1';

  const hmacPassword = crypto
    .createHmac('sha256', secretSeed)
    .update(`mykairn_strava_uid_${safeId}`)
    .digest('hex');

  return {
    firebaseEmail: `strava_${safeId}@strava.mykairn.app`,
    firebasePassword: `Stv#${hmacPassword.slice(0, 48)}!9`,
  };
}

/**
 * POST /api/strava/auth
 * Authentifie un utilisateur via Strava (soit par code OAuth2, soit par Access Token / Refresh Token),
 * vérifie son identité auprès des serveurs officiels Strava, et retourne ses identifiants de session Firebase
 * ainsi que ses jetons Strava à jour.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      code,
      accessToken: rawAccessToken,
      refreshToken: rawRefreshToken,
      clientId: customClientId,
      clientSecret: customClientSecret,
    } = body || {};

    const resolvedClientId = (
      customClientId ||
      process.env.STRAVA_CLIENT_ID ||
      process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ||
      ''
    ).trim();

    const resolvedClientSecret = (
      customClientSecret ||
      process.env.STRAVA_CLIENT_SECRET ||
      ''
    ).trim();

    let accessToken = cleanToken(rawAccessToken);
    let refreshToken = cleanToken(rawRefreshToken);
    let expiresAt = 0;
    let athlete = null;

    // Cas 1 : Échange d'un code d'autorisation OAuth2 Strava
    if (code) {
      if (!resolvedClientId || !resolvedClientSecret) {
        return NextResponse.json(
          {
            error:
              "Identifiants d'application Strava (Client ID / Client Secret) requis pour finaliser l'échange OAuth2. Renseignez-les dans le panneau Strava ou utilisez votre Access Token.",
            missingAppCredentials: true,
          },
          { status: 400 }
        );
      }

      const tokenRes = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: resolvedClientId,
          client_secret: resolvedClientSecret,
          code: String(code).trim(),
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        const detail =
          tokenData?.message ||
          (Array.isArray(tokenData?.errors)
            ? tokenData.errors.map((e) => `${e.field}: ${e.code}`).join(', ')
            : '') ||
          `Erreur OAuth Strava (${tokenRes.status})`;
        return NextResponse.json({ error: detail, details: tokenData }, { status: tokenRes.status });
      }

      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token || '';
      expiresAt = tokenData.expires_at || 0;
      athlete = tokenData.athlete || null;
    }

    // Cas 2 : Pas de code OAuth, mais un Refresh Token fourni (ou si l'Access Token doit être vérifié)
    if (!athlete && accessToken) {
      const profileRes = await fetch(STRAVA_ATHLETE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (profileRes.ok) {
        athlete = await profileRes.json();
      } else if (profileRes.status === 401 && refreshToken && resolvedClientId && resolvedClientSecret) {
        // Rafraîchissement automatique si l'Access Token est expiré
        const refreshRes = await fetch(STRAVA_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: resolvedClientId,
            client_secret: resolvedClientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          accessToken = refreshData.access_token;
          refreshToken = refreshData.refresh_token || refreshToken;
          expiresAt = refreshData.expires_at || 0;

          const retryRes = await fetch(STRAVA_ATHLETE_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (retryRes.ok) {
            athlete = await retryRes.json();
          }
        }
      } else {
        const errBody = await profileRes.json().catch(() => ({}));
        return NextResponse.json(
          {
            error:
              errBody?.message ||
              `Access Token Strava invalide ou expiré (HTTP ${profileRes.status}). Vérifiez votre jeton sur strava.com/settings/api.`,
          },
          { status: 401 }
        );
      }
    }

    // Cas 3 : Uniquement un Refresh Token fourni
    if (!athlete && !accessToken && refreshToken) {
      if (!resolvedClientId || !resolvedClientSecret) {
        return NextResponse.json(
          {
            error: 'Client ID et Client Secret requis pour rafraîchir le Refresh Token Strava.',
            missingAppCredentials: true,
          },
          { status: 400 }
        );
      }

      const refreshRes = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: resolvedClientId,
          client_secret: resolvedClientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const refreshData = await refreshRes.json().catch(() => ({}));
      if (!refreshRes.ok) {
        return NextResponse.json(
          { error: refreshData?.message || `Échec du rafraîchissement Strava (${refreshRes.status})` },
          { status: refreshRes.status }
        );
      }

      accessToken = refreshData.access_token;
      refreshToken = refreshData.refresh_token || refreshToken;
      expiresAt = refreshData.expires_at || 0;
    }

    // Si on a un accessToken mais pas encore l'objet athlete complet, on le récupère
    if (!athlete && accessToken) {
      const profileRes = await fetch(STRAVA_ATHLETE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        athlete = await profileRes.json();
      }
    }

    if (!athlete || !athlete.id) {
      return NextResponse.json(
        { error: "Impossible de vérifier le profil d'athlète auprès de Strava." },
        { status: 401 }
      );
    }

    const { firebaseEmail, firebasePassword } = deriveFirebaseCredentialsForStravaAthlete(athlete.id);

    return NextResponse.json({
      firebaseEmail,
      firebasePassword,
      accessToken,
      refreshToken,
      expiresAt,
      athlete: {
        id: athlete.id,
        firstname: athlete.firstname || '',
        lastname: athlete.lastname || '',
        username: athlete.username || '',
        profile: athlete.profile || athlete.profile_medium || '',
        city: athlete.city || '',
        country: athlete.country || '',
        sex: athlete.sex || '',
        weight: athlete.weight || null,
      },
    });
  } catch (err) {
    console.error('[API Strava Auth] Erreur:', err);
    return NextResponse.json(
      { error: err?.message || "Erreur serveur lors de l'authentification Strava." },
      { status: 500 }
    );
  }
}

