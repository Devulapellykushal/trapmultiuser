/**
 * Auth Module Exports
 */

export { authService } from './auth.service';
export type { User, LoginRequest, LoginResponse, RegisterRequest, AuthCapabilities } from './auth.service';

export { useAuthStore } from './auth.store';
export { usePlatformAuthStore } from './platform-auth.store';
export { useAuth } from './useAuth';
export {
  getAuthScopeFromPath,
  loginPathForScope,
  portalPathForScope,
  type AuthScope,
} from './session-scope';
