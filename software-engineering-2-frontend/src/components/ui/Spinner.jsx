import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Spinner Component - Loading indicator
 */
const Spinner = ({ size = 'base', className = '' }) => {
  const baseClass = 'spinner';
  const sizeClass = size !== 'base' ? `spinner-${size}` : '';
  
  const classes = [
    baseClass,
    sizeClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={classes} 
      role="status" 
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

Spinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'base', 'lg']),
  className: PropTypes.string,
};

/**
 * LoadingContainer Component - Full loading state with message
 */
export const LoadingContainer = ({ message = 'Loading...', className = '' }) => {
  return (
    <div className={`loading-container ${className}`}>
      <Spinner />
      <p className="loading-text">{message}</p>
    </div>
  );
};

LoadingContainer.propTypes = {
  message: PropTypes.string,
  className: PropTypes.string,
};

/**
 * Skeleton Component - Placeholder loading
 */
export const Skeleton = ({ 
  variant = 'text',
  width,
  height,
  className = '' 
}) => {
  const baseClass = 'skeleton';
  const variantClass = variant !== 'text' ? `skeleton-${variant}` : 'skeleton-text';
  
  const classes = [
    baseClass,
    variantClass,
    className
  ].filter(Boolean).join(' ');

  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return <div className={classes} style={style} aria-hidden="true" />;
};

Skeleton.propTypes = {
  variant: PropTypes.oneOf(['text', 'title', 'card', 'avatar']),
  width: PropTypes.string,
  height: PropTypes.string,
  className: PropTypes.string,
};

/**
 * SkeletonCard Component - Card skeleton placeholder
 */
export const SkeletonCard = ({ count = 1 }) => {
  return (
    <>
      {[...Array(count)].map((_, index) => (
        <div key={index} className="card">
          <div className="flex gap-4" style={{ marginBottom: 'var(--space-4)' }}>
            <Skeleton variant="avatar" />
            <div style={{ flex: 1 }}>
              <Skeleton variant="title" width="70%" />
              <Skeleton variant="text" width="50%" />
            </div>
          </div>
          <Skeleton variant="card" />
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Skeleton variant="text" />
            <Skeleton variant="text" width="80%" />
          </div>
        </div>
      ))}
    </>
  );
};

SkeletonCard.propTypes = {
  count: PropTypes.number,
};

export default Spinner;
