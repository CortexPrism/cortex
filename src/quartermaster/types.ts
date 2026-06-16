import type { ToolCallRequest, ToolCallResult } from '../tools/types.ts';
import type { MetaAssessment } from '../agent/metacog.ts';
import type { ReflectionResult } from '../agent/reflect.ts';

export interface QmPattern {
  id: string;
  toolSequence: string[];
  contextFingerprint: Record<string, number>;
  hitCount: number;
  successCount: number;
  avgConfidence: number;
  lastUsed: string;
  createdAt: string;
}

export interface QmSignalWeight {
  signalName: string;
  weight: number;
  confidenceFloor: number;
  updatedAt: string;
}

export interface ToolPrediction {
  confidence: number;
  suggestedTool: string;
  suggestedArgs?: Record<string, unknown>;
  mode: 'automate' | 'suggest' | 'defer';
  signals: { name: string; contributed: number }[];
}

export interface ToolObservation {
  turnId: string;
  sessionId: string;
  toolCall: ToolCallRequest;
  toolResult: ToolCallResult;
  toolIndex: number;
  totalToolsInTurn: number;
}

export interface PredictionContext {
  turnId: string;
  sessionId: string;
  userMessage: string;
  toolCall?: ToolCallRequest;
  assessment?: MetaAssessment;
  recentToolCalls: string[];
  toolCallIndex: number;
  totalToolsInTurn: number;
}

export interface ReflectionFeedback {
  sessionId: string;
  turnId: string;
  reflection: ReflectionResult;
  actualToolCalls: string[];
}

export interface QmDecision {
  id: string;
  turnId: string;
  sessionId: string;
  mode: 'automate' | 'suggest' | 'defer';
  predictedTool: string | null;
  actualTool: string | null;
  confidence: number;
  signalsUsed: { name: string; contributed: number }[];
  wasCorrect: number | null;
  createdAt: string;
}

export interface QmToolStat {
  toolName: string;
  totalCalls: number;
  successfulCalls: number;
  avgDurationMs: number;
  lastError: string | null;
  lastUsed: string | null;
}

export interface QmSessionState {
  sessionId: string;
  observationCount: number;
  predictionCount: number;
  correctCount: number;
  mode: 'observe' | 'active';
}

export interface SignalScores {
  trajectory: { tool: string; score: number }[];
  episodic: { tool: string; score: number }[];
  toolStats: { tool: string; score: number }[];
  taskContext: { tool: string; score: number }[];
  reflection: { tool: string; score: number }[];
}

export const OBSERVE_THRESHOLD = 50;
export const AUTOMATE_CONFIDENCE = 0.9;
export const SUGGEST_CONFIDENCE = 0.6;

export const AUTOMATE_SAFE_TOOLS = new Set([
  'file_read',
  'file_list',
  'shell_git_status',
  'shell_git_diff',
  'shell_git_log',
  'grep',
  'glob',
  'memory_search',
]);

export const INITIAL_LEARNING_RATE = 0.1;
export const LEARNING_RATE_DECAY = 0.98;
