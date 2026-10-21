# Nosey registry template

Use this template to maintain skills and map them to technologies detected by Nosey.

## Create a registry

With Nosey installed, run:

```bash
nosey registry init ./my-registry --registry-id your-org/your-skills
```

In an interactive terminal, this opens a wizard with a final confirmation. The
destination must not already exist. For unattended creation without Git, use:

```bash
nosey registry init ./my-registry --registry-id your-org/your-skills --yes --no-git
```

Init copies this entire template and updates the registry and skill IDs. Git is
initialized by default. Add `--github` to create and push a GitHub repository using
an authenticated `gh` CLI; visibility defaults to private, or can be set with
`--visibility public`.

Alternatively, copy this directory manually, including
`.github/workflows/update-manifest.yml`, then update the identity as described below.

## Customize

1. If copied manually, set the same unique `registryId` in `registry.json` and
   `skills-map.json`, and update skill ID references in the map to match. Init
   already does this for you.
2. Replace the example skill with your own skills under
   `skills/<skill-name>/SKILL.md`, with YAML frontmatter containing a name and
   optionally a description. Nested skill folders are supported.
3. From the registry directory, run `node scripts/generate-manifest.mjs` to generate
   `skills-manifest.json` using the identity in `registry.json`.
4. Commit the generated `skills-manifest.json`.
5. Maintain `skills-map.json` manually. The generator never edits it. Remove the
   example skill's mapping if you delete or rename that skill.
6. Push to GitHub. The included workflow verifies manifests on pull requests and
   commits refreshed manifests to main after skill changes.

IDs use `<registryId>/<relative-directory-under-skills>`. Moving a skill changes its ID.

The manifest lists available skills, but does not automatically recommend them.
Map skills to built-in technologies with technologySkills, declare new technologies
with detection rules, declare combinations, extend existing combinations with
combinationSkills, or add frontendBonusSkills. Referenced skill IDs must appear in
the generated manifest.

## Use with Nosey

Init creates the registry files; register it separately. From the project you want
to scan, run:

```bash
nosey registry add /path/to/my-registry
nosey scan .
```

For a published registry, use:

```bash
nosey registry add https://github.com/your-org/your-skills.git --ref main
```

These commands save references in the project's `.nosey.json`. Use `--global`
with `registry add` to make a registry available across projects. For a single scan
without saving a reference, run `nosey scan . --registry /path/to/my-registry`.

Validate a registry with `nosey registry validate /path/to/my-registry`. To check
whether its manifest is up to date, run
`node scripts/generate-manifest.mjs --check` from the registry directory.

Only the registry JSON files are interpreted by Nosey; skill files are
never executed or installed during detection.
