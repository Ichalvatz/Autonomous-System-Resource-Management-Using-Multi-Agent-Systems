/**
 * @fileoverview Signup page for new user registration.
 * Uses Formik for form handling with validation.
 * @module pages/SignupPage
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import { getValidationSchemas } from '../utils/validationSchemas';
import { signup } from '../api';
import { useTranslation } from '../i18n';
import { Button, Alert, EmailField, PasswordField } from '../components/ui';
import '../styles/Auth.css';

/** Initial form values for Formik */
const INITIAL_VALUES = { name: '', email: '', password: '', confirmPassword: '' };

/** Extract error message from API response */
const extractErrorMessage = (err, defaultMessage) => {
  if (err.response?.data?.message) return err.response.data.message;
  if (err.message) return err.message;
  return defaultMessage;
};

/** Store user session data after successful signup */
const storeUserSession = (response) => {
  localStorage.setItem('token', response.token);
  localStorage.setItem('user', JSON.stringify(response.user));
  window.dispatchEvent(new CustomEvent('user:login', { detail: response.user }));
};

/**
 * SignupPage Component
 * Handles new user registration with form validation.
 */
const SignupPage = () => {
  // Navigation hook for redirect after signup
  const navigate = useNavigate();

  // Form state management
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Translation and validation setup
  const { t } = useTranslation();
  const { signupSchema } = getValidationSchemas(t);

  /**
   * Handle form submission - registers user and starts session.
   * @param {Object} values - Form values (name, email, password)
   * @param {Object} formikBag - Formik helpers
   */
  const handleSubmit = async (values, { setSubmitting }) => {
    setError('');

    try {
      const response = await signup({
        name: values.name,
        email: values.email,
        password: values.password
      });

      storeUserSession(response);
      navigate('/preferences');
    } catch (err) {
      console.error('Signup error:', err);
      setError(extractErrorMessage(err, t('signupError')));
    } finally {
      setSubmitting(false);
    }
  };

  // Render signup form with validation
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>{t('signup')}</h1>
          <p>{t('createAccount')}</p>
        </div>

        <Formik
          initialValues={INITIAL_VALUES}
          validationSchema={signupSchema}
          onSubmit={handleSubmit}
        >
          {({ isSubmitting, errors, touched }) => (
            <Form className="auth-form">
              {error && (
                <Alert variant="error" title={t('error')} data-testid="auth-error">
                  {error}
                </Alert>
              )}

              <div className="form-group">
                <label htmlFor="name">{t('username')}</label>
                <Field
                  type="text"
                  id="name"
                  name="name"
                  placeholder={t('namePlaceholder')}
                  className={errors.name && touched.name ? 'error' : ''}
                  data-cy="input-name"
                />
                <ErrorMessage name="name" component="div" className="field-error" data-testid="name-error" />
              </div>

              <EmailField errors={errors} touched={touched} t={t} />

              <PasswordField
                errors={errors}
                touched={touched}
                showPassword={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                t={t}
              >
                <small>{t('passwordRequirement')}</small>
              </PasswordField>

              <PasswordField
                name="confirmPassword"
                label={t('confirmPassword')}
                errors={errors}
                touched={touched}
                showPassword={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                dataCy="input-confirmPassword"
                dataTestId="confirmPassword-error"
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
                {t('signupButton')}
              </Button>
            </Form>
          )}
        </Formik>

        <div className="auth-footer">
          <p>
            {t('haveAccount')}
            <Link to="/login"> {t('loginLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
