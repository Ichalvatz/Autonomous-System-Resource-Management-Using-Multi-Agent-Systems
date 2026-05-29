/**
 * HATEOAS Link Builder
 * Constructs hypermedia links following REST Level 3 principles
 * 
 * This file aggregates all domain-specific link builders
 */

import userLinks from './hateoas/userLinks.js';
import placeLinks from './hateoas/placeLinks.js';
import adminLinks from './hateoas/adminLinks.js';

const buildHateoasLinks = {
  // User domain
  ...userLinks,
  // Place domain
  ...placeLinks,
  // Admin domain
  ...adminLinks
};

export default buildHateoasLinks;
