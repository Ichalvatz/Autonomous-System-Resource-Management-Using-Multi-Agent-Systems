import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * EmptyState Component - Empty state with icon, title, and action
 * 
 * @example
 * <EmptyState
 *   icon="❤️"
 *   title="No favourites yet"
 *   description="Start exploring and save your favourite places"
 *   action={<Button onClick={handleExplore}>Explore Places</Button>}
 * />
 */
const EmptyState = ({
  icon,
  title,
  description,
  action,
  className = '',
  ...rest
}) => {
  return (
    <div className={`empty-state ${className}`} {...rest}>
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="empty-state-title">{title}</h3>
      )}
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {action && (
        <div className="empty-state-action">{action}</div>
      )}
    </div>
  );
};

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.string,
  action: PropTypes.node,
  className: PropTypes.string,
};

export default EmptyState;
