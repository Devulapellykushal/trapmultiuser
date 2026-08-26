/**
 * Auth Module Exports
 */

export { authService } from './auth.service';
export type { User, LoginRequest, LoginResponse, RegisterRequest, AuthCapabilities, BusinessMembership, CreateBusinessRequest } from './auth.service';

export { useAuthStore } from './auth.store';
export { usePlatformAuthStore } from './platform-auth.store';
export { useAuth } from './useAuth';
export {
  getAuthScopeFromPath,
  loginPathForScope,
  portalPathForScope,
  type AuthScope,
} from './session-scope';
export {
  sessionReasonMessage,
  IDLE_TIMEOUT_MS,
  type SessionEndReason,
} from './session-lifecycle';
