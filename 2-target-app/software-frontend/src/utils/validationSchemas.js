/**
 * Validation Schemas using Yup
 * Centralized validation logic for all forms
 */
import * as Yup from 'yup';

/** Reusable name field validator */
const createNameField = (t, requiredKey = 'nameRequired') => Yup.string()
  .min(2, t('nameMinLength'))
  .max(50, t('nameMaxLength'))
  .required(t(requiredKey));

/** Reusable email field validator */
const createEmailField = (t) => Yup.string()
  .email(t('invalidEmail'))
  .required(t('emailRequired'));

/** Reusable password field validator */
const createPasswordField = (t, complex = false) => {
  let schema = Yup.string().min(6, t('passwordMinLength'));
  if (complex) {
    schema = schema.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, t('passwordComplexity'));
  }
  return schema.required(t('passwordRequired'));
};

/** Reusable radius field validator */
const createRadiusField = (t, required = true) => {
  const schema = Yup.number().min(1, t('radiusMinOne')).max(100, t('radiusMaxHundred'));
  return required ? schema.required(t('radiusRequired')) : schema.nullable();
};

/** Create login form validation schema */
const createLoginSchema = (t) => Yup.object().shape({
  email: createEmailField(t),
  password: Yup.string().min(6, t('passwordMinLength')).required(t('passwordRequired')),
});

/** Create signup form validation schema */
const createSignupSchema = (t) => Yup.object().shape({
  name: createNameField(t),
  email: createEmailField(t),
  password: createPasswordField(t, true),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password'), null], t('passwordsNotMatch'))
    .required(t('confirmPasswordRequired')),
});

/** Create profile update validation schema */
const createProfileUpdateSchema = (t) => Yup.object().shape({
  name: createNameField(t),
  email: createEmailField(t),
  phoneNumber: Yup.string().matches(/^[0-9]{10}$/, t('phoneInvalid')).nullable(),
});

/** Create preference profile validation schema */
const createPreferenceProfileSchema = (t) => Yup.object().shape({
  name: createNameField(t, 'profileNameRequired'),
  categories: Yup.array().of(Yup.string()).min(1, t('categoryMinOne')).required(t('categoriesRequired')),
  priceRange: Yup.object().shape({
    min: Yup.number().min(0, t('minPriceNegative')).required(t('minPriceRequired')),
    max: Yup.number().min(Yup.ref('min'), t('maxPriceGreaterThanMin')).required(t('maxPriceRequired')),
  }),
  radius: createRadiusField(t),
});

/** Create review validation schema */
const createReviewSchema = (t) => Yup.object().shape({
  rating: Yup.number().min(1, t('ratingMinMax')).max(5, t('ratingMinMax')).required(t('ratingRequired')),
  comment: Yup.string().min(10, t('commentMinLength')).max(500, t('commentMaxLength')).required(t('commentRequired')),
});

/** Create report validation schema */
const createReportSchema = (t) => Yup.object().shape({
  reason: Yup.string().required(t('reasonRequired')),
  description: Yup.string().min(20, t('descriptionMinLength')).max(500, t('descriptionMaxLength')).required(t('descriptionRequired')),
});

/** Create search form validation schema */
const createSearchSchema = (t) => Yup.object().shape({
  query: Yup.string().min(2, t('searchMinLength')).max(100, t('searchMaxLength')),
  category: Yup.string().nullable(),
  radius: createRadiusField(t, false),
});

/**
 * Get validation schemas with translated error messages
 * @param {Function} t - Translation function from useTranslation hook
 * @returns {Object} Object containing all validation schemas
 */
export const getValidationSchemas = (t) => ({
  loginSchema: createLoginSchema(t),
  signupSchema: createSignupSchema(t),
  profileUpdateSchema: createProfileUpdateSchema(t),
  preferenceProfileSchema: createPreferenceProfileSchema(t),
  reviewSchema: createReviewSchema(t),
  reportSchema: createReportSchema(t),
  searchSchema: createSearchSchema(t),
});
