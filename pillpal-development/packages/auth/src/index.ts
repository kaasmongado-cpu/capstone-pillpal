export {
  getAuthApiUrl,
  getStoredAuthToken,
  setStoredAuthToken,
  clearStoredAuthToken,
} from "./client.js";

export {
  signUp,
  signIn,
  signOut,
  getSession,
  getUser,
  updatePassword,
  setInitialPassword,
  sendVerificationOtp,
  verifyEmailOtp,
  resetPasswordWithOtp,
  verifyProviderInvite,
  completeProviderInvite,
  getAuthProviders,
  getGoogleAuthUrl,
  exchangeOAuthCode,
  completePatientProfile,
  type AuthUser,
  type AuthSession,
  type AuthError,
} from "./auth.js";
