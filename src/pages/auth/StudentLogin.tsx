import React, { useState } from 'react';
import { StudentCapIcon } from '../../components/RoleIcons';
import { validateStudentCredentials } from '../../services/authService';
import { supabase, getUserProfileByIdentifier } from '../../services/supabaseClient';
import '../../styles/Auth.css';

interface StudentLoginProps {
  onLogin: (username: string, role: 'student' | 'admin', id?: string) => void;
  onBack: () => void;
}

const StudentLogin: React.FC<StudentLoginProps> = ({ onLogin, onBack }) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const normalizedUsername = username.trim();
      const normalizedPassword = password;
      const result = await withTimeout(
        validateStudentCredentials(normalizedUsername, normalizedPassword)
      );
      if (!result.valid) {
        setError('Invalid credentials. Please contact your teacher for login details.');
        return;
      }

      // Determine role from users table if we have an id or username
      let userId = result.userId;
      let role: 'student' | 'admin' = 'student';

      if (userId) {
        const profile = await withTimeout(getUserProfileByIdentifier(userId), 10000);
        if (profile?.role === 'admin') role = 'admin';
        userId = profile?.id || userId;
      } else if (!userId) {
        // Look up by username to get the Supabase id
        try {
          const { data } = await withTimeout<{
            data: { id: string; role: 'student' | 'admin' | 'teacher' } | null;
            error?: unknown;
          }>(
            supabase
            .from('users')
            .select('id, role')
            .eq('username', normalizedUsername)
            .maybeSingle(),
            10000
          );
          if (data) {
            userId = data.id;
            if (data.role === 'admin') role = 'admin';
          }
        } catch {}
      }

      onLogin(normalizedUsername, role, userId);
    } catch (err) {
      const message = err instanceof Error && err.message === 'timeout'
        ? 'Login timed out. Please check your connection and try again.'
        : 'Login failed. Please try again.';
      setError(message);
      console.error('Student login error', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <button className="back-button" onClick={onBack}>← Back</button>
      <div className="auth-card">
        <div className="auth-icon"><StudentCapIcon size={56} /></div>
        <h2>Student Login</h2>
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
        </form>
      </div>
    </div>
  );
};

export default StudentLogin;
