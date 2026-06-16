/**
 * Shared Prettier configuration for the whole monorepo.
 * Apps/packages re-export this from their own prettier.config.js.
 * @type {import("prettier").Config}
 */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  arrowParens: "always",
  endOfLine: "lf",
};
