import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Alert Component - Notification messages
 * 
 * @example
 * <Alert variant="success" title="Success!">
 *   Your changes have been saved.
 * </Alert>
 */
const Alert = ({
  children,
  variant = 'info',
  title,
  icon,
  className = '',
  ...rest
}) => {
  const baseClass = 'alert';
  const variantClass = `alert-${variant}`;
  
  const classes = [
    baseClass,
    variantClass,
    className
  ].filter(Boolean).join(' ');

  const defaultIcons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const displayIcon = icon || defaultIcons[variant];

  return (
    <div className={classes} role="alert" {...rest}>
      {displayIcon && (
        <div className="alert-icon" aria-hidden="true">
          {displayIcon}
        </div>
      )}
      <div className="alert-content">
        {title && <div className="alert-title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
};

Alert.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['info', 'success', 'warning', 'error']),
  title: PropTypes.string,
  icon: PropTypes.node,
  className: PropTypes.string,
};

export default Alert;
