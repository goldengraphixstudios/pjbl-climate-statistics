import React, { useState } from 'react';
import { AdminShieldIcon } from '../../components/RoleIcons';
import '../../styles/Auth.css';
import { signIn, supabase } from '../../services/supabaseClient';

interface AdminLoginProps {
  onLogin: (username: string, role: 'admin', id?: string) => void;
  onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, onBack }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    (async () => {
      try {
        // Resolve username → email via users table, then Supabase signIn
        const profileRes = await supabase
          .from('users')
          .select('id, email, username, role')
          .eq('username', username)
          .maybeSingle();

        const email = username.includes('@')
          ? username
          : profileRes.data?.email || null;

        if (!email) {
          setError('Account not found. Please check your username.');
          return;
        }

        const res = await signIn(email, password);
        if (res.error) {
          setError('Invalid credentials. Please try again.');
          return;
        }

        // Verify the user has admin or teacher role
        const role = profileRes.data?.role;
        if (role && role !== 'admin' && role !== 'teacher') {
          setError('This account does not have admin access.');
          return;
        }

        const displayUsername = profileRes.data?.username || username;
        const appUserId = profileRes.data?.id || res.data?.session?.user?.id;
        onLogin(displayUsername, 'admin', appUserId);
      } catch (e) {
        setError('Login failed. Please try again.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  return (
    <div className="auth-container">
      <button className="back-button" onClick={onBack}>← Back</button>
      <div className="auth-card">
        <div className="auth-icon"><AdminShieldIcon size={56} /></div>
        <h2>Teacher / Administrator Login</h2>
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

export default AdminLogin;
