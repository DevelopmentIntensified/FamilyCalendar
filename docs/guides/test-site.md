# Testing on test.familyplanz.com

- The `test` branch auto-deploys to https://test.familyplanz.com. After pushing, wait about a minute for the deploy before testing.
- Every pushed `rewrite/v2` commit gets a Vercel **preview** deployment. Previews use the preview (test) database.
- The Vercel MCP tools are available (Code Mode):
  - check deploy status with `list_deployments` and `get_deployment`;
  - fetch deployment URLs;
  - bypass deployment protection with `get_access_to_vercel_url`.

  Use them when the live site is unreachable, or to confirm which commit is deployed.
- Migrations run at cold start on whichever database the deployment uses. A push to `test` or to a preview therefore applies any new `sql/migrations` file to the test database. That is why schema changes are owner-approved tasks.
