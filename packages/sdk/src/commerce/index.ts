// @t2000/sdk commerce — seller onboarding, headless (S.1158).
export { CommerceClient } from './client.js';
export {
  fetchChallengeNonce,
  profileChallengeMessage,
  serviceChallengeMessage,
  servicePayloadSha256,
  signChallenge,
} from './challenge.js';
export { endpointIssueLines, listEndpoint, removeEndpoint } from './endpoint.js';
export { createPackage, planPackage } from './package.js';
export {
  MAX_TIER_BASE_LENGTH,
  packageBaseSlug,
  packageTierSlugs,
  parseServiceTierSlug,
  SERVICE_SLUG_RE,
  slugify,
  trimDashes,
} from './package-slug.js';
export { ensureCategory, parseAgentCategory, updateProfile } from './profile.js';
export { registerAgent } from './register.js';
export { agentResolveUrl, getAgentProfile, resolveAgentRef } from './resolve.js';
export { retireService, serviceUpsertPayload, upsertService } from './service.js';
export { AGENT_CATEGORIES, SERVICE_TIERS } from './types.js';
export type {
  AgentCategory,
  AgentProfile,
  AgentRef,
  CommerceClientOptions,
  CreatePackageInput,
  CreatePackageResult,
  EndpointIssue,
  EndpointListing,
  EndpointRoute,
  PackageTierInput,
  ProfileUpdateInput,
  RegisterResult,
  ServiceTier,
  ServiceUpsertInput,
  ServiceWriteResult,
} from './types.js';
