/**
 * @fileoverview Favourite list item component.
 * Renders individual favourite/disliked place with remove action.
 * @module components/favourites/FavouriteListItem
 */

import React from 'react';
import PlaceCard from '../PlaceCard.jsx';
import { Button, Icon } from '../ui';

/**
 * Reusable component for rendering favourite/disliked list items
 */
const FavouriteListItem = ({ item, index, onRemove, idKey, t }) => {
    const place = { ...(item.place || {}), reviews: item.reviews || [] };
    const addedAt = item.addedAt || item.createdAt;
    const itemId = item[idKey];
    const keyId = itemId || place.placeId;

    return (
        <div key={keyId} className="favourite-item animate-fadeInUp" style={{ animationDelay: `${index * 0.1}s` }}>
            <PlaceCard place={place} />
            <div className="item-actions">
                <Button onClick={() => onRemove(itemId)} variant="danger" size="sm" disabled={!itemId}>
                    <Icon name="trash" size="sm" />{t('remove')}
                </Button>
                {addedAt && (
                    <span className="date-added">
                        <Icon name="calendar" size="sm" />{new Date(addedAt).toLocaleDateString()}
                    </span>
                )}
            </div>
        </div>
    );
};

export default FavouriteListItem;
