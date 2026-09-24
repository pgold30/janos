# Release Janos

The default branch is `master`. Keep `package.json` and `package-lock.json` at the same version. A release tag must point to the tested commit that was published.

1. Check the working tree, dependencies, and tests: `git status --short`, `npm ci`, `npm test`.
2. Review the exact npm payload with `npm pack --dry-run --json`; verify that `bin/janos.js`, `bin/janos-hook.js`, the runtime source, README, license, and examples are present. Install the tarball in a temporary directory and run both binaries.
3. Confirm the npm identity with `npm whoami`. A browser session on npmjs.com does not authenticate the CLI. If needed, run `npm login --auth-type=web` and complete its browser approval. Never commit an npm token.
4. Ensure the version is not already published with `npm view @pgold30/janos@<version> version`. Publish from the clean, tested checkout using `npm publish --access public`. Complete any npm two-factor prompt locally. The unscoped `janos` name is blocked by npm's name-similarity check.
5. Verify the registry result using `npm view @pgold30/janos@<version> version` and a fresh `npm exec --yes --package=@pgold30/janos@<version> -- janos --version` invocation.
6. After publication succeeds, tag that commit as `v<version>` and push the tag. Update the README installation instructions from the GitHub package spec to npm, and verify the tagged container workflow. Do not tag an unpublished version.

The [npm publishing documentation](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) describes account authentication and two-factor requirements. Consider [trusted publishing](https://docs.npmjs.com/trusted-publishers/) after the first release is configured on npm.
