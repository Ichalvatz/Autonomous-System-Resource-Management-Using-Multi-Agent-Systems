import React from 'react';
import { Field, ErrorMessage } from 'formik';
import { Icon } from './index';

/**
 * Reusable email input field with validation styling
 */
export const EmailField = ({ label, errors, touched, t }) => (
    <div className="form-group">
        <label htmlFor="email">{label || t('email')}</label>
        <Field
            type="email"
            id="email"
            name="email"
            placeholder="example@email.com"
            className={errors.email && touched.email ? 'error' : ''}
            data-cy="input-email"
        />
        <ErrorMessage name="email" component="div" className="field-error" data-testid="email-error" />
    </div>
);

/**
 * Reusable password input field with toggle visibility
 */
export const PasswordField = ({
    name = 'password',
    label,
    errors,
    touched,
    showPassword,
    onToggle,
    dataCy,
    dataTestId,
    t,
    children
}) => (
    <div className="form-group">
        <label htmlFor={name}>{label || t('password')}</label>
        <div className="password-input-wrapper">
            <Field
                type={showPassword ? 'text' : 'password'}
                id={name}
                name={name}
                placeholder="••••••••"
                className={errors[name] && touched[name] ? 'error' : ''}
                data-cy={dataCy || `input-${name}`}
            />
            <button
                type="button"
                className="password-toggle"
                onClick={onToggle}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size="sm" />
            </button>
        </div>
        <ErrorMessage name={name} component="div" className="field-error" data-testid={dataTestId || `${name}-error`} />
        {children}
    </div>
);
