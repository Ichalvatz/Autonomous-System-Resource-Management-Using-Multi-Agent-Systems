import React from 'react';
import PropTypes from 'prop-types';

/**
 * Icon Component - Centralized icon management
 * Replace emoji with proper SVG icons or icon library
 * For now, using consistent emoji mapping
 */

const iconMap = {
  // Navigation
  home: '🏠',
  search: '🔍',
  map: '🗺️',
  navigation: '🧭',
  route: '🛣️',

  // Actions
  heart: '❤️',
  heartOutline: '🤍',
  star: '⭐',
  thumbsUp: '👍',
  thumbsDown: '👎',
  add: '➕',
  plus: '➕',
  remove: '➖',
  delete: '🗑️',
  trash: '🗑️',
  edit: '✏️',
  save: '💾',
  close: '✖️',
  check: '✓',
  refresh: '🔄',
  filter: '🔧',

  // Arrows
  arrow: '→',
  arrowRight: '→',
  arrowLeft: '←',
  arrowUp: '↑',
  arrowDown: '↓',

  // Categories
  museum: '🏛️',
  restaurant: '🍽️',
  beach: '🏖️',
  monument: '🗿',
  park: '🌳',
  cafe: '☕',
  bar: '🍺',
  hotel: '🏨',
  shopping: '🛍️',
  entertainment: '🎭',

  // Status
  success: '✅',
  error: '❌',
  warning: '⚠️',
  alert: '⚠️',
  info: 'ℹ️',

  // User
  user: '👤',
  users: '👥',
  profile: '👤',

  // Places
  location: '📍',
  pin: '📌',
  globe: '🌍',

  // UI
  menu: '☰',
  more: '⋯',
  chevronDown: '▼',
  chevronUp: '▲',
  chevronRight: '▶',
  chevronLeft: '◀',
  language: '🌐',

  // Misc
  sparkles: '✨',
  fire: '🔥',
  clock: '🕐',
  calendar: '📅',
  settings: '⚙️',
  eye: '👁️',
  eyeOff: '🙈',
  logout: '🚪',
};

const Icon = ({
  name,
  size = 'base',
  className = '',
  'aria-hidden': ariaHidden = true,
  ...rest
}) => {
  const sizeMap = {
    xs: '0.75rem',
    sm: '1rem',
    base: '1.25rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '2.5rem',
  };

  const icon = iconMap[name] || name;

  return (
    <span
      className={`icon ${className}`}
      style={{
        fontSize: sizeMap[size],
        lineHeight: 1,
        display: 'inline-block',
        ...rest.style
      }}
      aria-hidden={ariaHidden}
      {...rest}
    >
      {icon}
    </span>
  );
};

Icon.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['xs', 'sm', 'base', 'lg', 'xl', '2xl']),
  className: PropTypes.string,
  'aria-hidden': PropTypes.bool,
};

export default Icon;
