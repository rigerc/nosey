# SkillSense registry template

Create a repository with `skillsense registry init ./my-registry`, which copies this
entire template and updates its registry ID. Alternatively, copy this directory
manually, including `.github/workflows/update-manifest.yml`.

## Customize

1. Set a unique registryId in registry.json and skills-map.json.
2. Place skills under skills/<skill-name>/SKILL.md, with YAML frontmatter containing
   a name and optionally a description. Nested skill folders are supported.
3. Run: node scripts/generate-manifest.mjs
4. Commit the generated skills-manifest.json.
5. Maintain skills-map.json manually. The generator never edits it.
6. Push to GitHub. The included workflow verifies manifests on pull requests and
   commits refreshed manifests to main after skill changes.

IDs use <registryId>/<relative-directory-under-skills>. Moving a skill changes its ID.

The manifest lists available skills, but does not automatically recommend them.
Map skills to built-in technologies with technologySkills, declare new technologies
with detection rules, declare combinations, extend existing combinations with
combinationSkills, or add frontendBonusSkills. Referenced skill IDs must appear in
the generated manifest.

## Configure SkillSense

Add to your scanned project's .skillsense.json:

    {
      "schemaVersion": 1,
      "registries": [{
        "type": "git",
        "url": "https://github.com/your-org/your-skills.git",
        "ref": "main",
        "refreshHours": 24
      }]
    }

Or use: skillsense . --registry ./path/to/registry

Only the registry JSON files are interpreted by SkillSense; skill files are
never executed or installed during detection.
