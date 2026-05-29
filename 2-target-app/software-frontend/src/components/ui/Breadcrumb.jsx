import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import Icon from './Icon';
import './Breadcrumb.css';

/**
 * Breadcrumb Component
 * Shows navigation path with clickable links
 * 
 * @example
 * <Breadcrumb items={[
 *   { label: 'Home', path: '/' },
 *   { label: 'Places', path: '/places' },
 *   { label: 'Acropolis' }
 * ]} />
 */
const Breadcrumb = ({ items = [], className = '' }) => {
    const location = useLocation();

    // Auto-generate breadcrumbs from path if items not provided
    const generateBreadcrumbs = () => {
        if (items.length > 0) return items;

        const pathnames = location.pathname.split('/').filter(x => x);
        return [
            { label: 'Home', path: '/' },
            ...pathnames.map((name, index) => {
                const path = `/${pathnames.slice(0, index + 1).join('/')}`;
                const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
                return { label, path };
            })
        ];
    };

    const breadcrumbs = generateBreadcrumbs();

    if (breadcrumbs.length <= 1) return null;

    return (
        <nav className={`breadcrumb ${className}`} aria-label="Breadcrumb">
            <ol className="breadcrumb-list">
                {breadcrumbs.map((item, index) => {
                    const isLast = index === breadcrumbs.length - 1;

                    return (
                        <li key={index} className="breadcrumb-item">
                            {!isLast && item.path ? (
                                <>
                                    <Link to={item.path} className="breadcrumb-link">
                                        {index === 0 && <Icon name="home" size="xs" />}
                                        <span>{item.label}</span>
                                    </Link>
                                    <Icon name="chevronRight" size="xs" className="breadcrumb-separator" />
                                </>
                            ) : (
                                <span className="breadcrumb-current" aria-current="page">
                                    {item.label}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

Breadcrumb.propTypes = {
    items: PropTypes.arrayOf(
        PropTypes.shape({
            label: PropTypes.string.isRequired,
            path: PropTypes.string,
        })
    ),
    className: PropTypes.string,
};

export default Breadcrumb;
