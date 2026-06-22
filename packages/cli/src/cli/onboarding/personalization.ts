import type { LLMProvider } from '../../../../../src/llm/types.ts';
import { loadConfig, saveConfig } from '../../../../../src/config/config.ts';
import type { CortexConfig, UserProfile } from '../../../../../src/config/config.ts';
import { i18n } from '../../../../../src/i18n/service.ts';

export interface QuestionContext {
  previousQuestions: string[];
  previousAnswers: string[];
  inferredInfo: Record<string, string>;
}

const SYSTEM_PROMPT =
  `You are conducting a brief, friendly onboarding questionnaire for a new Cortex user.

## Your Mission
Understand the user well enough to personalize their Cortex experience.

## Guidelines
- Be warm, genuine, and curious
- Use natural language, avoid corporate speak
- Reference previous answers to show you're listening
- Ask ONE clear, open-ended question at a time
- Maximum 5 questions total
- Stop early if you have solid understanding

## Response Format
Return a JSON object (and only JSON, no other text):
{
  "nextQuestion": "question text" or null if done,
  "reasoning": "why you're asking",
  "extractedInfo": {
    "role": "extracted role or null",
    "primaryUseCase": "extracted use case or null",
    "experienceLevel": "beginner|intermediate|expert or null",
    "preferredWorkflow": "CLI-focused|UI-preferred|hybrid or null",
    "domains": ["tech1", "tech2"] or []
  },
  "confidence": 0.0-1.0,
  "shouldStop": true/false
}`;

async function generateNextQuestion(
  context: QuestionContext,
  provider: LLMProvider,
  model: string,
): Promise<
  { nextQuestion: string | null; extractedInfo: Partial<UserProfile>; shouldStop: boolean } | null
> {
  const conversationContext = context.previousQuestions.map((q, i) => {
    const a = context.previousAnswers[i] ?? '';
    return `Q: ${q}\nA: ${a}`;
  }).join('\n\n');

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content:
        `Previous conversation:\n${conversationContext}\n\nBased on this context, determine the next question to ask or stop if you have enough information. Return only JSON.`,
    },
  ];

  try {
    const result = await provider.complete({ messages, model });
    const content = result.content;
    const jsonStr = typeof content === 'string'
      ? content
      : (content as unknown as Array<{ text: string }>).map((c) => c.text).join('');
    const parsed = JSON.parse(jsonStr);

    return {
      nextQuestion: parsed.nextQuestion ?? null,
      extractedInfo: parsed.extractedInfo ?? {},
      shouldStop: parsed.shouldStop ?? false,
    };
  } catch {
    return null;
  }
}

async function generateInitialQuestion(
  provider: LLMProvider,
  model: string,
): Promise<string | null> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content:
        'Start the onboarding conversation. Ask a warm opening question to learn about the user.',
    },
  ];

  try {
    const result = await provider.complete({ messages, model });
    const content = result.content;
    const jsonStr = typeof content === 'string'
      ? content
      : (content as unknown as Array<{ text: string }>).map((c) => c.text).join('');
    const parsed = JSON.parse(jsonStr);
    return parsed.nextQuestion ?? null;
  } catch {
    return i18n.t('cli.setup.fallbackQuestion1');
  }
}

function shouldContinueQuestioning(
  profile: Partial<UserProfile>,
  questionCount: number,
  maxQuestions: number,
): boolean {
  if (questionCount >= maxQuestions) return false;
  const populated = [
    profile.role,
    profile.primaryUseCase,
    profile.experienceLevel,
    profile.domains && profile.domains.length > 0 ? true : null,
  ].filter(Boolean).length;
  return populated < 3;
}

export async function runAIQuestionnaire(
  provider: LLMProvider,
  model: string,
  maxQuestions = 4,
  askFn?: (question: string, qNum: number) => Promise<string>,
): Promise<UserProfile | null> {
  const context: QuestionContext = {
    previousQuestions: [],
    previousAnswers: [],
    inferredInfo: {},
  };

  const profile: Partial<UserProfile> = {};
  let questionCount = 0;

  const firstQuestion = await generateInitialQuestion(provider, model);
  if (!firstQuestion) return null;

  context.previousQuestions.push(firstQuestion);

  while (questionCount < maxQuestions) {
    const question = questionCount === 0 ? firstQuestion : null;

    let currentQuestion = question;
    if (!currentQuestion && questionCount > 0) {
      const next = await generateNextQuestion(context, provider, model);
      if (!next) break;
      if (next.shouldStop || !next.nextQuestion) {
        if (next.extractedInfo) Object.assign(profile, next.extractedInfo);
        break;
      }
      currentQuestion = next.nextQuestion;
      if (next.extractedInfo) Object.assign(profile, next.extractedInfo);
      context.previousQuestions.push(currentQuestion);
    }

    if (!currentQuestion) break;

    let answer: string;
    if (askFn) {
      answer = await askFn(currentQuestion, questionCount + 1);
    } else {
      answer = '';
    }

    context.previousAnswers.push(answer);
    questionCount++;
  }

  profile.completed = true;
  profile.timestamp = new Date().toISOString();

  const userProfile: UserProfile = {
    role: profile.role || '',
    primaryUseCase: profile.primaryUseCase || '',
    experienceLevel: profile.experienceLevel || '',
    preferredWorkflow: profile.preferredWorkflow || '',
    domains: profile.domains || [],
    additionalContext: profile.additionalContext || '',
    completed: true,
    timestamp: profile.timestamp || new Date().toISOString(),
  };

  return userProfile;
}

export async function runAIQuestionnaireInteractive(
  provider: LLMProvider,
  model: string,
  maxQuestions = 4,
): Promise<UserProfile | null> {
  return runAIQuestionnaire(provider, model, maxQuestions, async (question, qNum) => {
    const { Input } = await import('@cliffy/prompt');
    const answer = await Input.prompt({
      message: i18n.t('cli.setup.input.aiQuestion', { num: qNum, question }),
    });
    return answer;
  });
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const config = await loadConfig();
  const updated = {
    ...config,
    userProfile: profile,
    onboarding: {
      ...(config as unknown as Record<string, unknown>).onboarding as Record<string, unknown> ??
        {} as Record<string, unknown>,
      completed: false,
      skippedSteps: [] as string[],
      version: '1.0',
    },
  } as CortexConfig;
  await saveConfig(updated);
}

export function getUserProfileSummary(profile: UserProfile): string {
  const lines: string[] = [];
  if (profile.role) lines.push(`  • ${i18n.t('cli.setup.profile.label.role')}${profile.role}`);
  if (profile.primaryUseCase) {
    lines.push(`  • ${i18n.t('cli.setup.profile.label.useCase')}${profile.primaryUseCase}`);
  }
  if (profile.experienceLevel) {
    lines.push(`  • ${i18n.t('cli.setup.profile.label.experience')}${profile.experienceLevel}`);
  }
  if (profile.domains && profile.domains.length > 0) {
    lines.push(`  • ${i18n.t('cli.setup.profile.label.domains')}${profile.domains.join(', ')}`);
  }
  return lines.join('\n');
}
