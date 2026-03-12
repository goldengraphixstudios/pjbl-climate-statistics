import React, { useState } from 'react';
import { AdminShieldIcon } from '../../components/RoleIcons';
import '../../styles/Auth.css';
import {
  cacheStaffLoginHint,
  clearStaleSupabaseAuthStorage,
  getAuthFailureReason,
  getCachedStaffEmail,
  getFriendlyAuthErrorMessage,
  getUserProfileByIdentifier,
  signIn,
  signOut,
  supabase,
} from '../../services/supabaseClient';

interface AdminLoginProps {
  onLogin: (username: string, role: 'admin', id?: string) => void;
  onBack: () => void;
}

type StaffProfile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
};

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, onBack }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const withTimeout = async <T,>(promise: PromiseLike<T>, ms = 15000): Promise<T> => {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) =>
        window.setTimeout(() => reject(new Error('timeout')), ms)
      ),
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    (async () => {
      try {
        const normalizedIdentifier = username.trim();
        const normalizedPassword = password;

        if (typeof window !== 'undefined' && /(^|\.)github\.io$/i.test(window.location.hostname)) {
          clearStaleSupabaseAuthStorage();
        }

        let sawServiceFailure = false;
        let usernameLookupBlocked = false;
        let resolvedProfile: StaffProfile | null = null;
        const attemptedEmails = new Set<string>();

        const trySignIn = async (email: string | null) => {
          if (!email || attemptedEmails.has(email)) return null;
          attemptedEmails.add(email);

          try {
            const res = await withTimeout(signIn(email, normalizedPassword), 10000);
            if (!res.error && res.data?.session) {
              return { email, res };
            }
            if (res.error) {
              const reason = getAuthFailureReason(res.error);
              if (reason === 'service_unavailable' || reason === 'timeout') {
                sawServiceFailure = true;
              }
            }
          } catch (signInError) {
            const reason = getAuthFailureReason(signInError);
            if (reason === 'service_unavailable' || reason === 'timeout') {
              sawServiceFailure = true;
            }
          }

          return null;
        };

        const directCandidates = normalizedIdentifier.includes('@')
          ? [normalizedIdentifier]
          : [getCachedStaffEmail(normalizedIdentifier), `${normalizedIdentifier}@pjbl.local`];

        let authResult: { email: string; res: Awaited<ReturnType<typeof signIn>> } | null = null;

        for (const candidate of directCandidates) {
          authResult = await trySignIn(candidate);
          if (authResult) break;
        }

        if (!authResult && !normalizedIdentifier.includes('@') && !sawServiceFailure) {
          try {
            const profileRes = await withTimeout<{
              data: StaffProfile | null;
              error?: unknown;
            }>(
              supabase
                .from('users')
                .select('id, email, username, role')
                .eq('username', normalizedIdentifier)
                .maybeSingle(),
              4000
            );

            if (profileRes.error) {
              const reason = getAuthFailureReason(profileRes.error);
              if (reason === 'service_unavailable' || reason === 'timeout') {
                sawServiceFailure = true;
              } else {
                usernameLookupBlocked = true;
              }
            }

            resolvedProfile = profileRes.data;
            authResult = await trySignIn(resolvedProfile?.email || null);
          } catch (profileLookupError) {
            const reason = getAuthFailureReason(profileLookupError);
            if (reason === 'service_unavailable' || reason === 'timeout') {
              sawServiceFailure = true;
            } else {
              usernameLookupBlocked = true;
            }
          }
        }

        if (!authResult) {
          if (usernameLookupBlocked) {
            setError('Username lookup is unavailable. Please sign in with your staff email.');
            return;
          }
          setError(
            sawServiceFailure
              ? 'Authentication service is unavailable right now. Please try again later.'
              : 'Invalid credentials. Please try again.'
          );
          return;
        }

        const sessionUser = authResult.res.data?.session?.user || null;
        const profileIdentifier = sessionUser?.email || sessionUser?.id || authResult.email;

        if (!resolvedProfile || !resolvedProfile.id || !resolvedProfile.role || !resolvedProfile.username) {
          try {
            const postAuthProfile = await withTimeout(getUserProfileByIdentifier(profileIdentifier), 5000);
            if (postAuthProfile) {
              resolvedProfile = {
                id: postAuthProfile.id,
                email: postAuthProfile.email || sessionUser?.email || authResult.email,
                username: postAuthProfile.username || resolvedProfile?.username || normalizedIdentifier,
                role: postAuthProfile.role || resolvedProfile?.role || null,
              };
            }
          } catch (profileError) {
            await signOut().catch(() => {});
            setError(getFriendlyAuthErrorMessage(profileError, 'Unable to verify staff account. Please try again.'));
            return;
          }
        }

        const role = resolvedProfile?.role;
        if (!role) {
          await signOut().catch(() => {});
          setError('Unable to verify staff account. Please use your staff email or try again later.');
          return;
        }
        if (role !== 'admin' && role !== 'teacher') {
          await signOut().catch(() => {});
          setError('This account does not have admin access.');
          return;
        }

        const displayUsername = resolvedProfile?.username || normalizedIdentifier;
        const appUserId = resolvedProfile?.id || sessionUser?.id;
        cacheStaffLoginHint(displayUsername, resolvedProfile?.email || sessionUser?.email || authResult.email);
        onLogin(displayUsername, 'admin', appUserId);
      } catch (submitError) {
        setError(getFriendlyAuthErrorMessage(submitError, 'Login failed. Please try again.'));
        console.error(submitError);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  return (
    <div className="auth-container">
      <button className="back-button" onClick={onBack}>Back</button>
      <div className="auth-card">
        <div className="auth-icon"><AdminShieldIcon size={56} /></div>
        <h2>Teacher / Administrator Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username or email"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group password-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
