/**
 * What the agent's greeting says about the agent itself, for the About tab. The greeting is the
 * first message on every socket; an agent that does not say a thing leaves it unknown (an older
 * agent says none of this), and unknown is never filled in with a guess.
 *
 * Field names, for the agent to add to its greeting: `agent_version` and `os`.
 */
import { createValueStore, type ValueStore } from '@/lib/value-store';
import { agentPlatformCandidates, type AgentPlatform } from '@/lib/agent-download';

export interface AgentFacts {
  version?: string;
  os?: string;
}

export const agentFacts: ValueStore<AgentFacts> = createValueStore<AgentFacts>('agent-facts', {});

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function readGreetingFacts(greeting: Record<string, unknown>): AgentFacts {
  const facts: AgentFacts = {};
  const version: string | undefined = text(greeting.agent_version);
  const os: string | undefined = text(greeting.os);
  if (version !== undefined) facts.version = version;
  if (os !== undefined) facts.os = os;
  return facts;
}

const NAMES: Readonly<Record<string, string>> = { macos: 'macOS', darwin: 'macOS', windows: 'Windows', linux: 'Linux' };

function fromPlatform(platform: AgentPlatform | undefined): string {
  if (platform === undefined) return 'Unknown';
  return platform.startsWith('macos') ? 'macOS' : platform.startsWith('windows') ? 'Windows' : 'Linux';
}

/**
 * The agent's operating system. The agent's own word wins. Without it, this browser's: the
 * agent only talks to a page on its own machine, so they are the same computer.
 */
export function osLabel(facts: AgentFacts, nav: Navigator = navigator): string {
  if (facts.os !== undefined) return NAMES[facts.os.toLowerCase()] ?? facts.os;
  return fromPlatform(agentPlatformCandidates(nav)[0]);
}
