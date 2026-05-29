/**
 * Swagger Documentation Configuration
 * Sets up Swagger UI for API documentation
 */

import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Configure and mount Swagger UI on the express app
 * @param {Object} app - Express application instance
 */
export const setupSwagger = (app) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Go up one level from config/ to root/ to find docs/
    const rootDir = join(__dirname, '..');

    const swaggerDocument = yaml.load(
        readFileSync(join(rootDir, 'docs', 'swagger.yaml'), 'utf8')
    );

    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'myWorld Travel API Documentation',
        customfavIcon: '/favicon.ico'
    }));
};
