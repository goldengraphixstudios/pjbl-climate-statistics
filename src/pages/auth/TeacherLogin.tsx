import React, { useState } from 'react';
import { TeacherCalendarIcon } from '../../components/RoleIcons';
import '../../styles/Auth.css';
import { signIn, signUp, supabase } from '../../services/supabaseClient';
import { getUserProfileByIdentifier } from '../../services/supabaseClient';

interface TeacherLoginProps {
  onLogin: (username: string, role: 'teacher') => void;
  onBack: () => void;
}

const TeacherLogin: React.FC<TeacherLoginProps> = ({ onLogin, onBack }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const TEACHER_CREDENTIALS = {
    username: 'teacher01',
    password: 'cbnhs'
  };

  const ADMIN_TEACHER_CREDENTIALS = {
    username: 'sirmarco',
    password: '101997'
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    // If username is an email, try Supabase sign-in
    (async () => {
      try {
        if (username.includes('@')) {
          const res = await signIn(username, password);
          if (res.error) {
            setError('Invalid credentials. Please try again.');
          } else {
            onLogin(username, 'teacher');
          }
        } else {
          // Try to resolve username -> email in `users` profile table and sign in by email
          try {
            const profileRes = await supabase.from('users').select('email, username, role').eq('username', username).maybeSingle();
            if (!profileRes.error && profileRes.data && profileRes.data.email) {
              const email = profileRes.data.email;
              const res = await signIn(email, password);
              if (res.error) {
                setError('Invalid credentials. Please try again.');
              } else {
                // use the registered username for UI
                onLogin(profileRes.data.username || email, 'teacher');
              }
            } else {
              // fallback to local static credentials for teachers
              await new Promise(r => setTimeout(r, 500));
              if ((username === TEACHER_CREDENTIALS.username && password === TEACHER_CREDENTIALS.password) ||
                  (username === ADMIN_TEACHER_CREDENTIALS.username && password === ADMIN_TEACHER_CREDENTIALS.password)) {
                onLogin(username, 'teacher');
              } else {
                setError('Invalid credentials. Please try again.');
              }
            }
          } catch (innerErr) {
            console.error('Login lookup failed', innerErr);
            setError('Login failed. Please try again.');
          }
        }
      } catch (e) {
        setError('Login failed. Please try again.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!regName || !regEmail || !regUsername || !regPassword) {
      setError('Please fill all fields.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      // Create auth user via Supabase client signUp
      const res = await signUp(regEmail, regPassword);
      if (res.error) {
        setError(res.error.message || 'Registration failed');
        return;
      }
      const user = (res.data as any)?.user || (res as any)?.user || null;
      const userId = user?.id || null;
      // Insert profile into public.users (best-effort)
      try {
        const profilePayload: any = { email: regEmail, name: regName, username: regUsername, role: 'teacher' };
        if (userId) profilePayload.id = userId;
        const insertRes = await supabase.from('users').insert(profilePayload).select().maybeSingle();
        if (insertRes.error) {
          setError(insertRes.error.message || 'Profile insert failed');
          console.warn('Profile insert failed', insertRes.error);
          return;
        }
      } catch (ie) {
        console.warn('Profile insert exception', ie);
        setError('Profile insert failed');
        return;
      }

      // Optionally auto-login user (attempt sign-in)
      const login = await signIn(regEmail, regPassword);
      if (!login.error) {
        onLogin(regUsername, 'teacher');
        return;
      }

      // If auto-login didn't work, show success toast and hide register form
      setShowRegister(false);
      setToastMessage('Registration successful — check your email if verification is required.');
      setTimeout(() => setToastMessage(''), 6000);
    } catch (e) {
      console.error(e);
      setError('Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <button className="back-button" onClick={onBack}>← Back</button>
      <div className="auth-card">
        <div className="auth-icon"><TeacherCalendarIcon size={56} /></div>
        <h2>Teacher Login</h2>
        {!showRegister ? (
          <>
          <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-button" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </button>

            <div className="auth-toggle">
              <button type="button" className="link-button" onClick={() => { setShowRegister(true); setError(''); }}>
                Register
              </button>
            </div>
          </form>
          {toastMessage && (
            <div className="toast" role="status">{toastMessage}</div>
          )}
          </>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label htmlFor="regName">Full name</label>
              <input id="regName" type="text" value={regName} onChange={(e) => setRegName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="regEmail">Email</label>
              <input id="regEmail" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="regUsername">Username</label>
              <input id="regUsername" type="text" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="regPassword">Password</label>
              <input id="regPassword" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="regConfirm">Confirm password</label>
              <input id="regConfirm" type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} required />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="auth-actions">
              <button type="button" className="link-button" onClick={() => { setShowRegister(false); setError(''); }}>
                Back to login
              </button>
              <button type="submit" className="login-button" disabled={isLoading}>{isLoading ? 'Registering...' : 'Register'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TeacherLogin;
