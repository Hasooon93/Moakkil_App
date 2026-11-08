/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/types/database.types.ts
 * الوصف: واجهات قاعدة البيانات الـ 15 جدولاً مطابقة لـ داتا موكل.txt و worker.js V5.4.0
 * ============================================================================
 */

export type UserRole = 'super_admin' | 'superadmin' | 'admin' | 'lawyer' | 'assistant' | 'accountant' | string;

export interface UserPermissions {
  view_finance?: boolean;
  manage_cases?: boolean;
  delete_records?: boolean;
  manage_clients?: boolean;
  manage_agenda?: boolean;
  view_reports?: boolean;
  use_ai?: boolean;
  [key: string]: boolean | undefined;
}

/** 1. جدول الكيانات والمكاتب القانونية: mo_firms */
export interface MoFirm {
  id: string;
  firm_name: string;
  subscription_plan?: string | null;
  subscription_end_date?: string | null;
  max_users: number;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  address?: string | null;
  contact_phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
  footer_text?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  mo_users?: Array<{ count?: number } & Partial<MoUser>>;
}

/** 2. جدول الموظفين والكوادر البشرية: mo_users */
export interface MoUser {
  id: string;
  firm_id: string | null;
  full_name: string;
  phone: string;
  email?: string | null;
  role: UserRole;
  job_title?: string | null;
  national_id?: string | null;
  bar_number?: string | null;
  specialization?: string | null;
  bio?: string | null;
  qualifications?: string | null;
  experience_years?: number | null;
  languages?: string | null;
  linkedin_url?: string | null;
  salary?: number | string | null;
  hire_date?: string | null;
  contract_type?: string | null;
  telegram_id?: string | null;
  avatar_url?: string | null;
  id_card_url?: string | null;
  license_card_url?: string | null;
  contract_file_url?: string | null;
  cv_file_url?: string | null;
  permissions?: UserPermissions | string | null;
  is_active?: boolean;
  last_login?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** 3. جدول الموكلين: mo_clients */
export interface MoClient {
  id: string;
  firm_id: string;
  name: string;
  national_id?: string | null;
  phone: string;
  phone_secondary?: string | null;
  email?: string | null;
  address?: string | null;
  nationality?: string | null;
  client_type?: string | null;
  company_registration_no?: string | null;
  tax_number?: string | null;
  representative_name?: string | null;
  notes?: string | null;
  id_card_url?: string | null;
  poa_number?: string | null;
  poa_date?: string | null;
  poa_court?: string | null;
  poa_type?: string | null;
  poa_file_url?: string | null;
  telegram_id?: string | null;
  is_vip?: boolean | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** 4. جدول القضايا: mo_cases */
export interface MoCase {
  id: string;
  firm_id: string;
  client_id?: string | null;
  assigned_to?: string | null;
  case_number: string;
  internal_ref?: string | null;
  title: string;
  case_type?: string | null;
  case_category?: string | null;
  court_name?: string | null;
  court_department?: string | null;
  judge_name?: string | null;
  client_capacity?: string | null;
  opponent_name?: string | null;
  opponent_lawyer?: string | null;
  opponent_phone?: string | null;
  opponent_address?: string | null;
  opponent_national_id?: string | null;
  subject?: string | null;
  description?: string | null;
  legal_basis?: string | null;
  status?: string | null;
  stage?: string | null;
  priority?: string | null;
  claim_amount?: number | string | null;
  total_fee?: number | string | null;
  paid_amount?: number | string | null;
  remaining_amount?: number | string | null;
  payment_terms?: string | null;
  filing_date?: string | null;
  judgment_date?: string | null;
  judgment_summary?: string | null;
  execution_number?: string | null;
  execution_court?: string | null;
  execution_status?: string | null;
  archive_number?: string | null;
  archive_location?: string | null;
  /**
   * ⚠️ ملاحظة أمنية: يتم حذف هذين الحقلين في استجابات القوائم العامة (/api/cases)
   * ويظهران فقط عند جلب قضية محددة بـ id=eq.X أو عبر /api/cases/portal-credentials
   */
  client_portal_token?: string | null;
  client_pin?: string | null;
  portal_enabled?: boolean | null;
  missing_docs_request?: string | null;
  require_signature?: boolean | null;
  signature_doc_title?: string | null;
  client_signature_url?: string | null;
  signed_at?: string | null;
  ai_summary?: string | null;
  ai_risk_score?: number | null;
  tags?: string[] | null;
  created_at?: string;
  updated_at?: string;
  mo_clients?: Partial<MoClient> | null;
  mo_users?: Partial<MoUser> | null;
  mo_sessions?: MoSession[];
  mo_installments?: MoInstallment[];
  mo_expenses?: MoExpense[];
  mo_files?: MoFile[];
  mo_case_updates?: MoCaseUpdate[];
}

/** 5. جدول جلسات المحاكم: mo_sessions */
export interface MoSession {
  id: string;
  firm_id: string;
  case_id: string;
  assigned_to?: string | null;
  session_date: string;
  session_time?: string | null;
  court_name?: string | null;
  hall_number?: string | null;
  judge_name?: string | null;
  session_type?: string | null;
  requirements?: string | null;
  what_happened?: string | null;
  next_step?: string | null;
  next_session_date?: string | null;
  status?: string | null;
  reminder_sent?: boolean | null;
  attachment_url?: string | null;
  created_at?: string;
  updated_at?: string;
  mo_cases?: Partial<MoCase> | null;
}

/** 6. جدول المواعيد: mo_appointments */
export interface MoAppointment {
  id: string;
  firm_id: string;
  client_id?: string | null;
  case_id?: string | null;
  assigned_to?: string | null;
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
  appointment_date: string;
  appointment_time?: string | null;
  duration_minutes?: number | null;
  location?: string | null;
  appointment_type?: string | null;
  notes?: string | null;
  status?: string | null;
  reminder_sent?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/** 7. جدول المهام الإدارية والقانونية: mo_tasks */
export interface MoTask {
  id: string;
  firm_id: string;
  case_id?: string | null;
  client_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  title: string;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  completed_at?: string | null;
  attachment_url?: string | null;
  created_at?: string;
  updated_at?: string;
  mo_cases?: Partial<MoCase> | null;
  mo_users?: Partial<MoUser> | null;
}

/** 8. جدول الأتعاب والدفعات المالية (سندات القبض): mo_installments */
export interface MoInstallment {
  id: string;
  firm_id: string;
  case_id?: string | null;
  client_id?: string | null;
  receipt_number?: string | null;
  title?: string | null;
  amount: number | string;
  due_date?: string | null;
  paid_date?: string | null;
  payment_method?: string | null;
  reference_number?: string | null;
  bank_name?: string | null;
  is_paid?: boolean;
  status?: string | null;
  notes?: string | null;
  receipt_file_url?: string | null;
  collected_by?: string | null;
  created_at?: string;
  updated_at?: string;
  mo_cases?: Partial<MoCase> | null;
  mo_clients?: Partial<MoClient> | null;
}

/** 9. جدول المصاريف والرسوم القضائية: mo_expenses */
export interface MoExpense {
  id: string;
  firm_id: string;
  case_id?: string | null;
  client_id?: string | null;
  category?: string | null;
  title: string;
  amount: number | string;
  expense_date: string;
  payment_method?: string | null;
  receipt_number?: string | null;
  is_refundable_from_client?: boolean | null;
  is_refunded?: boolean | null;
  paid_by?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
  created_at?: string;
  updated_at?: string;
  mo_cases?: Partial<MoCase> | null;
}

/** 10. جدول الأرشيف والمستندات السحابية: mo_files */
export interface MoFile {
  id: string;
  firm_id: string;
  case_id?: string | null;
  client_id?: string | null;
  uploaded_by?: string | null;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  file_size?: number | null;
  category?: string | null;
  description?: string | null;
  is_visible_to_client?: boolean | null;
  ocr_text?: string | null;
  created_at?: string;
}

/** 11. جدول التحديثات الزمنية للقضية: mo_case_updates */
export interface MoCaseUpdate {
  id: string;
  firm_id: string;
  case_id: string;
  created_by?: string | null;
  update_type?: string | null;
  title?: string | null;
  description: string;
  is_visible_to_client?: boolean | null;
  attachment_url?: string | null;
  created_at?: string;
}

/** 12. جدول السجل الجنائي والأمني: mo_activity_logs */
export interface MoActivityLog {
  id: string;
  firm_id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  device_id?: string | null;
  severity?: string | null;
  created_at: string;
  /** حقول مولدة من الذكاء الاصطناعي في Worker V5.4.0 */
  _human_log?: string;
  _changes_list?: string[];
  details?: string | Record<string, unknown>;
}

/** 13. جدول البصمات الحيوية (WebAuthn): mo_biometrics */
export interface MoBiometric {
  id: string;
  user_id: string;
  firm_id?: string | null;
  credential_id: string;
  public_key: string;
  public_key_spki?: string | null;
  algorithm?: number | null;
  counter?: number | null;
  device_name?: string | null;
  transports?: string[] | null;
  last_used_at?: string | null;
  created_at?: string;
}

/** 14. جدول اشتراكات الإشعارات الفورية: mo_push_subscriptions */
export interface MoPushSubscription {
  id: string;
  user_id: string;
  firm_id?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_id?: string | null;
  user_agent?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** 15. جدول المكتبة القانونية والعقل القانوني: legal_brain */
export interface LegalBrainItem {
  id: string;
  firm_id?: string | null;
  category: string;
  sub_category?: string | null;
  title: string;
  law_number?: string | null;
  law_year?: number | string | null;
  article_number?: string | null;
  content: string;
  summary?: string | null;
  keywords?: string[] | string | null;
  template_variables?: string[] | null;
  source_reference?: string | null;
  court_level?: string | null;
  ruling_date?: string | null;
  is_public?: boolean | null;
  is_template?: boolean | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}
