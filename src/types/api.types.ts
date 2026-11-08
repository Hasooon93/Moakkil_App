/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/types/api.types.ts
 * الوصف: واجهات عقود الـ API وطابور العمل دون اتصال (Offline Queue & Zero-Trust Contracts)
 * ============================================================================
 */

import { MoCase, MoCaseUpdate, MoClient, MoFile, MoFirm, MoInstallment, MoSession, MoUser } from './database.types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface OfflineQueueItem {
  id: number;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  body: Record<string, unknown> | null;
  timestamp: string;
  uid: string;
  firm_id: string | null;
}

export interface OfflineSavedResponse<T = Record<string, unknown>> {
  offline: true;
  message: string;
  tempData: T[];
}

export interface RequestOtpResponse {
  status?: 'OTP_SENT' | 'SUCCESS';
  token?: string;
  user?: MoUser;
  firm?: MoFirm;
  message?: string;
  error?: string;
}

export interface VerifyOtpResponse {
  status?: 'SUCCESS';
  token: string;
  user: MoUser;
  firm?: MoFirm;
  error?: string;
}

export interface WebAuthnChallengeResponse {
  challenge: string;
  credential_ids?: string[];
  rpId?: string;
  error?: string;
}

export interface ActionMfaVerifyPayload {
  method: 'otp' | 'biometric';
  action_type: string;
  target_table: string;
  target_id: string;
  code?: string;
  credential_id?: string;
  challenge?: string;
  authenticatorData?: string;
  clientDataJSON?: string;
  signature?: string;
}

export interface ActionMfaVerifyResponse {
  status?: string;
  action_token: string;
  expires_in?: number;
  error?: string;
}

export interface PortalPinVerifyResponse {
  status?: string;
  verified?: boolean;
  portal_session_token: string;
  expires_in?: number;
  error?: string;
}

export interface PortalClientDataResponse {
  case: MoCase;
  firm?: Partial<MoFirm>;
  client?: Partial<MoClient>;
  sessions?: MoSession[];
  updates?: MoCaseUpdate[];
  installments?: MoInstallment[];
  files?: MoFile[];
  error?: string;
}

export interface VerifyDocumentResponse {
  valid?: boolean;
  type?: 'receipt' | 'cv' | 'legacy_receipt';
  firm?: Partial<MoFirm>;
  receipt?: MoInstallment & { client_name?: string; case_number?: string; case_title?: string };
  staff?: Partial<MoUser>;
  case?: Partial<MoCase>;
  client?: Partial<MoClient>;
  error?: string;
}
