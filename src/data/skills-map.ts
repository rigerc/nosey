// ── Types ─────────────────────────────────────────────────────

export type ConfigFileContentBlock = {
  files?: string[];
  patterns: Array<string | RegExp>;
  scanGradleLayout?: boolean;
  scanDotNetLayout?: boolean;
  sourceExtensions?: string[];
  allPatterns?: boolean;
  stripComments?: 'code' | 'hash' | 'xml';
  maskStrings?: boolean;
};

export type McpServerMatcher = {
  /** Exact npm package names, without versions. */
  packages?: string[];
  /** Exact Python distribution names, normalized like manifest dependencies. */
  pythonPackages?: string[];
  /** HTTP(S) origin and path; credentials, query and fragment are ignored. */
  endpoints?: string[];
  /** Explicit, case-sensitive server names from workspace MCP configs. */
  serverNames?: string[];
  /** Optional exact project-relative config paths restricting this matcher. */
  configFiles?: string[];
};

export type DetectConfig = {
  packages?: string[];
  pythonPackages?: string[];
  composerPackages?: string[];
  goModules?: string[];
  rustCrates?: string[];
  elixirPackages?: string[];
  packagePatterns?: RegExp[];
  configFiles?: string[];
  fileExtensions?: string[];
  gems?: string[];
  configFileContent?: ConfigFileContentBlock | ConfigFileContentBlock[];
  /** Any matcher and any identity within a matcher may match a configured, enabled server. */
  mcpServers?: McpServerMatcher[];
};

export type Technology = {
  id: string;
  name: string;
  detect: DetectConfig;
  skills: string[];
};

export type ComboSkill = {
  id: string;
  name: string;
  requires: string[];
  skills: string[];
};

// ── Skills Map ────────────────────────────────────────────────

