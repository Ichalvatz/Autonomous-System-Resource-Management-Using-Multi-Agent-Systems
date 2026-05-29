import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Card Component - Flexible container with variants
 * 
 * @example
 * <Card variant="elevated" interactive>
 *   <CardHeader>
 *     <h3>Title</h3>
 *   </CardHeader>
 *   <CardBody>
 *     Content here
 *   </CardBody>
 * </Card>
 */
const Card = ({
  children,
  variant = 'default',
  interactive = false,
  className = '',
  onClick,
  ...rest
}) => {
  const baseClass = 'card';
  const variantClass = variant !== 'default' ? `card-${variant}` : '';
  const interactiveClass = interactive ? 'card-interactive' : '';
  
  const classes = [
    baseClass,
    variantClass,
    interactiveClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={classes}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      {...rest}
    >
      {children}
    </div>
  );
};

Card.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['default', 'bordered', 'elevated', 'flat']),
  interactive: PropTypes.bool,
  className: PropTypes.string,
  onClick: PropTypes.func,
};

/**
 * CardHeader Component
 */
export const CardHeader = ({ children, className = '', ...rest }) => (
  <div className={`card-header ${className}`} {...rest}>
    {children}
  </div>
);

CardHeader.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

/**
 * CardBody Component
 */
export const CardBody = ({ children, className = '', ...rest }) => (
  <div className={`card-body ${className}`} {...rest}>
    {children}
  </div>
);

CardBody.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

/**
 * CardFooter Component
 */
export const CardFooter = ({ children, className = '', ...rest }) => (
  <div className={`card-footer ${className}`} {...rest}>
    {children}
  </div>
);

CardFooter.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default Card;
