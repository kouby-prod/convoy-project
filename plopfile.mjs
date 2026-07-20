/**
 * Plop generators for the Convoy/Carpool monorepo.
 *
 * These produce the deterministic, convention-following file skeletons for a
 * new feature. The `/backend-feature` and `/frontend-feature` Claude Code
 * skills drive them and then fill in the domain-specific parts. Templates live
 * in tools/plop-templates/ — edit those to change the conventions everywhere.
 *
 *   pnpm gen backend-feature rides
 *   pnpm gen frontend-feature rides
 */

/** @param {import('plop').NodePlopAPI} plop */
export default function (plop) {
  plop.setGenerator('backend-feature', {
    description: 'Scaffold a backend domain module (schema, table, routes, module, test)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Feature name (singular bounded context, e.g. rides):',
        validate: (v) => (v && v.trim().length > 0 ? true : 'A name is required'),
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/schemas/src/{{kebabCase name}}.ts',
        templateFile: 'tools/plop-templates/backend/schema.ts.hbs',
      },
      {
        type: 'append',
        path: 'packages/schemas/src/index.ts',
        pattern: /\/\/ plop:schemas/,
        template: "export * from './{{kebabCase name}}';",
        unique: true,
      },
      {
        type: 'add',
        path: 'apps/api/src/db/{{kebabCase name}}.ts',
        templateFile: 'tools/plop-templates/backend/table.ts.hbs',
      },
      {
        type: 'append',
        path: 'apps/api/src/db/schema.ts',
        pattern: /\/\/ plop:tables/,
        template: "export * from './{{kebabCase name}}';",
        unique: true,
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{kebabCase name}}/{{kebabCase name}}.routes.ts',
        templateFile: 'tools/plop-templates/backend/routes.ts.hbs',
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{kebabCase name}}/index.ts',
        templateFile: 'tools/plop-templates/backend/module.ts.hbs',
      },
      {
        type: 'add',
        path: 'apps/api/tests/{{kebabCase name}}/{{kebabCase name}}.test.ts',
        templateFile: 'tools/plop-templates/backend/test.ts.hbs',
      },
      '\n  Next (the /backend-feature skill does these): fill the TODO(domain) fields,\n  mount {{camelCase name}}Module in the routes chain in apps/api/src/app.ts,\n  run db:generate + db:migrate, then lint/typecheck/test.',
    ],
  });

  plop.setGenerator('frontend-feature', {
    description: 'Scaffold a web page + typed data-fetching component',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Feature name (e.g. rides — becomes route /rides):',
        validate: (v) => (v && v.trim().length > 0 ? true : 'A name is required'),
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'apps/web/src/app/[locale]/{{kebabCase name}}/page.tsx',
        templateFile: 'tools/plop-templates/frontend/page.tsx.hbs',
      },
      {
        type: 'add',
        path: 'apps/web/src/components/{{kebabCase name}}/{{kebabCase name}}-list.tsx',
        templateFile: 'tools/plop-templates/frontend/component.tsx.hbs',
      },
      '\n  Next (the /frontend-feature skill does these): add the {{pascalCase name}}\n  i18n keys (title/subtitle/loading/empty/error) to messages/fr.json AND\n  messages/en.json, ensure @carpool/api-client is a dep of @carpool/web, then\n  lint/typecheck.',
    ],
  });
}
