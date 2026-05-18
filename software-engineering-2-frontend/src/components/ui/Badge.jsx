import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Badge Component - Labels and status indicators
 * 
 * @example
 * <Badge variant="success" size="lg">Active</Badge>
 */
const Badge = ({
  children,
  variant = 'neutral',
  size = 'base',
  className = '',
  ...rest
}) => {
  const baseClass = 'badge';
  const variantClass = `badge-${variant}`;
  const sizeClass = size !== 'base' ? `badge-${size}` : '';
  
  const classes = [
    baseClass,
    variantClass,
    sizeClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
};

Badge.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf([
    'primary',
    'secondary',
    'success',
    'warning',
    'error',
    'neutral'
  ]),
  size: PropTypes.oneOf(['base', 'lg']),
  className: PropTypes.string,
};

export default Badge;
