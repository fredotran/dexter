import { readFileSync } from 'fs';
import matter from 'gray-matter';
import type { Skill, SkillSource } from './types.js';

const MAX_NAME_LENGTH = 256;
const MAX_DESC_LENGTH = 2048;

/**
 * Parse a SKILL.md file content into a Skill object.
 * Extracts YAML frontmatter (name, description) and the markdown body (instructions).
 *
 * @param content - Raw file content
 * @param path - Absolute path to the file (for reference)
 * @param source - Where this skill came from
 * @returns Parsed Skill object
 * @throws Error if required frontmatter fields are missing
 */
export function parseSkillFile(content: string, path: string, source: SkillSource): Skill {
  const { data, content: instructions } = matter(content);

  // Validate required frontmatter fields
  if (!data.name || typeof data.name !== 'string' || data.name.length > MAX_NAME_LENGTH) {
    throw new Error(`Skill name must be 1-${MAX_NAME_LENGTH} characters`);
  }
  if (!data.description || typeof data.description !== 'string' || data.description.length > MAX_DESC_LENGTH) {
    throw new Error(`Skill description must be 1-${MAX_DESC_LENGTH} characters`);
  }

  return {
    name: data.name,
    description: data.description,
    path,
    source,
    instructions: instructions.trim(),
  };
}

/**
 * Load a skill from a file path.
 *
 * @param path - Absolute path to the SKILL.md file
 * @param source - Where this skill came from
 * @returns Parsed Skill object
 * @throws Error if file cannot be read or parsed
 */
export function loadSkillFromPath(path: string, source: SkillSource): Skill {
  const content = readFileSync(path, 'utf-8');
  return parseSkillFile(content, path, source);
}

/**
 * Extract just the metadata from a skill file without loading full instructions.
 * Used for lightweight discovery at startup.
 *
 * @param path - Absolute path to the SKILL.md file
 * @param source - Where this skill came from
 * @returns Skill metadata (name, description, path, source)
 */
export function extractSkillMetadata(path: string, source: SkillSource): { name: string; description: string; path: string; source: SkillSource } {
  const content = readFileSync(path, 'utf-8');
  const { data } = matter(content);

  if (!data.name || typeof data.name !== 'string' || data.name.length > MAX_NAME_LENGTH) {
    throw new Error(`Skill name must be 1-${MAX_NAME_LENGTH} characters`);
  }
  if (!data.description || typeof data.description !== 'string' || data.description.length > MAX_DESC_LENGTH) {
    throw new Error(`Skill description must be 1-${MAX_DESC_LENGTH} characters`);
  }

  return {
    name: data.name,
    description: data.description,
    path,
    source,
  };
}
