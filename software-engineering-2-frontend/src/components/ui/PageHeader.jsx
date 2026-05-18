import React from 'react';
import PropTypes from 'prop-types';
import './PageHeader.css';

/**
 * PageHeader Component
 * Consistent page header pattern across all pages
 */
const PageHeader = ({
    icon,
    title,
    subtitle,
    action,
    children,
    className = ''
}) => {
    return (
        <div className={`page-header ${className}`}>
            <div className="page-header-content">
                <h1 className="page-title">
                    {icon && <span className="page-title-icon">{icon}</span>}
                    {title}
                </h1>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
                {children}
            </div>
            {action && <div className="page-header-action">{action}</div>}
        </div>
    );
};

PageHeader.propTypes = {
    icon: PropTypes.node,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    action: PropTypes.node,
    children: PropTypes.node,
    className: PropTypes.string,
};

export default PageHeader;
