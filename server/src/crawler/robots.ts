/**
 * Minimal robots.txt fetch + parse.
 *
 * Deliberately not a full RFC implementation — it covers what an audit needs: which
 * paths the crawler-agnostic rules block, and which sitemaps the file declares.
 * Matching follows Google's documented behaviour: `*` is a wildcard, `$` anchors the
 * end, and when Allow and Disallow both match, the longer pattern wins.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsTxt {
  url: string;
  status: number | null;
  /** Raw file, capped — stored so the audit can quote the offending line back. */
  content: string | null;
  rules: RobotsRule[];
  sitemaps: string[];
}

const MAX_CONTENT_CHARS = 20_000;

/** Groups that apply to us: the wildcard agent, plus anything Googlebot-specific. */
function agentApplies(agent: string): boolean {
  const normalised = agent.trim().toLowerCase();
  return normalised === "*" || normalised.startsWith("googlebot");
}

export function parseRobotsTxt(content: string): { rules: RobotsRule[]; sitemaps: string[] } {
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];

  let inApplicableGroup = false;
  // Consecutive User-agent lines share one rule block, so a directive resets this.
  let lastLineWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (field === "user-agent") {
      if (!lastLineWasAgent) inApplicableGroup = false;
      if (agentApplies(value)) inApplicableGroup = true;
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!inApplicableGroup) continue;
    if (field === "disallow" || field === "allow") {
      // "Disallow:" with an empty value means "block nothing" — not a rule.
      if (field === "disallow" && value === "") continue;
      rules.push({ allow: field === "allow", path: value });
    }
  }

  return { rules, sitemaps };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

/**
 * Returns the rule that decides this path, or null when nothing matches.
 * Longest matching pattern wins; Allow beats Disallow on an exact-length tie.
 */
export function matchRobotsRule(rules: RobotsRule[], pathWithQuery: string): RobotsRule | null {
  let winner: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternToRegex(rule.path).test(pathWithQuery)) continue;
    if (
      winner === null ||
      rule.path.length > winner.path.length ||
      (rule.path.length === winner.path.length && rule.allow && !winner.allow)
    ) {
      winner = rule;
    }
  }
  return winner;
}

export function isBlockedByRobots(rules: RobotsRule[], url: string): boolean {
  let pathWithQuery: string;
  try {
    const parsed = new URL(url);
    pathWithQuery = parsed.pathname + parsed.search;
  } catch {
    return false;
  }
  const rule = matchRobotsRule(rules, pathWithQuery);
  return rule !== null && !rule.allow;
}

export async function fetchRobotsTxt(siteUrl: string, timeoutMs: number, userAgent: string): Promise<RobotsTxt> {
  const robotsUrl = new URL("/robots.txt", siteUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(robotsUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": userAgent },
    });

    if (!response.ok) {
      return { url: robotsUrl, status: response.status, content: null, rules: [], sitemaps: [] };
    }

    const content = (await response.text()).slice(0, MAX_CONTENT_CHARS);
    const { rules, sitemaps } = parseRobotsTxt(content);
    return { url: robotsUrl, status: response.status, content, rules, sitemaps };
  } catch {
    // A missing or unreachable robots.txt is a finding, not a crawl failure.
    return { url: robotsUrl, status: null, content: null, rules: [], sitemaps: [] };
  } finally {
    clearTimeout(timer);
  }
}