export const SKILLS_MAP: Technology[] = [
  {
    id: 'react',
    name: 'React',
    detect: {
      packages: ['react', 'react-dom'],
    },
    skills: [
      'vercel-labs/agent-skills/react-best-practices',
      'vercel-labs/agent-skills/composition-patterns',
    ],
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    detect: {
      packages: ['next'],
      configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    },
    skills: ['vercel/next.js/next-cache-components-adoption'],
  },
  {
    id: 'vue',
    name: 'Vue',
    detect: {
      packages: ['vue'],
    },
    skills: [
      'hyf0/vue-skills/vue-debug-guides',
      'antfu/skills/vue',
      'vuejs-ai/skills/vue-best-practices',
    ],
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    detect: {
      packages: ['nuxt'],
      configFiles: ['nuxt.config.js', 'nuxt.config.ts'],
    },
    skills: ['antfu/skills/nuxt'],
  },
  {
    id: 'pinia',
    name: 'Pinia',
    detect: {
      packages: ['pinia'],
    },
    skills: ['vuejs-ai/skills/vue-pinia-best-practices'],
  },
  {
    id: 'svelte',
    name: 'Svelte',
    detect: {
      packages: ['svelte', '@sveltejs/kit'],
      configFiles: ['svelte.config.js'],
    },
    skills: [
      'ejirocodes/agent-skills/svelte5-best-practices',
      'sveltejs/ai-tools/svelte-code-writer',
    ],
  },
  {
    id: 'angular',
    name: 'Angular',
    detect: {
      packages: ['@angular/core'],
      configFiles: ['angular.json'],
    },
    skills: [
      'angular/skills/angular-developer',
      'angular/angular/reference-core',
      'angular/angular/reference-signal-forms',
      'angular/angular/reference-compiler-cli',
      'angular/angular/adev-writing-guide',
      'angular/angular/pr_review',
    ],
  },
  {
    id: 'astro',
    name: 'Astro',
    detect: {
      packages: ['astro'],
      configFiles: ['astro.config.mjs', 'astro.config.js', 'astro.config.ts'],
    },
    skills: ['astrolicious/agent-skills/astro'],
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    detect: {
      packages: ['tailwindcss', '@tailwindcss/vite'],
      configFiles: ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs'],
    },
    skills: ['giuseppe-trisciuoglio/developer-kit/tailwind-css-patterns'],
  },
  {
    id: 'shadcn',
    name: 'shadcn/ui',
    detect: {
      configFiles: ['components.json'],
    },
    skills: ['shadcn/ui/shadcn'],
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    detect: {
      packages: ['typescript'],
      configFiles: ['tsconfig.json'],
    },
    skills: ['wshobson/agents/typescript-advanced-types'],
  },
  {
    id: 'react-hook-form',
    name: 'React Hook Form',
    detect: {
      packages: ['react-hook-form'],
    },
    skills: ['pproenca/dot-skills/react-hook-form'],
  },
  {
    id: 'zod',
    name: 'Zod',
    detect: {
      packages: ['zod'],
    },
    skills: ['pproenca/dot-skills/zod'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    detect: {
      packages: ['@supabase/supabase-js', '@supabase/ssr'],
      pythonPackages: ['supabase'],
    },
    skills: ['supabase/agent-skills/supabase-postgres-best-practices'],
  },
  {
    id: 'neon',
    name: 'Neon Postgres',
    detect: {
      packages: ['@neondatabase/serverless'],
    },
    skills: ['neondatabase/agent-skills/neon-postgres'],
  },
  {
    id: 'instantdb',
    name: 'InstantDB',
    detect: {
      packages: [
        '@instantdb/core',
        '@instantdb/react',
        '@instantdb/react-native',
        '@instantdb/react-native-mmkv',
        '@instantdb/admin',
      ],
      configFiles: ['instant.schema.ts', 'instant.perms.ts'],
    },
    skills: ['instantdb/skills/instantdb'],
  },
  {
    id: 'playwright',
    name: 'Playwright',
    detect: {
      packages: ['@playwright/test', 'playwright'],
      configFiles: ['playwright.config.ts', 'playwright.config.js'],
    },
    skills: ['currents-dev/playwright-best-practices-skill/playwright-best-practices'],
  },
  {
    id: 'expo',
    name: 'Expo',
    detect: {
      packages: ['expo'],
    },
    skills: [
      'expo/skills/expo-native-ui',
      'expo/skills/expo-data-fetching',
      'expo/skills/expo-upgrade',
      'expo/skills/expo-dev-client',
      'expo/skills/eas-app-stores',
      'expo/skills/eas-workflows',
      'expo/skills/eas-hosting',
      'expo/skills/expo-dom',
    ],
  },
  {
    id: 'react-native',
    name: 'React Native',
    detect: {
      packages: ['react-native'],
    },
    skills: ['sleekdotdesign/agent-skills/design-mobile-apps'],
  },
  {
    id: 'dart',
    name: 'Dart',
    detect: {
      configFiles: ['pubspec.yaml'],
    },
    skills: ['kevmoo/dash_skills/dart-best-practices'],
  },
  {
    id: 'flutter',
    name: 'Flutter',
    detect: {
      configFileContent: {
        patterns: ['flutter:'],
        files: ['pubspec.yaml'],
      },
    },
    skills: [
      'jeffallan/claude-skills/flutter-expert',
      'madteacher/mad-agents-skills/flutter-animations',
      'madteacher/mad-agents-skills/flutter-testing',
    ],
  },
  {
    id: 'kotlin-multiplatform',
    name: 'Kotlin Multiplatform',
    detect: {
      configFileContent: {
        scanGradleLayout: true,
        patterns: [
          'kotlin("multiplatform")',
          'org.jetbrains.kotlin.multiplatform',
          'id("org.jetbrains.kotlin.multiplatform")',
          'kotlin-multiplatform',
        ],
      },
    },
    skills: [
      'Kotlin/kotlin-agent-skills/kotlin-tooling-cocoapods-spm-migration',
      'Kotlin/kotlin-agent-skills/kotlin-tooling-agp9-migration',
    ],
  },
  {
    id: 'android',
    name: 'Android',
    detect: {
      configFileContent: {
        scanGradleLayout: true,
        patterns: [
          'com.android.application',
          'com.android.library',
          'id("com.android.application")',
          'id("com.android.library")',
          'com.android.kotlin.multiplatform.library',
        ],
      },
    },
    skills: [
      'krutikJain/android-agent-skills/android-kotlin-core',
      'krutikJain/android-agent-skills/android-compose-foundations',
      'krutikJain/android-agent-skills/android-architecture-clean',
      'krutikJain/android-agent-skills/android-di-hilt',
      'krutikJain/android-agent-skills/android-gradle-build-logic',
      'krutikJain/android-agent-skills/android-coroutines-flow',
      'krutikJain/android-agent-skills/android-networking-retrofit-okhttp',
      'krutikJain/android-agent-skills/android-testing-unit',
    ],
  },
  {
    id: 'remotion',
    name: 'Remotion',
    detect: {
      packages: ['remotion', '@remotion/cli'],
    },
    skills: ['remotion-dev/skills/remotion-best-practices'],
  },
  {
    id: 'react-router',
    name: 'React Router',
    detect: {
      packages: [
        'react-router',
        'react-router-dom',
        '@react-router/node',
        '@react-router/dev',
        '@react-router/serve',
      ],
    },
    skills: ['remix-run/react-router/react-router'],
  },
  {
    id: 'tanstack-start',
    name: 'TanStack Start',
    detect: {
      packages: ['@tanstack/react-start', '@tanstack/start'],
    },
    skills: ['tanstack-skills/tanstack-skills/tanstack-start'],
  },
  {
    id: 'chrome-extension',
    name: 'Chrome Extension',
    detect: {
      configFileContent: {
        files: ['manifest.json'],
        patterns: ['manifest_version'],
      },
    },
    skills: ['mindrally/skills/chrome-extension-development'],
  },
  {
    id: 'clerk',
    name: 'Clerk',
    detect: {
      packages: [
        '@clerk/nextjs',
        '@clerk/remix',
        '@clerk/astro',
        '@clerk/express',
        '@clerk/fastify',
        '@clerk/nuxt',
        '@clerk/vue',
        '@clerk/react',
        '@clerk/expo',
        '@clerk/tanstack-react-start',
        '@clerk/react-router',
        '@clerk/chrome-extension',
        '@clerk/backend',
      ],
      packagePatterns: [/^@clerk\//],
      configFileContent: [
        {
          files: ['Package.swift'],
          patterns: ['clerk/clerk-ios', 'ClerkSDK'],
        },
        {
          scanGradleLayout: true,
          patterns: ['com.clerk'],
        },
      ],
    },
    skills: [
      'clerk/skills/clerk',
      'clerk/skills/clerk-setup',
      'clerk/skills/clerk-custom-ui',
      'clerk/skills/clerk-backend-api',
      'clerk/skills/clerk-orgs',
      'clerk/skills/clerk-webhooks',
      'clerk/skills/clerk-testing',
    ],
  },
  {
    id: 'better-auth',
    name: 'Better Auth',
    detect: {
      packages: ['better-auth'],
    },
    skills: [
      'better-auth/skills/best-practices',
      'better-auth/skills/emailAndPassword',
      'better-auth/skills/organization',
      'better-auth/skills/twoFactor',
    ],
  },
  {
    id: 'turborepo',
    name: 'Turborepo',
    detect: {
      packages: ['turbo'],
      configFiles: ['turbo.json'],
    },
    skills: ['vercel/turborepo/turborepo'],
  },
  {
    id: 'vite',
    name: 'Vite',
    detect: {
      packages: ['vite'],
      configFiles: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
    },
    skills: ['antfu/skills/vite'],
  },
  {
    id: 'azure',
    name: 'Azure',
    detect: {
      packagePatterns: [/^@azure\//],
      pythonPackages: [
        'azure-identity',
        'azure-storage-blob',
        'azure-cosmos',
        'azure-ai-inference',
      ],
    },
    skills: [
      'microsoft/github-copilot-for-azure/azure-deploy',
      'microsoft/github-copilot-for-azure/azure-ai',
      'microsoft/github-copilot-for-azure/azure-diagnostics',
      'github/awesome-copilot/azure-architecture-autopilot',
      'github/awesome-copilot/azure-deployment-preflight',
      'github/awesome-copilot/azure-developer-cli',
      'github/awesome-copilot/azure-pricing',
      'github/awesome-copilot/azure-resource-health-diagnose',
      'github/awesome-copilot/azure-resource-visualizer',
      'github/awesome-copilot/azure-well-architected-review',
      'github/awesome-copilot/az-cost-optimize',
    ],
  },
  {
    id: 'vercel-ai',
    name: 'Vercel AI SDK',
    detect: {
      packages: ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google'],
    },
    skills: ['vercel/ai/use-ai-sdk'],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    detect: {
      packages: ['elevenlabs', '@elevenlabs/elevenlabs-js'],
      pythonPackages: ['elevenlabs'],
    },
    skills: ['inferen-sh/skills/elevenlabs-tts', 'inferen-sh/skills/elevenlabs-music'],
  },
  {
    id: 'vercel-deploy',
    name: 'Vercel',
    detect: {
      configFiles: ['vercel.json', '.vercel'],
      packages: ['vercel', '@astrojs/vercel'],
    },
    skills: ['vercel-labs/agent-skills/deploy-to-vercel'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    detect: {
      packages: ['wrangler', '@cloudflare/workers-types', '@astrojs/cloudflare'],
      configFiles: ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'],
    },
    skills: [
      'cloudflare/skills/cloudflare',
      'cloudflare/skills/wrangler',
      'cloudflare/skills/workers-best-practices',
      'cloudflare/skills/web-perf',
      'openai/skills/cloudflare-deploy',
    ],
  },
  {
    id: 'cloudflare-durable-objects',
    name: 'Durable Objects',
    detect: {
      configFileContent: {
        files: ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'],
        patterns: ['durable_objects'],
      },
    },
    skills: ['cloudflare/skills/durable-objects'],
  },
  {
    id: 'cloudflare-agents',
    name: 'Cloudflare Agents',
    detect: {
      packages: ['agents'],
    },
    skills: ['cloudflare/skills/agents-sdk', 'cloudflare/skills/sandbox-stable'],
  },
  {
    id: 'cloudflare-ai',
    name: 'Cloudflare AI',
    detect: {
      packages: ['@cloudflare/ai'],
      configFileContent: {
        files: ['wrangler.json', 'wrangler.jsonc'],
        patterns: ['"ai"'],
      },
    },
    skills: ['cloudflare/skills/agents-sdk'],
  },
  {
    id: 'terraform',
    name: 'Terraform',
    detect: {
      configFiles: [
        '.terraform.lock.hcl',
        'terraform.tfvars',
        'main.tf',
        'variables.tf',
        'outputs.tf',
      ],
    },
    skills: [
      'hashicorp/agent-skills/terraform-style-guide',
      'hashicorp/agent-skills/refactor-module',
      'hashicorp/agent-skills/terraform-stacks',
      'wshobson/agents/terraform-module-library',
    ],
  },
  {
    id: 'aws',
    name: 'AWS',
    detect: {
      packages: ['aws-sdk', 'aws-cdk', 'aws-cdk-lib'],
      packagePatterns: [/^@aws-sdk\//, /^@aws-cdk\//],
      pythonPackages: ['boto3', 'botocore', 'aws-cdk-lib'],
      gems: ['aws-sdk', 'aws-sdk-s3'],
    },
    skills: [
      'github/awesome-copilot/aws-cloudwatch-investigation',
      'github/awesome-copilot/aws-cost-optimize',
      'github/awesome-copilot/aws-resource-health-diagnose',
      'github/awesome-copilot/aws-resource-query',
      'github/awesome-copilot/aws-well-architected-review',
    ],
  },
  {
    id: 'swiftui',
    name: 'SwiftUI',
    detect: {
      configFileContent: {
        sourceExtensions: ['.swift'],
        patterns: [/^\s*import\s+SwiftUI\b/m],
        stripComments: 'code',
        maskStrings: true,
      },
    },
    skills: [
      'avdlee/swiftui-agent-skill/swiftui-expert-skill',
      'avdlee/swift-concurrency-agent-skill/swift-concurrency',
      'avdlee/xcode-build-optimization-agent-skill/xcode-build-orchestrator',
      'avdlee/swift-testing-agent-skill/swift-testing-expert',
      'avdlee/core-data-agent-skill/core-data-expert',
    ],
  },
  {
    id: 'oxlint',
    name: 'oxlint',
    detect: {
      packages: ['oxlint'],
      configFiles: ['.oxlintrc.json', 'oxlint.config.ts'],
    },
    skills: ['delexw/claude-code-misc/oxlint'],
  },
  {
    id: 'gsap',
    name: 'GSAP',
    detect: {
      packages: ['gsap'],
    },
    skills: [
      'greensock/gsap-skills/gsap-core',
      'greensock/gsap-skills/gsap-scrolltrigger',
      'greensock/gsap-skills/gsap-performance',
      'greensock/gsap-skills/gsap-plugins',
      'greensock/gsap-skills/gsap-timeline',
      'greensock/gsap-skills/gsap-utils',
      'greensock/gsap-skills/gsap-frameworks',
    ],
  },
  {
    id: 'threejs',
    name: 'Three.js',
    detect: {
      packages: ['three'],
    },
    skills: [
      'cloudai-x/threejs-skills/threejs-animation',
      'cloudai-x/threejs-skills/threejs-fundamentals',
      'cloudai-x/threejs-skills/threejs-shaders',
      'cloudai-x/threejs-skills/threejs-geometry',
      'cloudai-x/threejs-skills/threejs-interaction',
      'cloudai-x/threejs-skills/threejs-materials',
      'cloudai-x/threejs-skills/threejs-postprocessing',
      'cloudai-x/threejs-skills/threejs-lighting',
      'cloudai-x/threejs-skills/threejs-textures',
      'cloudai-x/threejs-skills/threejs-loaders',
    ],
  },
  {
    id: '@react-three/fiber',
    name: 'React Three Fiber',
    detect: {
      packages: ['@react-three/fiber'],
    },
    skills: ['cloudai-x/threejs-skills/threejs-react-three-fiber'],
  },
  {
    id: 'bun',
    name: 'Bun',
    detect: {
      configFiles: ['bun.lockb', 'bun.lock', 'bunfig.toml'],
    },
    skills: ['midudev/autoskills/bun'],
  },
  {
    id: 'elysia',
    name: 'Elysia',
    detect: {
      packages: ['elysia'],
    },
    skills: ['elysiajs/skills/elysia'],
  },
  {
    id: 'node',
    name: 'Node.js',
    detect: {
      // Package managers and version files also occur in browser-only apps.
      packages: [
        'express',
        'fastify',
        'koa',
        '@nestjs/core',
        '@hapi/hapi',
        'restify',
        '@hono/node-server',
      ],
      configFileContent: {
        files: ['server.js', 'server.ts', 'server.mjs', 'server.cjs'],
        patterns: [/\b(?:from\s*|require\s*\(\s*)['"](?:node:)?(?:http|https|net)['"]/],
        stripComments: 'code',
      },
    },
    skills: [
      'wshobson/agents/nodejs-backend-patterns',
      'sickn33/antigravity-awesome-skills/nodejs-best-practices',
    ],
  },
  {
    id: 'bash',
    name: 'Bash',
    detect: {
      fileExtensions: ['.sh', '.bash'],
    },
    skills: ['wshobson/agents/bash-defensive-patterns'],
  },
  {
    id: 'express',
    name: 'Express',
    detect: {
      packages: ['express'],
    },
    skills: [],
  },
  {
    id: 'go',
    name: 'Go',
    detect: {
      configFiles: ['go.mod', 'go.work'],
    },
    skills: [
      'samber/cc-skills-golang/golang-code-style',
      'samber/cc-skills-golang/golang-error-handling',
      'samber/cc-skills-golang/golang-security',
      'samber/cc-skills-golang/golang-testing',
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    detect: {
      configFiles: ['wp-config.php', 'wp-login.php'],
      packagePatterns: [/^@wordpress\//],
      configFileContent: {
        files: ['composer.json', 'style.css'],
        patterns: ['johnpbloch/wordpress', 'wpackagist', 'Theme Name:'],
      },
    },
    skills: [
      'wordpress/agent-skills/wp-plugin-development',
      'wordpress/agent-skills/wp-rest-api',
      'wordpress/agent-skills/wp-block-themes',
      'wordpress/agent-skills/wp-block-development',
      'wordpress/agent-skills/wp-performance',
      'wordpress/agent-skills/wordpress-router',
      'wordpress/agent-skills/wp-project-triage',
      'wordpress/agent-skills/wp-wpcli-and-ops',
    ],
  },
  {
    id: 'java',
    name: 'Java',
    detect: {
      configFiles: ['pom.xml'],
      configFileContent: {
        scanGradleLayout: true,
        patterns: [
          'sourceCompatibility',
          'targetCompatibility',
          'JavaVersion',
          'id("java")',
          "id 'java'",
          'id("java-library")',
          "id 'java-library'",
        ],
      },
    },
    skills: [
      'github/awesome-copilot/java-docs',
      'affaan-m/everything-claude-code/java-coding-standards',
      'github/awesome-copilot/java-development',
      'github/awesome-copilot/java-debugging',
      'github/awesome-copilot/java-diagnostics',
      'github/awesome-copilot/java-junit',
      'github/awesome-copilot/java-testcontainers',
      'github/awesome-copilot/java-upgrade',
    ],
  },
  {
    id: 'springboot',
    name: 'Spring Boot',
    detect: {
      configFileContent: [
        {
          files: ['pom.xml'],
          patterns: [/<groupId>\s*org\.springframework\.boot\s*<\/groupId>/],
          stripComments: 'xml',
        },
        {
          scanGradleLayout: true,
          patterns: [/["']org\.springframework\.boot["':]/],
          stripComments: 'code',
        },
      ],
    },
    skills: ['github/awesome-copilot/java-springboot'],
  },
  {
    id: 'prisma',
    name: 'Prisma',
    detect: {
      packages: ['prisma', '@prisma/client'],
    },
    skills: [
      'prisma/skills/prisma-database-setup',
      'prisma/skills/prisma-client-api',
      'prisma/skills/prisma-cli',
      'prisma/skills/prisma-postgres',
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    detect: {
      packages: ['stripe', '@stripe/stripe-js', '@stripe/react-stripe-js'],
      pythonPackages: ['stripe'],
      gems: ['stripe'],
      composerPackages: ['stripe/stripe-php'],
    },
    skills: ['stripe/ai/stripe-best-practices', 'stripe/ai/upgrade-stripe'],
  },
  {
    id: 'hono',
    name: 'Hono',
    detect: {
      packages: ['hono'],
    },
    skills: ['honojs/skills/hono'],
  },
  {
    id: 'vitest',
    name: 'Vitest',
    detect: {
      packages: ['vitest'],
      configFiles: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'],
    },
    skills: ['antfu/skills/vitest'],
  },
  {
    id: 'drizzle',
    name: 'Drizzle ORM',
    detect: {
      packages: ['drizzle-orm', 'drizzle-kit'],
    },
    skills: ['bobmatnyc/claude-mpm-skills/drizzle'],
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    detect: {
      packages: ['@nestjs/core'],
    },
    skills: ['kadajett/agent-nestjs-skills/nestjs-best-practices'],
  },
  {
    id: 'tauri',
    name: 'Tauri',
    detect: {
      packages: ['@tauri-apps/api', '@tauri-apps/cli'],
      configFiles: ['src-tauri/tauri.conf.json'],
    },
    skills: ['nodnarbnitram/claude-code-extensions/tauri-v2'],
  },
  {
    id: 'electron',
    name: 'Electron',
    detect: {
      packages: ['electron'],
      configFiles: [
        'electron-builder.yml',
        'electron-builder.json',
        'electron-builder.js',
        'forge.config.js',
        'forge.config.cjs',
        'forge.config.mjs',
        'forge.config.ts',
        'electron-vite.config.ts',
        'electron-vite.config.js',
        'electron-vite.config.mjs',
        'electron-vite.config.cjs',
      ],
    },
    skills: [],
  },
  {
    id: 'dotnet',
    name: '.NET',
    detect: {
      configFiles: [
        'global.json',
        'NuGet.Config',
        'Directory.Build.props',
        'Directory.Packages.props',
      ],
      configFileContent: {
        scanDotNetLayout: true,
        patterns: ['<Project Sdk="Microsoft.NET.Sdk'],
      },
    },
    skills: [
      'github/awesome-copilot/dotnet-best-practices',
      'github/awesome-copilot/dotnet-design-pattern-review',
      'github/awesome-copilot/dotnet-upgrade',
      'github/awesome-copilot/dotnet-timezone',
      'github/awesome-copilot/nuget-manager',
    ],
  },
  {
    id: 'csharp',
    name: 'C#',
    detect: {fileExtensions: ['.csproj', '.cs']},
    skills: [
      'github/awesome-copilot/csharp-xunit',
      'github/awesome-copilot/csharp-async',
      'github/awesome-copilot/csharp-docs',
      'github/awesome-copilot/csharp-nunit',
      'github/awesome-copilot/csharp-mstest',
      'github/awesome-copilot/csharp-tunit',
    ],
  },
  {
    id: 'aspnetcore',
    name: 'ASP.NET Core',
    detect: {
      configFileContent: {
        scanDotNetLayout: true,
        patterns: [
          /<Project\b[^>]*\bSdk\s*=\s*["']Microsoft\.NET\.Sdk\.Web["']/,
          /<FrameworkReference\b[^>]*\bInclude\s*=\s*["']Microsoft\.AspNetCore\.App["']/,
        ],
        stripComments: 'xml',
      },
    },
    skills: ['github/awesome-copilot/containerize-aspnetcore', 'openai/skills/aspnet-core'],
  },
  {
    id: 'aspnet-blazor',
    name: 'Blazor',
    detect: {
      configFileContent: {
        scanDotNetLayout: true,
        patterns: ['Microsoft.NET.Sdk.BlazorWebAssembly', 'Microsoft.AspNetCore.Components'],
      },
    },
    skills: ['github/awesome-copilot/fluentui-blazor'],
  },
  {
    id: 'aspnet-minimal-api',
    name: 'ASP.NET Minimal API',
    detect: {
      configFileContent: {
        sourceExtensions: ['.cs'],
        patterns: [
          /\bWebApplication\s*\.\s*Create(?:Builder|SlimBuilder|EmptyBuilder)?\s*\(/,
          /\.\s*Map(?:Get|Post|Put|Patch|Delete|Methods)\s*\(/,
        ],
        allPatterns: true,
        stripComments: 'code',
        maskStrings: true,
      },
    },
    skills: ['github/awesome-copilot/aspnet-minimal-api-openapi'],
  },
  {
    id: 'rust',
    name: 'Rust',
    detect: {
      configFiles: ['Cargo.toml'],
    },
    skills: ['apollographql/skills/rust-best-practices'],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    detect: {
      configFiles: ['Gemfile', 'Gemfile.lock', '.ruby-version', '.ruby-gemset'],
    },
    skills: ['lucianghinda/superpowers-ruby/ruby'],
  },
  {
    id: 'rails',
    name: 'Ruby on Rails',
    detect: {
      gems: ['rails'],
      configFiles: ['config/routes.rb', 'config/application.rb', 'bin/rails'],
    },
    skills: [
      'sergiodxa/agent-skills/ruby-on-rails-best-practices',
      'lucianghinda/superpowers-ruby/rails-guides',
      'igmarin/rails-agent-skills/apply-stack-conventions',
      'igmarin/rails-agent-skills/review-migration',
      'igmarin/rails-agent-skills/security-check',
      'ombulabs/claude-code_rails-upgrade-skill/rails-upgrade',
    ],
  },
  {
    id: 'redis-ruby',
    name: 'Redis (Ruby)',
    detect: {
      gems: ['redis', 'sidekiq', 'resque', 'redis-rails'],
    },
    skills: ['redis/agent-skills/redis-core'],
  },
  {
    id: 'postgres-ruby',
    name: 'PostgreSQL (Ruby)',
    detect: {
      gems: ['pg'],
    },
    skills: [],
  },
  {
    id: 'sorbet',
    name: 'Sorbet',
    detect: {
      gems: ['sorbet', 'sorbet-runtime'],
      configFiles: ['sorbet/config'],
    },
    skills: [
      'DmitryPogrebnoy/ruby-agent-skills/generating-sorbet',
      'DmitryPogrebnoy/ruby-agent-skills/generating-sorbet-inline',
    ],
  },
  {
    id: 'activeadmin',
    name: 'ActiveAdmin',
    detect: {
      gems: ['activeadmin'],
    },
    skills: [],
  },
  {
    id: 'devise',
    name: 'Devise',
    detect: {
      gems: ['devise'],
    },
    skills: [],
  },
  {
    id: 'sidekiq',
    name: 'Sidekiq',
    detect: {
      gems: ['sidekiq'],
    },
    skills: ['igmarin/rails-agent-skills/implement-background-job'],
  },
  {
    id: 'rspec',
    name: 'RSpec',
    detect: {
      gems: ['rspec', 'rspec-rails'],
      configFiles: ['.rspec'],
    },
    skills: [
      'igmarin/rails-agent-skills/test-service',
      'lucianghinda/superpowers-ruby/test-driven-development',
    ],
  },
  {
    id: 'rubocop',
    name: 'RuboCop',
    detect: {
      gems: ['rubocop', 'rubocop-rails'],
      configFiles: ['.rubocop.yml'],
    },
    skills: [],
  },
  {
    id: 'php',
    name: 'PHP',
    detect: {
      configFiles: ['composer.json', 'composer.lock'],
    },
    skills: ['jeffallan/claude-skills/php-pro'],
  },
  {
    id: 'laravel',
    name: 'Laravel',
    detect: {
      configFiles: ['artisan', 'bootstrap/app.php'],
      configFileContent: {
        files: ['composer.json'],
        patterns: ['"laravel/framework"', '"illuminate/'],
      },
    },
    skills: [
      'jeffallan/claude-skills/laravel-specialist',
      'affaan-m/everything-claude-code/laravel-patterns',
    ],
  },
  {
    id: 'python',
    name: 'Python',
    detect: {
      configFiles: ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'],
    },
    skills: [
      'inferen-sh/skills/python-executor',
      'wshobson/agents/python-testing-patterns',
      'github/awesome-copilot/python-pypi-package-builder',
    ],
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    detect: {
      pythonPackages: ['fastapi'],
    },
    skills: [
      'fastapi/fastapi/fastapi',
      'wshobson/agents/fastapi-templates',
      'mindrally/skills/fastapi-python',
    ],
  },
  {
    id: 'fastmcp',
    name: 'FastMCP',
    detect: {
      pythonPackages: ['fastmcp'],
    },
    skills: ['sharanharsoor/skills/fastmcp'],
  },
  {
    id: 'django',
    name: 'Django',
    detect: {
      pythonPackages: ['django'],
      configFiles: ['manage.py'],
    },
    skills: [
      'vintasoftware/django-ai-plugins/django-expert',
      'affaan-m/everything-claude-code/django-patterns',
      'affaan-m/everything-claude-code/django-security',
    ],
  },
  {
    id: 'flask',
    name: 'Flask',
    detect: {
      pythonPackages: ['flask'],
    },
    skills: ['aj-geddes/useful-ai-prompts/flask-api-development'],
  },
  {
    id: 'pydantic',
    name: 'Pydantic',
    detect: {
      pythonPackages: ['pydantic'],
    },
    skills: ['bobmatnyc/claude-mpm-skills/pydantic'],
  },
  {
    id: 'sqlalchemy',
    name: 'SQLAlchemy',
    detect: {
      pythonPackages: ['sqlalchemy'],
    },
    skills: [
      'bobmatnyc/claude-mpm-skills/sqlalchemy',
      'wispbit-ai/skills/sqlalchemy-alembic-expert-best-practices-code-review',
    ],
  },
  {
    id: 'pytest',
    name: 'Pytest',
    detect: {
      pythonPackages: ['pytest'],
    },
    skills: [
      'wshobson/agents/python-testing-patterns',
      'github/awesome-copilot/pytest-coverage',
    ],
  },
  {
    id: 'pandas',
    name: 'Pandas',
    detect: {
      pythonPackages: ['pandas'],
    },
    skills: [
      'jeffallan/claude-skills/pandas-pro',
      'pluginagentmarketplace/custom-plugin-python/pandas-data-analysis',
    ],
  },
  {
    id: 'numpy',
    name: 'NumPy',
    detect: {
      pythonPackages: ['numpy'],
    },
    skills: [
      'pluginagentmarketplace/custom-plugin-python/machine-learning',
      'pluginagentmarketplace/custom-plugin-python/pandas-data-analysis',
    ],
  },
  {
    id: 'scikit-learn',
    name: 'Scikit-Learn',
    detect: {
      pythonPackages: ['scikit-learn'],
    },
    skills: [
      'davila7/claude-code-templates/scikit-learn',
      'davila7/claude-code-templates/senior-data-scientist',
    ],
  },
  {
    id: 'celery',
    name: 'Celery',
    detect: {
      pythonPackages: ['celery'],
    },
    skills: ['wshobson/agents/python-background-jobs'],
  },
  {
    id: 'requests',
    name: 'Requests',
    detect: {
      pythonPackages: ['requests'],
    },
    skills: ['affaan-m/everything-claude-code/python-patterns'],
  },
  // Infrastructure & CI
  {
    id: 'docker',
    name: 'Docker',
    detect: {
      configFiles: [
        'Dockerfile',
        'Dockerfile.dev',
        'Dockerfile.prod',
        'docker-compose.yml',
        'docker-compose.yaml',
        'compose.yml',
        'compose.yaml',
      ],
    },
    skills: [
      'docker/skills/docker-project-foundations',
      'github/awesome-copilot/multi-stage-dockerfile',
    ],
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    detect: {configFiles: ['.github/workflows']},
    skills: [
      'github/awesome-copilot/github-actions-efficiency',
      'github/awesome-copilot/github-actions-hardening',
      'github/awesome-copilot/github-actions-runtime-upgrade-conventions',
      'github/awesome-copilot/create-github-action-workflow-specification',
    ],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    detect: {
      configFiles: ['kustomization.yaml', 'kustomization.yml', 'skaffold.yaml'],
    },
    skills: [],
  },
  {
    id: 'helm',
    name: 'Helm',
    detect: {configFiles: ['Chart.yaml']},
    skills: [],
  },

  // Data & APIs
  {
    id: 'mongodb',
    name: 'MongoDB',
    detect: {
      packages: ['mongodb', 'mongoose'],
      pythonPackages: ['pymongo', 'motor'],
    },
    skills: ['hoodini/ai-agents-skills/mongodb'],
  },
  {
    id: 'firebase',
    name: 'Firebase',
    detect: {
      packages: ['firebase', 'firebase-admin', 'firebase-functions'],
      configFiles: ['firebase.json'],
    },
    skills: ['firebase/agent-skills/firebase-auth-basics'],
  },
  {
    id: 'convex',
    name: 'Convex',
    detect: {packages: ['convex'], configFiles: ['convex']},
    skills: ['convex/agent-skills/convex'],
  },
  {
    id: 'redis',
    name: 'Redis',
    detect: {
      packages: ['redis', 'ioredis', '@upstash/redis'],
      pythonPackages: ['redis'],
    },
    skills: ['redis/agent-skills/redis-core'],
  },
  {
    id: 'graphql',
    name: 'GraphQL',
    detect: {
      packages: ['graphql', 'graphql-request', 'graphql-yoga', '@apollo/server'],
      goModules: ['github.com/99designs/gqlgen', 'github.com/graph-gophers/graphql-go'],
    },
    skills: ['apollographql/skills/graphql-operations'],
  },
  {
    id: 'trpc',
    name: 'tRPC',
    detect: {
      packages: [
        '@trpc/server',
        '@trpc/client',
        '@trpc/react-query',
        '@trpc/next',
        '@trpc/tanstack-react-query',
      ],
    },
    skills: [],
  },

  // Frontend state, data & components
  {
    id: 'tanstack-query',
    name: 'TanStack Query',
    detect: {
      packages: [
        '@tanstack/react-query',
        '@tanstack/vue-query',
        '@tanstack/solid-query',
        '@tanstack/svelte-query',
        '@tanstack/query-core',
      ],
    },
    skills: ['deckardger/tanstack-agent-skills/tanstack-query'],
  },
  {
    id: 'zustand',
    name: 'Zustand',
    detect: {packages: ['zustand']},
    skills: [],
  },
  {
    id: 'redux',
    name: 'Redux',
    detect: {packages: ['@reduxjs/toolkit', 'redux', 'react-redux']},
    skills: [],
  },
  {
    id: 'solid',
    name: 'SolidJS',
    detect: {packages: ['solid-js']},
    skills: [],
  },
  {
    id: 'storybook',
    name: 'Storybook',
    detect: {
      packages: ['storybook', '@storybook/react', '@storybook/vue3', '@storybook/nextjs'],
      packagePatterns: [/^@storybook\//],
      configFiles: ['.storybook'],
    },
    skills: [],
  },

  // Testing & quality
  {
    id: 'jest',
    name: 'Jest',
    detect: {
      packages: ['jest', '@jest/core'],
      configFiles: [
        'jest.config.js',
        'jest.config.cjs',
        'jest.config.mjs',
        'jest.config.ts',
        'jest.config.mts',
        'jest.config.json',
      ],
    },
    skills: ['github/awesome-copilot/javascript-typescript-jest'],
  },
  {
    id: 'cypress',
    name: 'Cypress',
    detect: {
      packages: ['cypress'],
      configFiles: ['cypress.config.js', 'cypress.config.cjs', 'cypress.config.ts', 'cypress.json'],
    },
    skills: ['github/awesome-copilot/cypress-flake-fixer'],
  },
  {
    id: 'eslint',
    name: 'ESLint',
    detect: {
      packages: ['eslint'],
      configFiles: [
        'eslint.config.js',
        'eslint.config.mjs',
        'eslint.config.cjs',
        'eslint.config.ts',
        '.eslintrc',
        '.eslintrc.js',
        '.eslintrc.cjs',
        '.eslintrc.json',
        '.eslintrc.yml',
        '.eslintrc.yaml',
      ],
    },
    skills: [],
  },
  {
    id: 'biome',
    name: 'Biome',
    detect: {
      packages: ['@biomejs/biome'],
      configFiles: ['biome.json', 'biome.jsonc'],
    },
    skills: [],
  },

  // AI SDKs
  {
    id: 'anthropic-sdk',
    name: 'Anthropic SDK',
    detect: {
      packages: ['@anthropic-ai/sdk'],
      pythonPackages: ['anthropic'],
    },
    skills: ['anthropics/skills/claude-api'],
  },
  {
    id: 'openai',
    name: 'OpenAI SDK',
    detect: {
      packages: ['openai'],
      pythonPackages: ['openai'],
    },
    skills: [],
  },
  {
    id: 'langchain',
    name: 'LangChain',
    detect: {
      packages: ['langchain'],
      packagePatterns: [/^@langchain\//],
      pythonPackages: ['langchain', 'langchain-core', 'langchain-openai', 'langchain-anthropic'],
    },
    skills: ['langchain-ai/langchain-skills/langchain-rag'],
  },
  {
    id: 'mcp-sdk',
    name: 'Model Context Protocol SDK',
    detect: {
      packages: ['@modelcontextprotocol/sdk'],
      pythonPackages: ['mcp'],
    },
    skills: [
      'github/awesome-copilot/mcp-implementation-security-review',
      'github/awesome-copilot/mcp-release-qa',
    ],
  },
  {
    id: 'mcp-context7',
    name: 'Context7 MCP',
    detect: {
      mcpServers: [
        {packages: ['@upstash/context7-mcp'], endpoints: ['https://mcp.context7.com/mcp']},
      ],
    },
    skills: [],
  },
  {
    id: 'mcp-playwright',
    name: 'Playwright MCP',
    detect: {mcpServers: [{packages: ['@playwright/mcp']}]},
    skills: [
      'anthropics/skills/webapp-testing',
      'github/awesome-copilot/playwright-generate-test',
      'github/awesome-copilot/playwright-explore-website',
      'github/awesome-copilot/playwright-automation-fill-in-form',
    ],
  },
  {
    id: 'mcp-chrome-devtools',
    name: 'Chrome DevTools MCP',
    detect: {mcpServers: [{packages: ['chrome-devtools-mcp']}]},
    skills: [],
  },
  {
    id: 'mcp-openai-docs',
    name: 'OpenAI Docs MCP',
    detect: {mcpServers: [{endpoints: ['https://developers.openai.com/mcp']}]},
    skills: [],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    detect: {
      packages: ['@huggingface/inference', '@huggingface/hub'],
      pythonPackages: ['huggingface-hub', 'transformers'],
    },
    skills: [],
  },

  // Observability
  {
    id: 'sentry',
    name: 'Sentry',
    detect: {
      packagePatterns: [/^@sentry\//],
      pythonPackages: ['sentry-sdk'],
    },
    skills: [],
  },

  // Languages & build systems
  {
    id: 'kotlin',
    name: 'Kotlin',
    detect: {
      configFileContent: {
        scanGradleLayout: true,
        patterns: [
          'org.jetbrains.kotlin',
          'kotlin("jvm")',
          'kotlin("android")',
          'kotlin("multiplatform")',
        ],
      },
    },
    skills: ['kotlin/kotlin-agent-skills/kotlin-tooling-java-to-kotlin'],
  },
  {
    id: 'swift',
    name: 'Swift',
    detect: {configFiles: ['Package.swift'], fileExtensions: ['.swift']},
    skills: ['avdlee/swift-concurrency-agent-skill/swift-concurrency'],
  },
  {
    id: 'elixir',
    name: 'Elixir',
    detect: {configFiles: ['mix.exs']},
    skills: ['georgeguimaraes/elixir-agent-tools/elixir'],
  },
  {
    id: 'cpp',
    name: 'C++',
    detect: {fileExtensions: ['.cpp', '.cxx', '.cc', '.hpp', '.hxx', '.hh']},
    skills: ['jeffallan/claude-skills/cpp-pro'],
  },
  // Developer tooling — task runners and local environments
  {
    id: 'viteplus',
    name: 'Vite+',
    detect: {
      packages: ['vite-plus'],
      configFileContent: {
        files: ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'],
        patterns: [
          "from 'vite-plus'",
          'from "vite-plus"',
          "require('vite-plus')",
          'require("vite-plus")',
        ],
      },
    },
    skills: [],
  },
  {
    id: 'just',
    name: 'Just',
    detect: {
      configFiles: ['justfile', 'Justfile', 'JUSTFILE', '.justfile'],
    },
    skills: ['paulrberg/agent-skills/cli-just'],
  },
  {
    id: 'taskfile',
    name: 'Task',
    detect: {
      configFiles: [
        'Taskfile.yml',
        'taskfile.yml',
        'Taskfile.yaml',
        'taskfile.yaml',
        'Taskfile.dist.yml',
        'taskfile.dist.yml',
        'Taskfile.dist.yaml',
        'taskfile.dist.yaml',
      ],
    },
    skills: [],
  },
  {
    id: 'make',
    name: 'GNU Make / Make',
    detect: {
      configFiles: ['Makefile', 'makefile', 'GNUmakefile', 'BSDmakefile'],
    },
    skills: ['akin-ozer/cc-devops-skills/makefile-generator'],
  },
  {
    id: 'mise',
    name: 'mise',
    detect: {
      configFiles: [
        'mise.toml',
        '.mise.toml',
        '.config/mise.toml',
        '.config/mise/config.toml',
        '.mise/config.toml',
      ],
    },
    skills: [],
  },
  {
    id: 'direnv',
    name: 'direnv',
    detect: {configFiles: ['.envrc']},
    skills: [],
  },
  {
    id: 'pre-commit',
    name: 'pre-commit',
    detect: {
      configFiles: ['.pre-commit-config.yaml', '.pre-commit-config.yml'],
      pythonPackages: ['pre-commit'],
    },
    skills: [],
  },
  {
    id: 'lefthook',
    name: 'Lefthook',
    detect: {
      packages: ['lefthook'],
      configFiles: [
        'lefthook.yml',
        'lefthook.yaml',
        '.lefthook.yml',
        '.lefthook.yaml',
        'lefthook.toml',
        '.lefthook.toml',
        'lefthook.json',
        '.lefthook.json',
        'lefthook.jsonc',
        '.lefthook.jsonc',
        '.config/lefthook.yml',
        '.config/lefthook.yaml',
        '.config/lefthook.toml',
        '.config/lefthook.json',
        '.config/lefthook.jsonc',
      ],
    },
    skills: [],
  },
  {
    id: 'husky',
    name: 'Husky',
    detect: {
      packages: ['husky'],
      configFiles: ['.husky'],
    },
    skills: [],
  },
  {
    id: 'lint-staged',
    name: 'lint-staged',
    detect: {
      packages: ['lint-staged'],
      configFiles: [
        '.lintstagedrc',
        '.lintstagedrc.json',
        '.lintstagedrc.yml',
        '.lintstagedrc.yaml',
        'lint-staged.config.js',
        'lint-staged.config.cjs',
        'lint-staged.config.mjs',
        'lint-staged.config.ts',
      ],
    },
    skills: [],
  },

  // Developer tooling — release automation and dependency upkeep
  {
    id: 'changesets',
    name: 'Changesets',
    detect: {
      packages: ['@changesets/cli'],
      configFiles: ['.changeset/config.json'],
    },
    skills: ['pingdotgg/t3code/changesets'],
  },
  {
    id: 'semantic-release',
    name: 'semantic-release',
    detect: {
      packages: ['semantic-release'],
      configFiles: [
        '.releaserc',
        '.releaserc.json',
        '.releaserc.yml',
        '.releaserc.yaml',
        '.releaserc.js',
        '.releaserc.cjs',
        'release.config.js',
        'release.config.cjs',
      ],
    },
    skills: [],
  },
  {
    id: 'commitlint',
    name: 'commitlint',
    detect: {
      packages: ['@commitlint/cli', '@commitlint/config-conventional'],
      configFiles: [
        'commitlint.config.js',
        'commitlint.config.cjs',
        'commitlint.config.mjs',
        'commitlint.config.ts',
        '.commitlintrc',
        '.commitlintrc.json',
        '.commitlintrc.yml',
        '.commitlintrc.yaml',
      ],
    },
    skills: [],
  },
  {
    id: 'renovate',
    name: 'Renovate',
    detect: {
      packages: ['renovate'],
      configFiles: [
        'renovate.json',
        'renovate.json5',
        '.renovaterc',
        '.renovaterc.json',
        '.github/renovate.json',
        '.github/renovate.json5',
      ],
    },
    skills: ['backnotprop/plannotator/review-renovate'],
  },
  {
    id: 'dependabot',
    name: 'Dependabot',
    detect: {
      configFiles: ['.github/dependabot.yml', '.github/dependabot.yaml'],
    },
    skills: [
      'cli/cli/dependabot-triager',
      'github/awesome-copilot/dependabot',
    ],
  },

  // Developer tooling — monorepos, bundlers, and formatters
  {
    id: 'nx',
    name: 'Nx',
    detect: {
      packages: ['nx'],
      packagePatterns: [/^@nx\//, /^@nrwl\//],
      configFiles: ['nx.json'],
    },
    skills: [],
  },
  {
    id: 'moonrepo',
    name: 'moonrepo',
    detect: {
      packages: ['@moonrepo/cli'],
      configFiles: [
        '.moon/workspace.yml',
        '.moon/workspace.yaml',
        '.moon/workspace.pkl',
        'moon.yml',
        'moon.pkl',
      ],
    },
    skills: [],
  },
  {
    id: 'prettier',
    name: 'Prettier',
    detect: {
      packages: ['prettier'],
      configFiles: [
        '.prettierrc',
        '.prettierrc.json',
        '.prettierrc.yml',
        '.prettierrc.yaml',
        '.prettierrc.js',
        '.prettierrc.cjs',
        '.prettierrc.mjs',
        'prettier.config.js',
        'prettier.config.cjs',
        'prettier.config.mjs',
        'prettier.config.ts',
      ],
    },
    skills: [],
  },
  {
    id: 'tsup',
    name: 'tsup',
    detect: {
      packages: ['tsup'],
      configFiles: ['tsup.config.ts', 'tsup.config.js', 'tsup.config.mjs', 'tsup.config.mts'],
    },
    skills: [],
  },
  {
    id: 'tsdown',
    name: 'tsdown',
    detect: {
      packages: ['tsdown'],
      configFiles: [
        'tsdown.config.ts',
        'tsdown.config.js',
        'tsdown.config.mjs',
        'tsdown.config.mts',
      ],
    },
    skills: [],
  },
  {
    id: 'rolldown',
    name: 'Rolldown',
    detect: {
      packages: ['rolldown', 'rolldown-vite'],
      configFiles: ['rolldown.config.ts', 'rolldown.config.js', 'rolldown.config.mjs'],
    },
    skills: [],
  },
  {
    id: 'esbuild',
    name: 'esbuild',
    detect: {
      packages: ['esbuild'],
    },
    skills: [],
  },
  {
    id: 'webpack',
    name: 'webpack',
    detect: {
      packages: ['webpack'],
      configFiles: [
        'webpack.config.js',
        'webpack.config.cjs',
        'webpack.config.mjs',
        'webpack.config.ts',
      ],
    },
    skills: [],
  },
  {
    id: 'rspack',
    name: 'Rspack',
    detect: {
      packages: ['@rspack/core', '@rspack/cli'],
      configFiles: [
        'rspack.config.ts',
        'rspack.config.js',
        'rspack.config.mjs',
        'rspack.config.cjs',
      ],
    },
    skills: [],
  },

  // Developer tooling — Python and multi-language builds
  {
    id: 'uv',
    name: 'uv',
    detect: {
      configFiles: ['uv.lock'],
      configFileContent: {
        files: ['pyproject.toml'],
        patterns: ['[tool.uv]', '[tool.uv.sources]', '[tool.uv.workspace]'],
      },
    },
    skills: [],
  },
  {
    id: 'poetry',
    name: 'Poetry',
    detect: {
      configFiles: ['poetry.lock'],
      configFileContent: {
        files: ['pyproject.toml'],
        patterns: ['[tool.poetry]', '[tool.poetry.dependencies]'],
      },
    },
    skills: [],
  },
  {
    id: 'ruff',
    name: 'Ruff',
    detect: {
      configFiles: ['ruff.toml', '.ruff.toml'],
      pythonPackages: ['ruff'],
      configFileContent: {
        files: ['pyproject.toml'],
        patterns: ['[tool.ruff]', '[tool.ruff.lint]', '[tool.ruff.format]'],
      },
    },
    skills: ['github/awesome-copilot/ruff-recursive-fix'],
  },
  {
    id: 'bazel',
    name: 'Bazel',
    detect: {
      configFiles: ['MODULE.bazel', 'WORKSPACE.bazel', 'WORKSPACE', '.bazelrc', 'BUILD.bazel'],
    },
    skills: ['ccheney/robust-skills/bazel'],
  },
  // Additional ecosystem detections. Each entry keeps an empty skills list until a
  // specific skill has been vetted for it.
  {
    id: 'preact',
    name: 'Preact',
    detect: {
      packages: ['preact', 'preact-render-to-string'],
    },
    skills: ['av/skills/preact-buildless-frontend'],
  },
  {
    id: 'lit',
    name: 'Lit',
    detect: {
      packages: ['lit', 'lit-element', '@lit/react'],
    },
    skills: [],
  },
  {
    id: 'qwik',
    name: 'Qwik',
    detect: {
      packages: ['@builder.io/qwik', '@builder.io/qwik-city'],
    },
    skills: [],
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    detect: {
      packages: ['@sveltejs/kit'],
    },
    skills: ['spences10/svelte-skills-kit/sveltekit-structure'],
  },
  {
    id: 'tanstack-form',
    name: 'TanStack Form',
    detect: {
      packages: [
        '@tanstack/react-form',
        '@tanstack/vue-form',
        '@tanstack/solid-form',
        '@tanstack/form-core',
      ],
    },
    skills: [],
  },
  {
    id: 'tanstack-table',
    name: 'TanStack Table',
    detect: {
      packages: [
        '@tanstack/react-table',
        '@tanstack/vue-table',
        '@tanstack/solid-table',
        '@tanstack/table-core',
      ],
    },
    skills: [],
  },
  {
    id: 'unocss',
    name: 'UnoCSS',
    detect: {
      packages: ['unocss', '@unocss/vite'],
      configFiles: ['uno.config.ts', 'uno.config.js', 'uno.config.mjs'],
    },
    skills: ['antfu/skills/unocss'],
  },
  {
    id: 'chakra-ui',
    name: 'Chakra UI',
    detect: {
      packages: ['@chakra-ui/react'],
    },
    skills: [],
  },
  {
    id: 'fastify',
    name: 'Fastify',
    detect: {
      packages: ['fastify'],
    },
    skills: ['mcollina/skills/fastify'],
  },
  {
    id: 'adonisjs',
    name: 'AdonisJS',
    detect: {
      packages: ['@adonisjs/core'],
      configFiles: ['adonisrc.ts', 'adonisrc.js'],
    },
    skills: [],
  },
  {
    id: 'authjs',
    name: 'Auth.js',
    detect: {
      packages: ['next-auth', '@auth/core', '@auth/sveltekit', '@auth/express'],
    },
    skills: [],
  },
  {
    id: 'grpc',
    name: 'gRPC',
    detect: {
      packages: ['@grpc/grpc-js', '@grpc/proto-loader'],
      pythonPackages: ['grpcio', 'grpcio-tools'],
      goModules: ['google.golang.org/grpc'],
    },
    skills: [],
  },
  {
    id: 'deno',
    name: 'Deno',
    detect: {
      configFiles: ['deno.json', 'deno.jsonc'],
    },
    skills: ['denoland/skills/deno'],
  },
  {
    id: 'pulumi',
    name: 'Pulumi',
    detect: {
      packages: ['@pulumi/pulumi'],
      pythonPackages: ['pulumi'],
      configFiles: ['Pulumi.yaml', 'Pulumi.yml'],
    },
    skills: ['pulumi/agent-skills/pulumi-component'],
  },
  {
    id: 'sst',
    name: 'SST',
    detect: {
      packages: ['sst'],
      configFiles: ['sst.config.ts', 'sst.config.js'],
    },
    skills: ['zxkane/aws-skills/aws-sst-development'],
  },
  {
    id: 'gitlab-ci',
    name: 'GitLab CI/CD',
    detect: {
      configFiles: ['.gitlab-ci.yml', '.gitlab-ci.yaml'],
    },
    skills: ['akin-ozer/cc-devops-skills/gitlab-ci-generator'],
  },
  {
    id: 'google-cloud',
    name: 'Google Cloud',
    detect: {
      pythonPackages: [
        'google-cloud-storage',
        'google-cloud-bigquery',
        'google-cloud-pubsub',
        'google-cloud-aiplatform',
      ],
      packagePatterns: [/^@google-cloud\//],
    },
    skills: ['rominirani/antigravity-skills/always-verify-gcp'],
  },
  {
    id: 'capacitor',
    name: 'Capacitor',
    detect: {
      packages: ['@capacitor/core', '@capacitor/cli'],
      configFiles: ['capacitor.config.ts', 'capacitor.config.js', 'capacitor.config.json'],
    },
    skills: [],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL (JS/Python)',
    detect: {
      packages: ['pg', 'postgres'],
      pythonPackages: ['psycopg', 'psycopg2', 'psycopg2-binary', 'asyncpg', 'pg8000'],
    },
    skills: [
      'github/awesome-copilot/postgresql-code-review',
      'github/awesome-copilot/postgresql-optimization',
    ],
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB clients',
    detect: {
      packages: ['mysql2', 'mysql'],
      pythonPackages: ['pymysql', 'mysql-connector-python', 'aiomysql'],
    },
    skills: ['planetscale/database-skills/mysql'],
  },
  {
    id: 'duckdb',
    name: 'DuckDB',
    detect: {
      packages: ['duckdb', '@duckdb/node-api'],
      pythonPackages: ['duckdb'],
    },
    skills: [],
  },
  {
    id: 'polars',
    name: 'Polars',
    detect: {
      packages: ['nodejs-polars'],
      pythonPackages: ['polars'],
    },
    skills: ['yonesuke/skills/polars'],
  },
  {
    id: 'clickhouse',
    name: 'ClickHouse',
    detect: {
      packages: ['@clickhouse/client'],
      pythonPackages: ['clickhouse-connect', 'clickhouse-driver'],
    },
    skills: ['clickhouse/agent-skills/clickhouse-architecture-advisor'],
  },
  {
    id: 'qdrant',
    name: 'Qdrant',
    detect: {
      packages: ['@qdrant/js-client-rest'],
      pythonPackages: ['qdrant-client'],
    },
    skills: [
      'github/awesome-copilot/qdrant-clients-sdk',
      'github/awesome-copilot/qdrant-deployment-options',
      'github/awesome-copilot/qdrant-model-migration',
      'github/awesome-copilot/qdrant-monitoring',
      'github/awesome-copilot/qdrant-performance-optimization',
      'github/awesome-copilot/qdrant-scaling',
      'github/awesome-copilot/qdrant-search-quality',
      'github/awesome-copilot/qdrant-version-upgrade',
    ],
  },
  {
    id: 'bullmq',
    name: 'BullMQ',
    detect: {
      packages: ['bullmq'],
    },
    skills: [],
  },
  {
    id: 'temporal',
    name: 'Temporal',
    detect: {
      packages: ['@temporalio/client', '@temporalio/worker', '@temporalio/workflow'],
      pythonPackages: ['temporalio'],
    },
    skills: ['temporalio/skill-temporal-developer/skill-temporal-developer'],
  },
  {
    id: 'inngest',
    name: 'Inngest',
    detect: {
      packages: ['inngest'],
    },
    skills: [],
  },
  {
    id: 'trigger-dev',
    name: 'Trigger.dev',
    detect: {
      packages: ['@trigger.dev/sdk'],
    },
    skills: ['triggerdotdev/skills/trigger-setup'],
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    detect: {
      packages: ['@langchain/langgraph'],
      pythonPackages: ['langgraph'],
    },
    skills: ['langchain-ai/deepagents/langgraph-docs'],
  },
  {
    id: 'pydantic-ai',
    name: 'Pydantic AI',
    detect: {
      pythonPackages: ['pydantic-ai', 'pydantic-ai-slim'],
    },
    skills: [],
  },
  {
    id: 'openai-agents',
    name: 'OpenAI Agents SDK',
    detect: {
      packages: ['@openai/agents', '@openai/agents-core'],
      pythonPackages: ['openai-agents'],
    },
    skills: [],
  },
  {
    id: 'mastra',
    name: 'Mastra',
    detect: {
      packages: ['@mastra/core'],
    },
    skills: ['mastra-ai/skills/mastra'],
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex',
    detect: {
      packages: ['llamaindex', '@llamaindex/core'],
      pythonPackages: ['llama-index', 'llama-index-core'],
    },
    skills: [],
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    detect: {
      pythonPackages: ['litellm'],
    },
    skills: [],
  },
  {
    id: 'opentelemetry',
    name: 'OpenTelemetry',
    detect: {
      packages: ['@opentelemetry/api', '@opentelemetry/sdk-node', '@opentelemetry/sdk-trace-node'],
      pythonPackages: ['opentelemetry-api', 'opentelemetry-sdk'],
    },
    skills: ['confident-ai/deepeval/deepeval-otel'],
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    detect: {
      packages: ['langfuse', '@langfuse/tracing'],
      pythonPackages: ['langfuse'],
    },
    skills: ['langfuse/skills/langfuse'],
  },
  {
    id: 'msw',
    name: 'Mock Service Worker',
    detect: {
      packages: ['msw'],
    },
    skills: ['pymodel/react-frontend-skills/msw'],
  },
  // UI, tooling, platform, and manifest-based ecosystem coverage.
  {
    id: 'ink',
    name: 'Ink',
    detect: {packages: ['ink', 'ink-select-input', '@inkjs/ui']},
    skills: [],
  },
  {
    id: 'radix-ui',
    name: 'Radix UI',
    detect: {packages: ['radix-ui'], packagePatterns: [/^@radix-ui\/react-/]},
    skills: [],
  },
  {
    id: 'recharts',
    name: 'Recharts',
    detect: {packages: ['recharts']},
    skills: [],
  },
  {
    id: 'd3',
    name: 'D3',
    detect: {packages: ['d3'], packagePatterns: [/^d3-/]},
    skills: [],
  },
  {
    id: 'codemirror',
    name: 'CodeMirror',
    detect: {packages: ['codemirror'], packagePatterns: [/^@codemirror\//]},
    skills: [],
  },
  {
    id: 'monaco-editor',
    name: 'Monaco Editor',
    detect: {packages: ['monaco-editor', '@monaco-editor/react']},
    skills: [],
  },
  {
    id: 'remark',
    name: 'remark / rehype / unified',
    detect: {
      packages: ['remark', 'rehype', 'unified'],
      packagePatterns: [/^(?:remark|rehype|mdast-util|hast-util|unist-util)-/],
    },
    skills: [],
  },
  {
    id: 'workos',
    name: 'WorkOS',
    detect: {
      packages: [
        '@workos-inc/node',
        '@workos-inc/authkit-react',
        '@workos-inc/authkit-nextjs',
        '@workos-inc/widgets',
      ],
      pythonPackages: ['workos'],
    },
    skills: [],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    detect: {
      packages: ['better-sqlite3', 'sqlite3', 'sqlite', '@libsql/client'],
      pythonPackages: ['aiosqlite', 'libsql-experimental'],
    },
    skills: [],
  },
  {
    id: 'google-genai',
    name: 'Google Gen AI',
    detect: {packages: ['@google/genai'], pythonPackages: ['google-genai']},
    skills: ['google-gemini/gemini-skills/gemini-api-dev'],
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    detect: {
      packages: ['@mendable/firecrawl-js'],
      pythonPackages: ['firecrawl-py'],
    },
    skills: ['firecrawl/cli/firecrawl'],
  },
  {
    id: 'ava',
    name: 'AVA',
    detect: {
      packages: ['ava'],
      configFiles: ['ava.config.js', 'ava.config.cjs', 'ava.config.mjs'],
    },
    skills: [],
  },
  {
    id: 'xo',
    name: 'XO',
    detect: {
      packages: ['xo'],
      configFiles: ['xo.config.js', 'xo.config.mjs', 'xo.config.cjs', 'xo.config.ts'],
    },
    skills: [],
  },
  {
    id: 'rollup',
    name: 'Rollup',
    detect: {
      packages: ['rollup'],
      packagePatterns: [/^@rollup\/plugin-/, /^rollup-plugin-/],
      configFiles: [
        'rollup.config.js',
        'rollup.config.mjs',
        'rollup.config.cjs',
        'rollup.config.ts',
      ],
    },
    skills: [],
  },
  {
    id: 'babel',
    name: 'Babel',
    detect: {
      packages: ['@babel/core', 'babel-jest'],
      packagePatterns: [/^@babel\/(?:plugin|preset)-/, /^babel-(?:plugin|preset)-/],
      configFiles: [
        '.babelrc',
        '.babelrc.json',
        '.babelrc.js',
        '.babelrc.cjs',
        'babel.config.js',
        'babel.config.cjs',
        'babel.config.mjs',
        'babel.config.json',
      ],
    },
    skills: [],
  },
  {
    id: 'nodemon',
    name: 'nodemon',
    detect: {
      packages: ['nodemon'],
      configFiles: ['nodemon.json', '.nodemon.json'],
    },
    skills: [],
  },
  {
    id: 'knip',
    name: 'Knip',
    detect: {
      packages: ['knip'],
      configFiles: [
        'knip.json',
        'knip.jsonc',
        'knip.ts',
        'knip.js',
        'knip.config.ts',
        'knip.config.js',
        '.knip.json',
        '.knip.jsonc',
      ],
    },
    skills: ['webpro/skills/configure-knip'],
  },
  {
    id: 'typedoc',
    name: 'TypeDoc',
    detect: {
      packages: ['typedoc'],
      configFiles: [
        'typedoc.json',
        'typedoc.jsonc',
        'typedoc.config.js',
        'typedoc.config.cjs',
        'typedoc.config.mjs',
      ],
    },
    skills: [],
  },
  {
    id: 'nix',
    name: 'Nix',
    detect: {fileExtensions: ['.nix']},
    skills: ['devon-systems/hoenn/nix'],
  },
  {
    id: 'qml',
    name: 'QML',
    detect: {configFiles: ['qmldir'], fileExtensions: ['.qml']},
    skills: [],
  },
  {
    id: 'vala',
    name: 'Vala',
    detect: {fileExtensions: ['.vala', '.vapi']},
    skills: [],
  },
  {
    id: 'meson',
    name: 'Meson',
    detect: {
      configFiles: ['meson.build', 'meson_options.txt', 'meson.options'],
    },
    skills: [],
  },
  {
    id: 'supercollider',
    name: 'SuperCollider',
    detect: {fileExtensions: ['.scd']},
    skills: [],
  },
  {
    id: 'lua',
    name: 'Lua',
    detect: {fileExtensions: ['.lua']},
    skills: [],
  },
  {
    id: 'haskell',
    name: 'Haskell',
    detect: {
      fileExtensions: ['.hs', '.lhs', '.cabal'],
      configFiles: ['cabal.project', 'stack.yaml'],
    },
    skills: [],
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    detect: {fileExtensions: ['.ps1', '.psm1', '.psd1']},
    skills: [],
  },
  {
    id: 'fish',
    name: 'Fish',
    detect: {
      configFiles: ['.config/fish/config.fish'],
      fileExtensions: ['.fish'],
    },
    skills: [],
  },
  {
    id: 'zsh',
    name: 'Zsh',
    detect: {configFiles: ['.zshrc', '.zshenv'], fileExtensions: ['.zsh']},
    skills: [],
  },
  {
    id: 'batch',
    name: 'Windows batch',
    detect: {fileExtensions: ['.bat', '.cmd']},
    skills: ['github/awesome-copilot/batch-files'],
  },
  {
    id: 'jinja',
    name: 'Jinja',
    detect: {
      pythonPackages: ['jinja2'],
      fileExtensions: ['.jinja', '.jinja2', '.j2'],
    },
    skills: [],
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    detect: {packages: ['obsidian', 'obsidian-plugin-cli']},
    skills: ['laude-institute/headlong/obsidian'],
  },
  {
    id: 'userscripts',
    name: 'Userscripts',
    detect: {packages: ['vite-plugin-monkey'], fileExtensions: ['.user.js']},
    skills: [],
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    detect: {
      pythonPackages: ['homeassistant'],
      configFileContent: {
        files: ['config.yaml', 'config.yml', 'config.json'],
        patterns: [/^\s*["']?(?:hassio_api|homeassistant_api)["']?\s*:\s*true\b/m],
        stripComments: 'hash',
      },
    },
    skills: [],
  },
  {
    id: 'cmake',
    name: 'CMake',
    detect: {configFiles: ['CMakeLists.txt', 'CMakePresets.json']},
    skills: [],
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    detect: {elixirPackages: ['phoenix']},
    skills: ['georgeguimaraes/elixir-agent-tools/phoenix'],
  },
  {
    id: 'symfony',
    name: 'Symfony',
    detect: {composerPackages: ['symfony/framework-bundle', 'symfony/symfony']},
    skills: ['smnandre/symfony-ux-skills/symfony-ux'],
  },
  {
    id: 'gin',
    name: 'Gin',
    detect: {goModules: ['github.com/gin-gonic/gin']},
    skills: [],
  },
  {
    id: 'go-graphql',
    name: 'Go GraphQL',
    detect: {goModules: ['github.com/99designs/gqlgen', 'github.com/graph-gophers/graphql-go']},
    skills: ['samber/cc-skills-golang/golang-graphql'],
  },
  {
    id: 'go-grpc',
    name: 'Go gRPC',
    detect: {goModules: ['google.golang.org/grpc']},
    skills: ['samber/cc-skills-golang/golang-grpc'],
  },
  {
    id: 'google-wire',
    name: 'Google Wire',
    detect: {goModules: ['github.com/google/wire']},
    skills: ['samber/cc-skills-golang/golang-google-wire'],
  },
  {
    id: 'uber-dig',
    name: 'Uber Dig',
    detect: {goModules: ['go.uber.org/dig']},
    skills: ['samber/cc-skills-golang/golang-uber-dig'],
  },
  {
    id: 'uber-fx',
    name: 'Uber Fx',
    detect: {goModules: ['go.uber.org/fx']},
    skills: ['samber/cc-skills-golang/golang-uber-fx'],
  },
  {
    id: 'samber-do',
    name: 'samber/do',
    detect: {goModules: ['github.com/samber/do', 'github.com/samber/do/v2']},
    skills: ['samber/cc-skills-golang/golang-samber-do'],
  },
  {
    id: 'samber-hot',
    name: 'samber/hot',
    detect: {goModules: ['github.com/samber/hot']},
    skills: ['samber/cc-skills-golang/golang-samber-hot'],
  },
  {
    id: 'samber-lo',
    name: 'samber/lo',
    detect: {goModules: ['github.com/samber/lo']},
    skills: ['samber/cc-skills-golang/golang-samber-lo'],
  },
  {
    id: 'samber-mo',
    name: 'samber/mo',
    detect: {goModules: ['github.com/samber/mo']},
    skills: ['samber/cc-skills-golang/golang-samber-mo'],
  },
  {
    id: 'samber-oops',
    name: 'samber/oops',
    detect: {goModules: ['github.com/samber/oops']},
    skills: ['samber/cc-skills-golang/golang-samber-oops'],
  },
  {
    id: 'samber-ro',
    name: 'samber/ro',
    detect: {goModules: ['github.com/samber/ro']},
    skills: ['samber/cc-skills-golang/golang-samber-ro'],
  },
  {
    id: 'samber-slog',
    name: 'samber/slog',
    detect: {
      goModules: [
        'github.com/samber/slog-multi',
        'github.com/samber/slog-sampling',
        'github.com/samber/slog-formatter',
      ],
    },
    skills: ['samber/cc-skills-golang/golang-samber-slog'],
  },
  {
    id: 'cobra',
    name: 'Cobra',
    detect: {goModules: ['github.com/spf13/cobra']},
    skills: ['samber/cc-skills-golang/golang-spf13-cobra'],
  },
  {
    id: 'viper',
    name: 'Viper',
    detect: {goModules: ['github.com/spf13/viper']},
    skills: ['samber/cc-skills-golang/golang-spf13-viper'],
  },
  {
    id: 'swagger',
    name: 'Swagger',
    detect: {
      goModules: [
        'github.com/swaggo/swag',
        'github.com/swaggo/gin-swagger',
        'github.com/swaggo/echo-swagger',
        'github.com/swaggo/http-swagger',
        'github.com/swaggo/files',
      ],
    },
    skills: ['samber/cc-skills-golang/golang-swagger'],
  },
  {
    id: 'testify',
    name: 'Testify',
    detect: {goModules: ['github.com/stretchr/testify']},
    skills: ['samber/cc-skills-golang/golang-stretchr-testify'],
  },
  {
    id: 'axum',
    name: 'Axum',
    detect: {rustCrates: ['axum']},
    skills: [],
  },
];

// ── Combo Skills Map (cross-technology) ──────────────────────

export const COMBO_SKILLS_MAP: ComboSkill[] = [
  {
    id: 'react-hook-form-zod',
    name: 'React Hook Form + Zod',
    requires: ['react-hook-form', 'zod'],
    skills: ['pproenca/dot-skills/zod'],
  },
  {
    id: 'nextjs-supabase',
    name: 'Next.js + Supabase',
    requires: ['nextjs', 'supabase'],
    skills: ['supabase/agent-skills/supabase-postgres-best-practices'],
  },
  {
    id: 'react-native-expo',
    name: 'React Native + Expo',
    requires: ['react-native', 'expo'],
    skills: ['expo/skills/expo-native-ui', 'sleekdotdesign/agent-skills/design-mobile-apps'],
  },
  {
    id: 'nextjs-vercel-ai',
    name: 'Next.js + Vercel AI SDK',
    requires: ['nextjs', 'vercel-ai'],
    skills: ['vercel/ai/use-ai-sdk'],
  },
  {
    id: 'nextjs-playwright',
    name: 'Next.js + Playwright',
    requires: ['nextjs', 'playwright'],
    skills: ['currents-dev/playwright-best-practices-skill/playwright-best-practices'],
  },
  {
    id: 'react-shadcn',
    name: 'React + shadcn/ui',
    requires: ['react', 'shadcn'],
    skills: ['shadcn/ui/shadcn', 'vercel-labs/agent-skills/react-best-practices'],
  },
  {
    id: 'tailwind-shadcn',
    name: 'Tailwind CSS + shadcn/ui',
    requires: ['tailwind', 'shadcn'],
    skills: ['secondsky/claude-skills/tailwind-v4-shadcn'],
  },
  {
    id: 'gsap-react',
    name: 'GSAP + React',
    requires: ['gsap', 'react'],
    skills: ['greensock/gsap-skills/gsap-react'],
  },
  {
    id: 'cloudflare-vite',
    name: 'Cloudflare + Vite',
    requires: ['cloudflare', 'vite'],
    skills: ['cloudflare/vinext/migrate-to-vinext'],
  },
  {
    id: 'node-express',
    name: 'Node.js + Express',
    requires: ['node', 'express'],
    skills: ['aj-geddes/useful-ai-prompts/nodejs-express-server'],
  },
  {
    id: 'nextjs-clerk',
    name: 'Next.js + Clerk',
    requires: ['nextjs', 'clerk'],
    skills: ['clerk/skills/clerk-nextjs-patterns'],
  },
  {
    id: 'nuxt-clerk',
    name: 'Nuxt + Clerk',
    requires: ['nuxt', 'clerk'],
    skills: ['clerk/skills/clerk-nuxt-patterns'],
  },
  {
    id: 'vue-clerk',
    name: 'Vue + Clerk',
    requires: ['vue', 'clerk'],
    skills: ['clerk/skills/clerk-vue-patterns'],
  },
  {
    id: 'react-clerk',
    name: 'React + Clerk',
    requires: ['react', 'clerk'],
    skills: ['clerk/skills/clerk-react-patterns'],
  },
  {
    id: 'astro-clerk',
    name: 'Astro + Clerk',
    requires: ['astro', 'clerk'],
    skills: ['clerk/skills/clerk-astro-patterns'],
  },
  {
    id: 'expo-clerk',
    name: 'Expo + Clerk',
    requires: ['expo', 'clerk'],
    skills: ['clerk/skills/clerk-expo'],
  },
  {
    id: 'react-react-three-fiber',
    name: 'React + React Three Fiber',
    requires: ['threejs', 'react', '@react-three/fiber'],
    skills: ['vercel-labs/json-render/react-three-fiber'],
  },
  {
    id: 'react-router-clerk',
    name: 'React Router + Clerk',
    requires: ['react-router', 'clerk'],
    skills: [
      'clerk/skills/clerk-react-router-patterns',
      'clerk/skills/clerk-setup',
      'clerk/skills/clerk',
    ],
  },
  {
    id: 'tanstack-clerk',
    name: 'TanStack Start + Clerk',
    requires: ['tanstack-start', 'clerk'],
    skills: [
      'clerk/skills/clerk-tanstack-patterns',
      'clerk/skills/clerk-setup',
      'clerk/skills/clerk',
    ],
  },
  {
    id: 'chrome-extension-clerk',
    name: 'Chrome Extension + Clerk',
    requires: ['chrome-extension', 'clerk'],
    skills: [
      'clerk/skills/clerk-chrome-extension-patterns',
      'clerk/skills/clerk-setup',
      'clerk/skills/clerk',
    ],
  },
  {
    id: 'swiftui-clerk',
    name: 'SwiftUI + Clerk',
    requires: ['swiftui', 'clerk'],
    skills: ['clerk/skills/clerk-swift', 'clerk/skills/clerk-setup', 'clerk/skills/clerk'],
  },
  {
    id: 'android-clerk',
    name: 'Android + Clerk',
    requires: ['android', 'clerk'],
    skills: ['clerk/skills/clerk-android', 'clerk/skills/clerk-setup', 'clerk/skills/clerk'],
  },
  {
    id: 'rails-rspec',
    name: 'Ruby on Rails + RSpec',
    requires: ['rails', 'rspec'],
    skills: ['igmarin/rails-agent-skills/plan-tests', 'igmarin/ruby-core-skills/triage-bug'],
  },
  {
    id: 'rails-sidekiq',
    name: 'Ruby on Rails + Sidekiq',
    requires: ['rails', 'sidekiq'],
    skills: [],
  },
  {
    id: 'react-tanstack-query',
    name: 'React + TanStack Query',
    requires: ['react', 'tanstack-query'],
    skills: [],
  },
  {
    id: 'react-zustand',
    name: 'React + Zustand',
    requires: ['react', 'zustand'],
    skills: [],
  },
  {
    id: 'nextjs-trpc',
    name: 'Next.js + tRPC',
    requires: ['nextjs', 'trpc'],
    skills: [],
  },
  {
    id: 'nextjs-prisma',
    name: 'Next.js + Prisma',
    requires: ['nextjs', 'prisma'],
    skills: [],
  },
  {
    id: 'nextjs-drizzle',
    name: 'Next.js + Drizzle',
    requires: ['nextjs', 'drizzle'],
    skills: [],
  },
  {
    id: 'fastapi-sqlalchemy',
    name: 'FastAPI + SQLAlchemy',
    requires: ['fastapi', 'sqlalchemy'],
    skills: [],
  },
  {
    id: 'django-celery',
    name: 'Django + Celery',
    requires: ['django', 'celery'],
    skills: [],
  },
  {
    id: 'docker-node',
    name: 'Docker + Node.js',
    requires: ['docker', 'node'],
    skills: [],
  },
  {
    id: 'docker-python',
    name: 'Docker + Python',
    requires: ['docker', 'python'],
    skills: [],
  },
  {
    id: 'terraform-azure',
    name: 'Terraform + Azure',
    requires: ['terraform', 'azure'],
    skills: ['github/awesome-copilot/terraform-azurerm-set-diff-analyzer'],
  },
];

// ── Frontend Detection ────────────────────────────────────────

export const FRONTEND_PACKAGES = new Set<string>([
  'react-dom',
  'vue',
  'svelte',
  'astro',
  'next',
  '@angular/core',
  'solid-js',
  'lit',
  'preact',
  'nuxt',
  '@sveltejs/kit',
]);

export const FRONTEND_BONUS_SKILLS: string[] = [
  'anthropics/skills/frontend-design',
  'addyosmani/web-quality-skills/accessibility',
  'addyosmani/web-quality-skills/seo',
];

// ── Agent Folder Map ─────────────────────────────────────────

interface AgentFolderMap {
  [key: string]: string;
}

export const AGENT_FOLDER_MAP: AgentFolderMap = {
  '.claude': 'claude-code',
  '.pi': 'pi',
  '.cline': 'cline',
  '.junie': 'junie',
  '.codebuddy': 'codebuddy',
  '.continue': 'continue',
  '.kiro': 'kiro-cli',
};

export const WEB_FRONTEND_EXTENSIONS = new Set<string>([
  '.vue',
  '.svelte',
  '.astro',
  '.twig',
  '.ejs',
  '.hbs',
  '.pug',
  '.njk',
]);
