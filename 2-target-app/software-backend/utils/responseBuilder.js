// Standardized response builder utilities for consistent API responses

// Send successful response with data and message
const success = (res, data, message, status = 200) => {
    return res.status(status).json({
        success: true,
        data,
        message,
        error: null
    });
};

// Send error response with code, message, and optional details
const error = (res, { code, message, status, details = null }) => {
    const body = { success: false, data: null, error: code, message };
    if (details) body.details = details;
    return res.status(status).json(body);
};

// Convenience methods for common HTTP status codes
const notFound = (res, code, message) => error(res, { code, message, status: 404 });
const badRequest = (res, code, message, details) => error(res, { code, message, status: 400, details });
const conflict = (res, code, message, details) => error(res, { code, message, status: 409, details });
const forbidden = (res, code, message) => error(res, { code, message, status: 403 });
const unauthorized = (res, code, message) => error(res, { code, message, status: 401 });
const noContent = (res) => res.status(204).send();

export default { success, error, notFound, badRequest, conflict, forbidden, unauthorized, noContent };
