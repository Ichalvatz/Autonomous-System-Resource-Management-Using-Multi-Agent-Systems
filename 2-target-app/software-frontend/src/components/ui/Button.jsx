import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/** Build variant class name */
const getVariantClass = (variant) => `btn-${variant}`;

/** Build size class name */
const getSizeClass = (size) => size !== 'base' ? `btn-${size}` : '';

/** Build combined button class names */
const buildButtonClasses = ({ variant, size, icon, fullWidth, loading, className }) => {
  return [
    'btn',
    getVariantClass(variant),
    getSizeClass(size),
    icon ? 'btn-icon' : '',
    fullWidth ? 'btn-full' : '',
    loading ? 'loading' : '',
    className
  ].filter(Boolean).join(' ');
};

/**
 * Button Component with comprehensive variants
 * 
 * @example
 * <Button variant="primary" size="lg" onClick={handleClick}>
 *   Click Me
 * </Button>
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'base',
  fullWidth = false,
  icon = false,
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
  onClick,
  ...rest
}) => {
  const classes = buildButtonClasses({ variant, size, icon, fullWidth, loading, className });

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading && (
        <span className="spinner spinner-sm" aria-hidden="true" />
      )}
      {children}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf([
    'primary',
    'secondary',
    'accent',
    'outline',
    'ghost',
    'danger'
  ]),
  size: PropTypes.oneOf(['sm', 'base', 'lg', 'xl']),
  fullWidth: PropTypes.bool,
  icon: PropTypes.bool,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  className: PropTypes.string,
  onClick: PropTypes.func,
};

export default Button;
