export {
  decayScore,
  deleteVectorRecords,
  type EpisodicEntry,
  type MemoryHit,
  retrieve,
  searchByVector,
  searchEpisodic,
  searchSemantic,
  type SemanticEntry,
  writeEpisodic,
  writeSemantic,
} from './store.ts';

export {
  getActiveBackend,
  listBackends,
  type MemoryBackend,
  registerMemoryBackend,
} from './backends.ts';

export {
  blobToVector,
  buildEmbedder,
  cosineSimilarity,
  type EmbeddingProvider,
  type EmbeddingVector,
  vectorToBlob,
} from './embeddings.ts';

export {
  buildMemoryVectorStore,
  getMemoryVectorStore,
  type MemoryVectorStore,
  type VectorMemoryHit,
  type VectorMemoryRecord,
} from './vector_backends.ts';

export { injectMemory } from './inject.ts';

export {
  addRelation,
  extractAndStoreEntities,
  findDuplicateEntities,
  getGraphData,
  type GraphData,
  type GraphEdge,
  type GraphEntity,
  type GraphHit,
  type GraphNode,
  type GraphRelation,
  mergeEntities,
  type RelationType,
  searchEntities,
  traverseGraph,
  upsertEntity,
} from './graph.ts';

export {
  runConsolidation,
  runDailyConsolidation,
  runHourlyConsolidation,
  runWeeklyConsolidation,
  seedConsolidationJobs,
} from './consolidate.ts';

export {
  autoCategorize,
  autoTagUntaggedMemories,
  boostImportanceFromAccess,
  CATEGORY_RULES,
  getMemoryHealth,
  recordAccess,
  recordBatchAccess,
  runHeuristicCycle,
  slowDecayForFrequentAccess,
  strengthenCoOccurringEntities,
} from './heuristics.ts';

export { defineTerm, getCategories, listTerms, lookupTerm } from './glossary.ts';

export {
  buildPreferenceContext,
  clearPreferences,
  generatePreferenceReport,
  getPreference,
  getPreferencesByCategory,
  getPreferencesByConfidence,
  learnFromCorrection,
  observePreference,
  type PreferenceCategory,
  type PreferenceObservation,
  type PreferenceReport,
  type UserPreference,
} from './preference-learner.ts';

export {
  enforceMemoryRetention,
  getPrivacyPolicy,
  type MemoryPrivacyPolicy,
  redactPII,
  setPrivacyPolicy,
} from './privacy.ts';

export {
  type ContextConflict,
  getContextConflicts,
  getLinkedSessions,
  getSessionLinks,
  type LinkedSession,
  linkSessions,
  listSharedContext,
  readSharedContext,
  resolveContextConflict,
  type SharedContext,
  unlinkSessions,
  writeSharedContext,
} from './cross-agent-context.ts';

export {
  type AggregatedContext,
  bridgeSessionContext,
  type ContextBridgeResult,
  type SessionContext,
} from './context-bridge.ts';

export {
  buildSkillEmbeddingIndex,
  computeSkillFreshness,
  deduplicateExtractedSkill,
  degradeSkill,
  deleteSkill,
  deleteSkills,
  deprecateSkill,
  extractSkillFromSession,
  filterReliableSkills,
  findMatchingSkills,
  findSimilarSkills,
  formatSkillDetail,
  formatSkillsAsAvailableList,
  formatSkillsForPrompt,
  getSkillByName,
  getSkillDependencies,
  getSkillDependents,
  getSkillHealth,
  getSkillStats,
  listSkills,
  loadHumanSkills,
  mergeSkill,
  promoteSkill,
  recordSkillFailure,
  recordSkillSuccess,
  registerBuiltinSkills,
  runSkillHealthMaintenance,
  setLifecycle,
  type Skill,
  type SkillLifecycle,
  type SkillMetadata,
  type SkillStep,
  storeSkill,
  touchSkill,
} from './skills.ts';
