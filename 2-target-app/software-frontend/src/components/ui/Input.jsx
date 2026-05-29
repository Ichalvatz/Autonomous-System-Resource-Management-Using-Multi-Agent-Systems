/**
 * @fileoverview Form input components.
 * Includes Input, Textarea, Select, and FormGroup components.
 * @module components/ui/Input
 */

import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Input Component - Form input with variants
 */
const Input = React.forwardRef(({
  type = 'text',
  size = 'base',
  error = false,
  disabled = false,
  className = '',
  ...rest
}, ref) => {
  const baseClass = 'form-input';
  const sizeClass = size !== 'base' ? `form-input-${size}` : '';
  const errorClass = error ? 'error' : '';

  const classes = [
    baseClass,
    sizeClass,
    errorClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <input
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      aria-invalid={error ? 'true' : 'false'}
      {...rest}
    />
  );
});

Input.displayName = 'Input';

Input.propTypes = {
  type: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'base', 'lg']),
  error: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * Textarea Component
 */
export const Textarea = React.forwardRef(({
  error = false,
  disabled = false,
  className = '',
  ...rest
}, ref) => {
  const baseClass = 'form-textarea';
  const errorClass = error ? 'error' : '';

  const classes = [
    baseClass,
    errorClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <textarea
      ref={ref}
      className={classes}
      disabled={disabled}
      aria-invalid={error ? 'true' : 'false'}
      {...rest}
    />
  );
});

Textarea.displayName = 'Textarea';

Textarea.propTypes = {
  error: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * Select Component
 */
export const Select = React.forwardRef(({
  children,
  size = 'base',
  error = false,
  disabled = false,
  className = '',
  ...rest
}, ref) => {
  const baseClass = 'form-select';
  const sizeClass = size !== 'base' ? `form-select-${size}` : '';
  const errorClass = error ? 'error' : '';

  const classes = [
    baseClass,
    sizeClass,
    errorClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <select
      ref={ref}
      className={classes}
      disabled={disabled}
      aria-invalid={error ? 'true' : 'false'}
      {...rest}
    >
      {children}
    </select>
  );
});

Select.displayName = 'Select';

Select.propTypes = {
  children: PropTypes.node.isRequired,
  size: PropTypes.oneOf(['sm', 'base', 'lg']),
  error: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * FormGroup Component - Wrapper for label + input + error
 */
export const FormGroup = ({
  label,
  error,
  helper,
  required = false,
  children,
  className = '',
  ...rest
}) => {
  return (
    <div className={`form-group ${className}`} {...rest}>
      {label && (
        <label className={`form-label ${required ? 'form-label-required' : ''}`}>
          {label}
        </label>
      )}
      {children}
      {helper && !error && (
        <span className="form-helper">{helper}</span>
      )}
      {error && (
        <span className="form-error" role="alert">
          <span aria-hidden="true">⚠️</span>
          {error}
        </span>
      )}
    </div>
  );
};

FormGroup.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helper: PropTypes.string,
  required: PropTypes.bool,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default Input;
