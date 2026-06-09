export const DEFAULT_GENERATION_SKILL_NAME = "frontend-design";
export const MAX_GENERATION_SKILL_CONTENT_BYTES = 100 * 1024;

export interface BuiltinGenerationSkill {
  source: "builtin";
  name: typeof DEFAULT_GENERATION_SKILL_NAME;
}

export interface GithubGenerationSkill {
  source: "github";
  name: string;
  sourceUrl: string;
  content: string;
  fetchedAt: string;
}

export type GenerationSkill = BuiltinGenerationSkill | GithubGenerationSkill;

export const BUILTIN_FRONTEND_DESIGN_SKILL_CONTENT = `Create production-grade frontend interfaces with a clear visual direction.

Use the generated app as the real first screen, not a marketing explanation. Match the interface to the user's domain and audience, keep workflows ergonomic, and make the result feel intentionally designed.

Use polished typography, restrained but distinctive color, responsive layout, accessible controls, and refined interaction states. Prefer familiar icons for tool actions, stable dimensions for fixed UI surfaces, and concise on-screen text that fits at mobile and desktop sizes.

For websites and games, include relevant visual assets or generated visual elements. Avoid generic purple gradients, decorative blobs, nested cards, overlapping text, and feature-description copy inside the app.`;

export function createDefaultGenerationSkill(): BuiltinGenerationSkill {
  return { source: "builtin", name: DEFAULT_GENERATION_SKILL_NAME };
}

export function normalizeGenerationSkill(value: unknown): GenerationSkill {
  if (isGithubGenerationSkill(value)) {
    return value;
  }

  return createDefaultGenerationSkill();
}

export function generationSkillPromptContent(skill: GenerationSkill): string {
  if (skill.source === "github") {
    return skill.content;
  }

  return BUILTIN_FRONTEND_DESIGN_SKILL_CONTENT;
}

export function isGithubGenerationSkill(value: unknown): value is GithubGenerationSkill {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const skill = value as Partial<GithubGenerationSkill>;

  return (
    skill.source === "github" &&
    isReasonableString(skill.name, 1, 120) &&
    isReasonableString(skill.sourceUrl, 1, 1000) &&
    isReasonableString(skill.content, 1, MAX_GENERATION_SKILL_CONTENT_BYTES) &&
    isReasonableString(skill.fetchedAt, 1, 80)
  );
}

function isReasonableString(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === "string" && value.length >= minLength && value.length <= maxLength;
}
