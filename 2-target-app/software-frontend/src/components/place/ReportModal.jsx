/**
 * @fileoverview Report modal for place issues.
 * Allows users to submit reports about incorrect/inappropriate listings.
 * @module components/place/ReportModal
 */

import React from 'react';
import { Button, Icon } from '../ui';

/**
 * Report modal component for PlaceDetailsPage
 * Allows users to report issues with place listings
 */
const ReportModal = ({
    t,
    showReportForm,
    setShowReportForm,
    reportForm,
    setReportForm,
    onReportSubmit,
}) => {
    if (!showReportForm) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowReportForm(false)}>
            <div className="modal-content animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>⚠️ {t('reportProblem')}</h3>
                    <button className="modal-close" onClick={() => setShowReportForm(false)}>
                        <Icon name="close" size="sm" />
                    </button>
                </div>
                <form onSubmit={onReportSubmit}>
                    <div className="form-group">
                        <label className="form-label">{t('reason')}</label>
                        <select
                            value={reportForm.reason}
                            onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })}
                            className="form-select"
                            required
                        >
                            <option value="">{t('selectReason')}</option>
                            <option value="INCORRECT_INFO">{t('incorrectInfo')}</option>
                            <option value="CLOSED">{t('closed')}</option>
                            <option value="INAPPROPRIATE">{t('inappropriate')}</option>
                            <option value="OTHER">{t('other')}</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('description')}</label>
                        <textarea
                            value={reportForm.description}
                            onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                            className="form-textarea"
                            placeholder={t('description') + '...'}
                            required
                        />
                    </div>
                    <div className="form-actions">
                        <Button type="submit" variant="danger">
                            {t('submit')}
                        </Button>
                        <Button type="button" onClick={() => setShowReportForm(false)} variant="ghost">
                            {t('cancel')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReportModal;
