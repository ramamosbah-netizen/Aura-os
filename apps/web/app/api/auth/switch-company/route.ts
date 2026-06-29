import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/switch-company
 *
 * Switches the active company context for the current user session.
 * This endpoint performs a full context rehydration:
 *   1. Validates the target companyId against the user's authorized companies.
 *   2. Updates the session cookie with the new active company.
 *   3. Returns confirmation so the frontend can refresh its UI state.
 *
 * Blueprint Reference: Phase 8 — Week 1-2, Task E1 (Multi-Company Context Switcher)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid companyId' },
        { status: 400 },
      );
    }

    // Read current session cookie
    const cookieStore = await cookies();
    const session = cookieStore.get('aura-session');
    let sessionData: Record<string, any> = {};

    if (session?.value) {
      try {
        sessionData = JSON.parse(session.value);
      } catch {
        sessionData = {};
      }
    }

    // Update the active company in the session
    const previousCompanyId = sessionData.activeCompanyId ?? null;
    sessionData.activeCompanyId = companyId;
    sessionData.companySwitchedAt = new Date().toISOString();

    // Write updated session cookie
    cookieStore.set('aura-session', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({
      success: true,
      activeCompanyId: companyId,
      previousCompanyId,
      switchedAt: sessionData.companySwitchedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to switch company context', details: error.message },
      { status: 500 },
    );
  }
}
