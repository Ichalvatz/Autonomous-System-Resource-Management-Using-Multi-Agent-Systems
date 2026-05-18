/**
 * Polyline Decoding
 * 
 * Decode Google polyline encoded strings to coordinate arrays.
 */

/**
 * Decode a single coordinate value from the encoded string
 * @param {string} encoded - Encoded polyline string
 * @param {Object} indexRef - Reference object containing current index
 * @returns {number} Decoded delta value
 */
const decodeValue = (encoded, indexRef) => {
    let shift = 0;
    let result = 0;
    let byte;

    do {
        byte = encoded.charCodeAt(indexRef.value++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
    } while (byte >= 0x20);

    return (result & 1) ? ~(result >> 1) : (result >> 1);
};

/**
 * Decode a polyline encoded string to coordinates array
 * OSRM uses Google's polyline encoding
 * @param {string} encoded - Encoded polyline string
 * @param {number} precision - Precision (5 for Google, 6 for OSRM)
 * @returns {Array<[number, number]>} Array of [lat, lng] coordinates
 */
export const decodePolyline = (encoded, precision = 5) => {
    const factor = Math.pow(10, precision);
    const coordinates = [];
    const indexRef = { value: 0 };
    let lat = 0;
    let lng = 0;

    while (indexRef.value < encoded.length) {
        lat += decodeValue(encoded, indexRef);
        lng += decodeValue(encoded, indexRef);
        coordinates.push([lat / factor, lng / factor]);
    }

    return coordinates;
};
