/**
 * @fileoverview Login page for user authentication.
 * Uses Formik for form handling with demo credentials support.
 * @module pages/LoginPage
 */

import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Formik, Form } from 'formik';
import { getValidationSchemas } from '../utils/validationSchemas';
import { login } from '../api';
import { useTranslation } from '../i18n';
import { Button, Alert, EmailField, PasswordField } from '../components/ui';
import '../styles/Auth.css';

// Demo credentials data
const DEMO_CREDENTIALS = [
  { label: 'demoUser', email: 'user1@example.com', password: 'password123' },
  { label: 'admin', email: 'admin@example.com', password: 'admin123' },
];

/**
 * LoginPage Component
 * Handles user login with form validation and error handling.
 */
const LoginPage = () => {
  // Navigation and routing hooks
  const navigate = useNavigate();
  const location = useLocation();

  // Component state for error display and password visibility
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Translation and validation setup
  const { t } = useTranslation();
  const { loginSchema } = getValidationSchemas(t);

  // Get redirect message from location state (from ProtectedRoute)
  const redirectMessage = location.state?.message;

  // Initial form values for Formik
  const initialValues = {
    email: '',
    password: ''
  };

  /**
   * Handle form submission - authenticates user and stores session.
   * @param {Object} values - Form values (email, password)
   * @param {Object} formikBag - Formik helpers
   */
  const handleSubmit = async (values, { setSubmitting }) => {
    setError('');

    try {
      const response = await login(values.email, values.password);

      // Store token and user info
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      // Dispatch custom event to update header without full page reload
      window.dispatchEvent(new CustomEvent('user:login', { detail: response.user }));

      // Redirect to home
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);

      // Extract error message
      let errorMessage = t('loginError');

      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  /** Toggle password field visibility */
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Render login form with Formik validation
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>{t('login')}</h1>
          <p>{t('welcomeBack')}</p>
        </div>

        <Formik
          initialValues={initialValues}
          validationSchema={loginSchema}
          onSubmit={handleSubmit}
        >
          {({ isSubmitting, errors, touched, setFieldValue }) => (
            <>
              <Form className="auth-form">
                {redirectMessage && (
                  <Alert variant="warning" title="Authentication Required" data-testid="auth-redirect-message">
                    {redirectMessage}
                  </Alert>
                )}

                {error && (
                  <Alert variant="error" title={t('error')} data-testid="auth-error">
                    {error}
                  </Alert>
                )}

                <EmailField errors={errors} touched={touched} t={t} />

                <PasswordField
                  errors={errors}
                  touched={touched}
                  showPassword={showPassword}
                  onToggle={togglePasswordVisibility}
                  t={t}
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  data-cy="btn-submit"
                >
                  {t('loginButton')}
                </Button>
              </Form>

              {/* Demo Credentials with Quick Fill */}
              <div className="demo-credentials">
                <h3>🔐 {t('demoAccounts')}:</h3>
                {DEMO_CREDENTIALS.map((cred, index) => (
                  <div className="demo-account" key={index}>
                    <div className="demo-account-header">
                      <strong>{t(cred.label)}:</strong>
                      <button
                        type="button"
                        className="quick-fill-btn"
                        onClick={() => {
                          setFieldValue('email', cred.email);
                          setFieldValue('password', cred.password);
                        }}
                        data-cy={`quick-fill-${cred.label}`}
                      >
                        ⚡ Quick Fill
                      </button>
                    </div>
                    <p>Email: {cred.email}</p>
                    <p>Password: {cred.password}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Formik>

        <div className="auth-footer">
          <p>
            {t('noAccount')}
            <Link to="/signup"> {t('signupLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

